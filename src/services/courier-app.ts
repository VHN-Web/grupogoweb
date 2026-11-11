import "server-only";
// App do entregador (/entregador): acesso por link, online/offline, GPS ao vivo, entregas e ganhos.
// O consumidor e a loja acompanham a posição pelo mapa (polling de /api/rastreio e /api/painel/[slug]/frota).
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Courier, Tenant } from "@/db/schema";
import { cleanPing, courierEarning, distanceKm, etaMinutes, isLive, parseDispatch, periodStarts, pickCourier } from "@/core/couriers";
import { appUrl } from "@/lib/urls";
import { openSecret, sealSecret } from "@/lib/secrets";
import { getRegion } from "@/core/region";
import { setOrderStatus, setPaymentStatus } from "@/services/orders";
import { sendPush } from "@/services/push";
import { offerCancelData, offerData, type CourierOffer } from "@/core/courier-native";
import { COURIER_ERRORS, courierPushText, resolveCourierLang, type CourierErrorCode, type CourierLang, type CourierPushKind } from "@/core/courier-i18n";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";

export const courierActor = (id: string) => `courier:${id}`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Link de acesso do entregador (cria na 1ª vez; `renew` invalida o anterior). */
export async function courierAccessLink(c: Courier, renew = false) {
  let token = !renew && c.accessSealed ? openSecret(c.accessSealed) : "";
  if (!token) {
    token = randomBytes(24).toString("base64url");
    await db.update(schema.couriers).set({ accessHash: hash(token), accessSealed: sealSecret(token) }).where(eq(schema.couriers.id, c.id));
    if (renew) await db.delete(schema.crmPushSubs).where(eq(schema.crmPushSubs.actorId, courierActor(c.id)));
  }
  return `${appUrl()}/entregador/acesso/${token}`;
}

/** Entregador dono do token (ativo), com a loja. */
export async function courierByToken(token: string | undefined | null) {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const c = await db.query.couriers.findFirst({ where: eq(schema.couriers.accessHash, hash(token)) });
  if (!c || !c.active) return null;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, c.tenantId) });
  if (!tenant) return null;
  return { courier: c, tenant };
}

export async function setCourierOnline(c: Courier, online: boolean) {
  await db
    .update(schema.couriers)
    .set(online ? { online: true, onlineSince: c.online && c.onlineSince ? c.onlineSince : new Date() } : { online: false, onlineSince: null })
    .where(eq(schema.couriers.id, c.id));
}

/** Ponto do GPS do celular do entregador. Devolve se ainda deve continuar enviando. */
export async function recordPing(c: Courier, body: unknown) {
  const p = cleanPing(body);
  if (!p) return { ok: false as const };
  // ponto com precisão muito ruim (>1,5 km) não substitui um bom recente
  if (p.accuracy != null && p.accuracy > 1500 && isLive(c.lastSeenAt)) return { ok: true as const, online: c.online };
  await db
    .update(schema.couriers)
    .set({ lastLat: p.lat, lastLng: p.lng, lastAccuracy: p.accuracy, lastHeading: p.heading, lastSpeed: p.speed, lastSeenAt: new Date() })
    .where(eq(schema.couriers.id, c.id));
  // entregas esperando motoboy? com a posição nova ele pode ser o mais perto
  if (c.online) await autoAssign(c.tenantId).catch((e) => console.error("[autoAssign]", e));
  return { ok: true as const, online: c.online };
}

const ACTIVE = ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const;

/** Entregas atribuídas ao entregador ainda em andamento. */
export function myActiveDeliveries(c: Courier) {
  return db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, c.tenantId), eq(schema.orders.courierId, c.id), eq(schema.orders.type, "DELIVERY"), inArray(schema.orders.status, [...ACTIVE])),
    with: { items: true },
    orderBy: [schema.orders.createdAt],
  });
}

/** Deliveries da loja sem entregador (em preparo ou prontos) — o entregador online pode pegar. */
export function openDeliveries(c: Courier) {
  return db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, c.tenantId), isNull(schema.orders.courierId), eq(schema.orders.type, "DELIVERY"), eq(schema.orders.marketplaceDelivery, false), inArray(schema.orders.status, ["PREPARING", "READY"])),
    columns: { id: true, number: true, address: true, neighborhood: true, lat: true, lng: true, distanceKm: true, deliveryFeePyg: true, status: true, createdAt: true },
    orderBy: [schema.orders.createdAt],
    limit: 20,
  });
}

/** Erro mostrado ao entregador: o código vira texto no idioma dele (core/courier-i18n.ts#COURIER_ERRORS). */
export class CourierError extends Error {
  constructor(public code: CourierErrorCode) {
    super(COURIER_ERRORS[code].pt);
  }
  text(lang: CourierLang) {
    return COURIER_ERRORS[this.code][lang];
  }
}

async function myOrder(c: Courier, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, c.tenantId)) });
  if (!o || o.type !== "DELIVERY") throw new CourierError("not_found");
  return o;
}

/** Pega uma entrega livre (só online; quem clicar primeiro leva). */
export async function claimDelivery(c: Courier, orderId: string) {
  if (!c.online) throw new CourierError("go_online");
  const [o] = await db
    .update(schema.orders)
    .set({ courierId: c.id, updatedAt: new Date() })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, c.tenantId), isNull(schema.orders.courierId), eq(schema.orders.type, "DELIVERY"), eq(schema.orders.marketplaceDelivery, false), inArray(schema.orders.status, ["PREPARING", "READY"])))
    .returning({ id: schema.orders.id });
  if (!o) throw new CourierError("taken");
}

/** Saiu com o pedido: status "saiu para entrega" — o cliente passa a ver o mapa. */
export async function pickUpDelivery(c: Courier, orderId: string) {
  const o = await myOrder(c, orderId);
  if (o.courierId !== c.id) throw new CourierError("not_yours");
  if (o.status === "CANCELLED" || o.status === "COMPLETED") throw new CourierError("closed");
  if (o.status !== "OUT_FOR_DELIVERY") await setOrderStatus(c.tenantId, o.id, "OUT_FOR_DELIVERY");
  await db.update(schema.orders).set({ pickedUpAt: o.pickedUpAt ?? new Date() }).where(eq(schema.orders.id, o.id));
  if (!c.online) await setCourierOnline(c, true);
}

/** Entregue: conclui o pedido (e marca pago, se ele recebeu na entrega). */
export async function completeDelivery(c: Courier, orderId: string, collected: boolean) {
  const o = await myOrder(c, orderId);
  if (o.courierId !== c.id) throw new CourierError("not_yours");
  if (o.status === "CANCELLED") throw new CourierError("cancelled");
  if (collected && o.paymentStatus !== "PAID") await setPaymentStatus(c.tenantId, o.id, "PAID", `entregador:${c.name}`.slice(0, 60));
  if (o.status !== "COMPLETED") await setOrderStatus(c.tenantId, o.id, "COMPLETED");
  await db.update(schema.orders).set({ deliveredAt: new Date(), pickedUpAt: o.pickedUpAt ?? new Date() }).where(eq(schema.orders.id, o.id));
}

/** Diferença do fuso da loja para UTC, em minutos (ex.: -180). */
function tzOffsetMin(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Ganhos e histórico: hoje, semana, mês + últimas entregas. */
export async function courierEarnings(c: Courier, tenant: Tenant) {
  const tz = getRegion(tenant.country).timeZone;
  const p = periodStarts(new Date(), tzOffsetMin(tz));
  const done = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, c.tenantId), eq(schema.orders.courierId, c.id), eq(schema.orders.status, "COMPLETED"), gte(schema.orders.createdAt, new Date(Math.min(p.month.getTime(), p.week.getTime())))),
    columns: { id: true, number: true, deliveryFeePyg: true, address: true, createdAt: true, deliveredAt: true, distanceKm: true },
    orderBy: desc(schema.orders.createdAt),
  });
  const at = (o: (typeof done)[number]) => (o.deliveredAt ?? o.createdAt).getTime();
  const sum = (from: Date) => {
    const list = done.filter((o) => at(o) >= from.getTime());
    return { count: list.length, total: list.reduce((a, o) => a + courierEarning(o.deliveryFeePyg, c.feePerDelivery), 0), km: Math.round(list.reduce((a, o) => a + (o.distanceKm ?? 0), 0) * 10) / 10 };
  };
  return {
    today: sum(p.day),
    week: sum(p.week),
    month: sum(p.month),
    recent: done.slice(0, 30).map((o) => ({ ...o, earning: courierEarning(o.deliveryFeePyg, c.feePerDelivery) })),
  };
}

/** Idioma do entregador: o que ele escolheu no app ou, sem escolha, o da loja. */
export function courierLang(c: { lang: string | null }, country: string): CourierLang {
  return resolveCourierLang({ saved: c.lang, store: getRegion(country).locale });
}

type PushVars = { number: string | number; store?: string | null; address?: string | null; neighborhood?: string | null; km?: number | null };

/** Avisa o entregador no idioma dele. Com `offer`, o app Android abre a tela cheia da corrida; `cancelOrderId` fecha essa tela. */
export async function notifyCourier(courierId: string, kind: CourierPushKind, v: PushVars, extra?: { offer?: CourierOffer; cancelOrderId?: string }) {
  const c = await db.query.couriers.findFirst({ where: eq(schema.couriers.id, courierId), columns: { lang: true, tenantId: true } });
  if (!c) return 0;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, c.tenantId), columns: { country: true } });
  const { title, body } = courierPushText(courierLang(c, t?.country ?? "BR"), kind, v);
  const data = extra?.offer ? offerData(extra.offer) : extra?.cancelOrderId ? offerCancelData(extra.cancelOrderId) : undefined;
  return sendPush([courierActor(courierId)], { title, body, url: "/entregador", tag: extra?.offer ? `oferta-${extra.offer.orderId}` : `entrega-${courierId}`, icon: "/entregador/icon-192.png", data });
}

/** Avisa os entregadores online da loja que há entrega livre — cada um no seu idioma (com `offer`, vira a tela cheia no app). */
export async function notifyOnlineCouriers(tenantId: string, v: PushVars, offer?: CourierOffer) {
  const [list, t] = await Promise.all([
    db.query.couriers.findMany({ where: and(eq(schema.couriers.tenantId, tenantId), eq(schema.couriers.online, true), eq(schema.couriers.active, true)), columns: { id: true, lang: true } }),
    db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { country: true } }),
  ]);
  const byLang = new Map<CourierLang, string[]>();
  for (const c of list) {
    const l = courierLang(c, t?.country ?? "BR");
    byLang.set(l, [...(byLang.get(l) ?? []), courierActor(c.id)]);
  }
  for (const [lang, ids] of byLang) {
    const { title, body } = courierPushText(lang, "available", v);
    await sendPush(ids, { title, body, url: "/entregador", tag: offer ? `oferta-${offer.orderId}` : `livres-${tenantId}`, icon: "/entregador/icon-192.png", data: offer ? offerData(offer) : undefined });
  }
}

/** Quanto o entregador ganha nesta entrega, formatado na moeda da loja. */
export function courierFeeLabel(deliveryFee: number, feePerDelivery: number, currency: string) {
  return formatMoney(courierEarning(deliveryFee, feePerDelivery), currency as Currency);
}

// ---------------- mapas (consumidor e loja) ----------------

type Pt = { lat: number; lng: number };
const pt = (lat: number | null, lng: number | null): Pt | null => (lat != null && lng != null ? { lat, lng } : null);

/** O que o consumidor vê no mapa do pedido (sem telefone/dados do entregador além do 1º nome). */
export async function trackOrder(orderId: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(orderId)) return null;
  const o = await db.query.orders.findFirst({
    where: eq(schema.orders.id, orderId),
    columns: { id: true, tenantId: true, type: true, status: true, courierId: true, lat: true, lng: true, pickedUpAt: true },
  });
  if (!o || o.type !== "DELIVERY") return null;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, o.tenantId), columns: { lat: true, lng: true, name: true } });
  const c = o.courierId ? await db.query.couriers.findFirst({ where: eq(schema.couriers.id, o.courierId) }) : null;
  const dest = pt(o.lat, o.lng);
  const onTheWay = o.status === "OUT_FOR_DELIVERY";
  const live = !!c && onTheWay && isLive(c.lastSeenAt);
  const courier = live && c ? pt(c.lastLat, c.lastLng) : null;
  const km = courier && dest ? distanceKm(courier, dest) : null;
  return {
    status: o.status,
    store: t ? pt(t.lat, t.lng) : null,
    storeName: t?.name ?? "",
    dest,
    courier: courier && c ? { ...courier, heading: c.lastHeading, name: c.name.split(" ")[0], seenAt: c.lastSeenAt?.toISOString() ?? null } : null,
    courierName: c ? c.name.split(" ")[0] : null,
    km: km != null ? Math.round(km * 10) / 10 : null,
    eta: km != null ? etaMinutes(km, c?.lastSpeed) : null,
    done: o.status === "COMPLETED" || o.status === "CANCELLED",
  };
}

/** Frota ao vivo para o painel da loja: entregadores e entregas em andamento. */
export async function fleet(tenantId: string) {
  const [list, orders, t] = await Promise.all([
    db.query.couriers.findMany({ where: and(eq(schema.couriers.tenantId, tenantId), eq(schema.couriers.active, true)) }),
    db.query.orders.findMany({
      where: and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.type, "DELIVERY"), inArray(schema.orders.status, [...ACTIVE]), ne(schema.orders.status, "RECEIVED")),
      columns: { id: true, number: true, status: true, courierId: true, lat: true, lng: true, address: true, customerName: true },
      orderBy: [schema.orders.createdAt],
      limit: 60,
    }),
    db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { lat: true, lng: true } }),
  ]);
  return {
    store: t ? pt(t.lat, t.lng) : null,
    couriers: list.map((c) => {
      const live = isLive(c.lastSeenAt);
      const mine = orders.filter((o) => o.courierId === c.id);
      return {
        id: c.id,
        name: c.name,
        online: c.online,
        live,
        pos: live ? pt(c.lastLat, c.lastLng) : null,
        heading: c.lastHeading,
        seenAt: c.lastSeenAt?.toISOString() ?? null,
        deliveries: mine.map((o) => o.number),
      };
    }),
    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status, courierId: o.courierId, dest: pt(o.lat, o.lng), address: o.address, customer: o.customerName.split(" ")[0] })),
  };
}

// ---------------- atribuição automática ----------------

const declined = (raw: string | null) => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
};

/**
 * Passa as entregas sem motoboy (em preparo/prontas) para quem está online, com GPS ao vivo,
 * mais perto da loja e com menos entregas. `onlyOrderId` = só aquele pedido.
 * Atômico: só atribui se o pedido ainda estiver sem motoboy.
 */
export async function autoAssign(tenantId: string, onlyOrderId?: string) {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { lat: true, lng: true, dispatchConfig: true, name: true, country: true, currency: true } });
  if (!t) return 0;
  const cfg = parseDispatch(t.dispatchConfig);
  if (!cfg.autoAssign) return 0;
  const pending = await db.query.orders.findMany({
    where: and(
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.type, "DELIVERY"),
      isNull(schema.orders.courierId),
      eq(schema.orders.marketplaceDelivery, false),
      inArray(schema.orders.status, ["PREPARING", "READY"]),
      ...(onlyOrderId ? [eq(schema.orders.id, onlyOrderId)] : []),
    ),
    columns: { id: true, number: true, address: true, neighborhood: true, declinedCourierIds: true, deliveryFeePyg: true },
    orderBy: [schema.orders.createdAt],
    limit: 20,
  });
  if (!pending.length) return 0;
  const [list, loads] = await Promise.all([
    db.query.couriers.findMany({ where: and(eq(schema.couriers.tenantId, tenantId), eq(schema.couriers.active, true), eq(schema.couriers.online, true)) }),
    db
      .select({ id: schema.orders.courierId, n: sql<number>`count(*)` })
      .from(schema.orders)
      .where(and(eq(schema.orders.tenantId, tenantId), inArray(schema.orders.status, [...ACTIVE]), sql`${schema.orders.courierId} is not null`))
      .groupBy(schema.orders.courierId),
  ]);
  if (!list.length) return 0;
  const load = new Map(loads.map((l) => [l.id!, Number(l.n)]));
  const store = t.lat != null && t.lng != null ? { lat: t.lat, lng: t.lng } : null;
  let n = 0;
  for (const o of pending) {
    const cand = list.map((c) => ({ id: c.id, online: c.online, lat: c.lastLat, lng: c.lastLng, seenAt: c.lastSeenAt, load: load.get(c.id) ?? 0 }));
    const best = pickCourier(cand, store, cfg, declined(o.declinedCourierIds));
    if (!best) continue;
    const [ok] = await db
      .update(schema.orders)
      .set({ courierId: best.id, autoAssigned: true, updatedAt: new Date() })
      .where(and(eq(schema.orders.id, o.id), isNull(schema.orders.courierId)))
      .returning({ id: schema.orders.id });
    if (!ok) continue;
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    n++;
    const fee = courierFeeLabel(o.deliveryFeePyg, list.find((c) => c.id === best.id)?.feePerDelivery ?? 0, t.currency);
    await notifyCourier(best.id, "new", { number: o.number, store: t.name, address: o.address, neighborhood: o.neighborhood, km: best.km }, {
      offer: { type: "mine", orderId: o.id, number: o.number, address: o.address, neighborhood: o.neighborhood, km: best.km, fee, store: t.name, auto: true },
    }).catch(() => null);
  }
  return n;
}

/** Entregador recusa uma entrega que o sistema passou para ele: vai para o próximo da fila. */
export async function declineDelivery(c: Courier, orderId: string) {
  const o = await myOrder(c, orderId);
  if (o.courierId !== c.id) throw new CourierError("not_yours");
  if (o.status === "OUT_FOR_DELIVERY" || o.status === "COMPLETED" || o.status === "CANCELLED") throw new CourierError("cannot_decline");
  const list = [...new Set([...declined(o.declinedCourierIds), c.id])];
  await db
    .update(schema.orders)
    .set({ courierId: null, autoAssigned: false, declinedCourierIds: JSON.stringify(list), updatedAt: new Date() })
    .where(and(eq(schema.orders.id, o.id), eq(schema.orders.courierId, c.id)));
  const again = await autoAssign(c.tenantId, o.id);
  if (!again) await notifyOnlineCouriers(c.tenantId, { number: o.number, address: o.address, neighborhood: o.neighborhood, km: o.distanceKm }, { type: "open", orderId: o.id, number: o.number, address: o.address, neighborhood: o.neighborhood, km: o.distanceKm }).catch(() => null);
}

export async function saveDispatchConfig(tenantId: string, cfg: { autoAssign: boolean; maxKm: number; maxLoad: number }) {
  const v = parseDispatch(JSON.stringify(cfg));
  await db.update(schema.tenants).set({ dispatchConfig: JSON.stringify(v) }).where(eq(schema.tenants.id, tenantId));
  if (v.autoAssign) await autoAssign(tenantId);
}
