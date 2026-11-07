import "server-only";
// Crescimento: carteira de clientes, indicação, fidelidade/cashback, avaliação, aniversário e campanhas.
import { and, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Shopper, Tenant } from "@/db/schema";
import {
  addStamp,
  cashbackValue,
  featureOn,
  fillTemplate,
  inSegment,
  makeCode,
  normalizeRef,
  parseGrowth,
  type GrowthConfig,
  type Segment,
} from "@/core/growth";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { getRegion, tr } from "@/core/region";
import { sendWhatsApp } from "@/adapters/notify";
import { tenantPublicUrl } from "@/lib/urls";
import { hasModule } from "@/core/modules";

const isPro = (t: { tier: string }) => t.tier === "pro";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = typeof db | Tx;

export function growthOf(t: Tenant): { cfg: GrowthConfig; pro: boolean } {
  const cfg = parseGrowth(t.growthConfig);
  // Plano personalizado: recurso fora dos módulos contratados fica desligado
  if (!hasModule(t, "divulgacao")) {
    cfg.reviews.enabled = false;
    cfg.directory.enabled = false;
  }
  if (!hasModule(t, "fidelizacao")) for (const k of ["campaigns", "referral", "loyalty", "birthday"] as const) cfg[k].enabled = false;
  return { cfg, pro: isPro(t) };
}

/** WhatsApp automático só quando há integração configurada e a loja não é demonstração. */
export function canAutoSend(t: Tenant) {
  return !!process.env.WHATSAPP_WEBHOOK_URL && !t.demo;
}

// ---------------------------------------------------------------- carteira
async function uniqueRefCode(tx: DbLike, tenantId: string) {
  for (let i = 0; i < 8; i++) {
    const code = makeCode(6);
    const clash = await tx.query.shoppers.findFirst({ where: and(eq(schema.shoppers.tenantId, tenantId), eq(schema.shoppers.refCode, code)), columns: { id: true } });
    if (!clash) return code;
  }
  return makeCode(8);
}

/** Cria ou atualiza o cliente da loja a partir de um pedido (chave = telefone). */
export async function upsertShopper(
  tx: DbLike,
  tenantId: string,
  v: { phone: string; name: string; optIn?: boolean | null; birthday?: string | null; referredBy?: string | null },
): Promise<Shopper> {
  const found = await tx.query.shoppers.findFirst({ where: and(eq(schema.shoppers.tenantId, tenantId), eq(schema.shoppers.phone, v.phone)) });
  if (found) {
    const [u] = await tx
      .update(schema.shoppers)
      .set({
        name: v.name,
        ...(v.birthday ? { birthday: v.birthday } : {}),
        ...(v.optIn === true && !found.marketingOptIn ? { marketingOptIn: true, optInAt: new Date() } : {}),
        ...(v.optIn === false ? { marketingOptIn: false } : {}),
      })
      .where(eq(schema.shoppers.id, found.id))
      .returning();
    return u;
  }
  const [c] = await tx
    .insert(schema.shoppers)
    .values({
      tenantId,
      phone: v.phone,
      name: v.name,
      birthday: v.birthday ?? null,
      marketingOptIn: v.optIn === true,
      optInAt: v.optIn === true ? new Date() : null,
      refCode: await uniqueRefCode(tx, tenantId),
      referredBy: v.referredBy ?? null,
    })
    .returning();
  return c;
}

/** Indicação válida? Só para quem ainda não comprou na loja e não é o próprio indicador. */
export async function resolveReferral(t: Tenant, refRaw: string | null | undefined, phone: string | null | undefined) {
  const { cfg, pro } = growthOf(t);
  const ref = normalizeRef(refRaw);
  if (!ref || !phone || !featureOn(cfg, "referral", pro)) return null;
  const referrer = await db.query.shoppers.findFirst({ where: and(eq(schema.shoppers.tenantId, t.id), eq(schema.shoppers.refCode, ref)) });
  if (!referrer || referrer.phone === phone) return null;
  const me = await db.query.shoppers.findFirst({ where: and(eq(schema.shoppers.tenantId, t.id), eq(schema.shoppers.phone, phone)) });
  if (me) {
    const prev = await db.query.orders.findFirst({
      where: and(eq(schema.orders.tenantId, t.id), eq(schema.orders.shopperId, me.id), ne(schema.orders.status, "CANCELLED")),
      columns: { id: true },
    });
    if (prev) return null; // indicação só vale na primeira compra
  }
  return { referrer, pct: cfg.referral.friendPct };
}

/** Informação pública da indicação (para o banner na loja) — sem expor telefone. */
export async function referralBanner(t: Tenant, refRaw: string | null | undefined) {
  const { cfg, pro } = growthOf(t);
  const ref = normalizeRef(refRaw);
  if (!ref || !featureOn(cfg, "referral", pro)) return null;
  const r = await db.query.shoppers.findFirst({ where: and(eq(schema.shoppers.tenantId, t.id), eq(schema.shoppers.refCode, ref)), columns: { name: true } });
  if (!r) return null;
  return { code: ref, firstName: r.name.split(/\s+/)[0], pct: cfg.referral.friendPct };
}

// ---------------------------------------------------------------- cupons pessoais (recompensas)
export async function personalCoupon(
  tenantId: string,
  shopperId: string,
  purpose: "loyalty" | "cashback" | "referral" | "birthday",
  kind: "PERCENT" | "FIXED",
  value: number,
  days: number,
) {
  const prefix = { loyalty: "FIEL", cashback: "VOLTA", referral: "INDICA", birthday: "NIVER" }[purpose];
  for (let i = 0; i < 6; i++) {
    const code = `${prefix}-${makeCode(5)}`;
    const [c] = await db
      .insert(schema.coupons)
      .values({ tenantId, code, kind, value, maxUses: 1, expiresAt: new Date(Date.now() + days * 864e5), shopperId, purpose })
      .onConflictDoNothing()
      .returning();
    if (c) return c;
  }
  throw new Error("Não foi possível gerar o cupom");
}

function rewardText(t: Tenant, c: schema.Coupon, why: string) {
  const T = tr(getRegion(t.country).locale);
  const off = c.kind === "PERCENT" ? `${c.value}%` : formatMoney(c.value, t.currency as Currency);
  const until = c.expiresAt ? c.expiresAt.toLocaleDateString(getRegion(t.country).locale === "pt" ? "pt-BR" : "es-PY") : "";
  return T(
    `${why} 🎉 Tu cupón de ${off} en ${t.name}: ${c.code} (válido hasta ${until}). Pedí en ${tenantPublicUrl(t)}`,
    `${why} 🎉 Seu cupom de ${off} na ${t.name}: ${c.code} (válido até ${until}). Peça em ${tenantPublicUrl(t)}`,
  );
}

async function deliver(t: Tenant, phone: string, text: string) {
  if (!canAutoSend(t)) return "PENDING" as const;
  const r = await sendWhatsApp(phone, text).catch(() => ({ status: "FAILED" as const }));
  return r.status === "SENT" ? ("SENT" as const) : ("PENDING" as const);
}

// ---------------------------------------------------------------- pedido concluído
/**
 * Chamado quando o pedido é CONCLUÍDO (nunca na criação: pedido cancelado não ganha nada).
 * Roda uma vez só por pedido (orders.growthDone).
 */
export async function onOrderCompleted(tenantId: string, orderId: string) {
  const [o] = await db
    .update(schema.orders)
    .set({ growthDone: true })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId), eq(schema.orders.growthDone, false), eq(schema.orders.status, "COMPLETED")))
    .returning();
  if (!o || !o.shopperId) return;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!t) return;
  const { cfg, pro } = growthOf(t);
  const T = tr(getRegion(t.country).locale);
  const shopper = await db.query.shoppers.findFirst({ where: eq(schema.shoppers.id, o.shopperId) });
  if (!shopper) return;

  // Fidelidade
  if (featureOn(cfg, "loyalty", pro)) {
    if (cfg.loyalty.mode === "stamps") {
      const r = addStamp(shopper.stamps, cfg.loyalty.stamps);
      await db.update(schema.shoppers).set({ stamps: r.stamps }).where(eq(schema.shoppers.id, shopper.id));
      if (r.reward) {
        const c = await personalCoupon(t.id, shopper.id, "loyalty", "PERCENT", cfg.loyalty.rewardPct, 60);
        await deliver(t, shopper.phone, rewardText(t, c, T("¡Completaste tu tarjeta de fidelidad!", "Você completou seu cartão fidelidade!")));
      }
    } else {
      const v = cashbackValue(o.totalPyg, cfg.loyalty.cashbackPct);
      if (v > 0) {
        const c = await personalCoupon(t.id, shopper.id, "cashback", "FIXED", v, 30);
        await deliver(t, shopper.phone, rewardText(t, c, T("¡Ganaste cashback!", "Você ganhou cashback!")));
      }
    }
  }

  // Indique e ganhe: recompensa para quem indicou
  if (o.referrerShopperId && featureOn(cfg, "referral", pro)) {
    const ref = await db.query.shoppers.findFirst({ where: eq(schema.shoppers.id, o.referrerShopperId) });
    if (ref) {
      const c = await personalCoupon(t.id, ref.id, "referral", "PERCENT", cfg.referral.referrerPct, 60);
      await deliver(t, ref.phone, rewardText(t, c, T(`¡${shopper.name.split(" ")[0]} compró con tu recomendación!`, `${shopper.name.split(" ")[0]} comprou com a sua indicação!`)));
    }
  }

  // Pedido de avaliação no Google (no máximo 1 a cada 30 dias por cliente)
  if (featureOn(cfg, "reviews", pro) && cfg.reviews.googleUrl && canAutoSend(t)) {
    const recent = shopper.lastReviewAskAt && Date.now() - shopper.lastReviewAskAt.getTime() < 30 * 864e5;
    if (!recent) {
      await sendWhatsApp(
        shopper.phone,
        T(
          `¡Gracias por tu pedido en ${t.name}, ${shopper.name.split(" ")[0]}! ¿Nos dejás tu opinión en Google? Nos ayuda mucho: ${cfg.reviews.googleUrl}`,
          `Obrigado pelo pedido na ${t.name}, ${shopper.name.split(" ")[0]}! Pode deixar sua avaliação no Google? Ajuda muito a gente: ${cfg.reviews.googleUrl}`,
        ),
      ).catch(() => {});
      await db.update(schema.shoppers).set({ lastReviewAskAt: new Date() }).where(eq(schema.shoppers.id, shopper.id));
    }
  }
}

/** O que mostrar ao cliente na página do pedido (progresso, recompensas, indicação, avaliação). */
export async function orderGrowthView(t: Tenant, o: Order) {
  const { cfg, pro } = growthOf(t);
  if (!o.shopperId) return null;
  const s = await db.query.shoppers.findFirst({ where: eq(schema.shoppers.id, o.shopperId) });
  if (!s) return null;
  const rewards = await db.query.coupons.findMany({
    where: and(eq(schema.coupons.tenantId, t.id), eq(schema.coupons.shopperId, s.id), eq(schema.coupons.active, true), eq(schema.coupons.uses, 0), gte(schema.coupons.expiresAt, new Date())),
    orderBy: desc(schema.coupons.createdAt),
    limit: 3,
  });
  return {
    loyalty: featureOn(cfg, "loyalty", pro) ? { mode: cfg.loyalty.mode, stamps: s.stamps, needed: cfg.loyalty.stamps, rewardPct: cfg.loyalty.rewardPct, cashbackPct: cfg.loyalty.cashbackPct } : null,
    referral: featureOn(cfg, "referral", pro) ? { link: `${tenantPublicUrl(t)}?indicacao=${s.refCode}`, friendPct: cfg.referral.friendPct, referrerPct: cfg.referral.referrerPct } : null,
    review: featureOn(cfg, "reviews", pro) && cfg.reviews.googleUrl ? cfg.reviews.googleUrl : null,
    rewards: rewards.map((c) => ({ code: c.code, purpose: c.purpose, off: c.kind === "PERCENT" ? `${c.value}%` : formatMoney(c.value, t.currency as Currency), until: c.expiresAt })),
  };
}

// ---------------------------------------------------------------- carteira (painel)
export type ShopperRow = Shopper & { orders: number; total: number; lastOrderAt: Date | null };

export async function shopperRows(tenantId: string): Promise<ShopperRow[]> {
  const agg = await db
    .select({
      shopperId: schema.orders.shopperId,
      orders: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.orders.totalPyg}),0)::int`,
      last: sql<Date | string | null>`max(${schema.orders.createdAt})`,
    })
    .from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenantId), isNotNull(schema.orders.shopperId), ne(schema.orders.status, "CANCELLED")))
    .groupBy(schema.orders.shopperId);
  const by = new Map(agg.map((a) => [a.shopperId!, a]));
  const list = await db.query.shoppers.findMany({ where: eq(schema.shoppers.tenantId, tenantId), orderBy: desc(schema.shoppers.createdAt), limit: 5000 });
  return list
    .map((s) => {
      const a = by.get(s.id);
      return { ...s, orders: a?.orders ?? 0, total: a?.total ?? 0, lastOrderAt: a?.last ? new Date(a.last) : null };
    })
    .sort((x, y) => (y.lastOrderAt?.getTime() ?? 0) - (x.lastOrderAt?.getTime() ?? 0));
}

export function segmentRows(rows: ShopperRow[], seg: Segment, optInOnly: boolean) {
  return rows.filter((r) => (!optInOnly || r.marketingOptIn) && inSegment({ orders: r.orders, lastOrderAt: r.lastOrderAt, birthday: r.birthday }, seg));
}

export async function sourceStats(tenantId: string, days = 30) {
  return db
    .select({
      source: sql<string>`coalesce(${schema.orders.source}, 'direto')`,
      orders: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.orders.totalPyg}),0)::int`,
    })
    .from(schema.orders)
    .where(and(eq(schema.orders.tenantId, tenantId), ne(schema.orders.status, "CANCELLED"), gte(schema.orders.createdAt, new Date(Date.now() - days * 864e5))))
    .groupBy(sql`coalesce(${schema.orders.source}, 'direto')`)
    .orderBy(sql`count(*) desc`);
}

/** Recompensas geradas que ainda não foram usadas (para o lojista mandar pelo WhatsApp). */
export async function pendingRewards(tenantId: string) {
  return db
    .select({ coupon: schema.coupons, shopper: schema.shoppers })
    .from(schema.coupons)
    .innerJoin(schema.shoppers, eq(schema.shoppers.id, schema.coupons.shopperId))
    .where(and(eq(schema.coupons.tenantId, tenantId), eq(schema.coupons.uses, 0), eq(schema.coupons.active, true), gte(schema.coupons.expiresAt, new Date())))
    .orderBy(desc(schema.coupons.createdAt))
    .limit(100);
}

// ---------------------------------------------------------------- campanhas
export async function createCampaign(
  t: Tenant,
  v: { name: string; segment: Segment; message: string; couponPct?: number | null; couponDays?: number | null },
) {
  const rows = segmentRows(await shopperRows(t.id), v.segment, true); // só quem autorizou receber ofertas
  let couponCode: string | null = null;
  if (v.couponPct && rows.length) {
    for (let i = 0; i < 6 && !couponCode; i++) {
      const code = `VOLTA${v.couponPct}-${makeCode(4)}`;
      const [c] = await db
        .insert(schema.coupons)
        .values({ tenantId: t.id, code, kind: "PERCENT", value: v.couponPct, maxUses: rows.length, expiresAt: new Date(Date.now() + (v.couponDays ?? 15) * 864e5), purpose: "campaign" })
        .onConflictDoNothing()
        .returning();
      if (c) couponCode = c.code;
    }
  }
  const recipients = rows.slice(0, 1000).map((r) => ({ id: r.id, name: r.name, phone: r.phone }));
  const [c] = await db
    .insert(schema.campaigns)
    .values({ tenantId: t.id, name: v.name, segment: v.segment, message: v.message, couponCode, recipients: JSON.stringify(recipients) })
    .returning();
  return c;
}

export function campaignMessage(t: Tenant, c: schema.Campaign, r: { name: string }) {
  return fillTemplate(c.message, { nome: r.name, loja: t.name, link: `${tenantPublicUrl(t)}?origem=campanha`, cupom: c.couponCode ?? "" });
}

/** Envio automático (só com integração de WhatsApp). Limita a 300 por vez. */
export async function sendCampaign(t: Tenant, c: schema.Campaign) {
  if (!canAutoSend(t)) return { sent: 0 };
  const list = (JSON.parse(c.recipients) as { name: string; phone: string }[]).slice(c.sentCount, c.sentCount + 300);
  let sent = 0;
  for (const r of list) {
    const res = await sendWhatsApp(r.phone, campaignMessage(t, c, r)).catch(() => ({ status: "FAILED" as const }));
    if (res.status === "SENT") sent++;
  }
  await db.update(schema.campaigns).set({ sentCount: c.sentCount + list.length }).where(eq(schema.campaigns.id, c.id));
  return { sent };
}

// ---------------------------------------------------------------- aniversários (cron diário)
export async function runBirthdays(now = new Date()) {
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const year = now.getFullYear();
  const tenants = await db.query.tenants.findMany({ where: and(eq(schema.tenants.tier, "pro"), eq(schema.tenants.suspended, false)) });
  let created = 0;
  for (const t of tenants) {
    const { cfg, pro } = growthOf(t);
    if (!featureOn(cfg, "birthday", pro)) continue;
    const list = await db.query.shoppers.findMany({ where: and(eq(schema.shoppers.tenantId, t.id), eq(schema.shoppers.birthday, mmdd)) });
    for (const s of list) {
      if (s.lastBirthdayYear === year) continue;
      await db.update(schema.shoppers).set({ lastBirthdayYear: year }).where(eq(schema.shoppers.id, s.id));
      const c = await personalCoupon(t.id, s.id, "birthday", "PERCENT", cfg.birthday.pct, 30);
      created++;
      if (s.marketingOptIn) {
        const T = tr(getRegion(t.country).locale);
        await deliver(t, s.phone, rewardText(t, c, T(`¡Feliz cumpleaños, ${s.name.split(" ")[0]}!`, `Feliz aniversário, ${s.name.split(" ")[0]}!`)));
      }
    }
  }
  return { birthdays: created };
}
