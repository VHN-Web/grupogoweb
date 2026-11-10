import "server-only";
// Apps de delivery pelo padrão Open Delivery (99Food, Keeta…). Regras puras em core/opendelivery.ts,
// HTTP em adapters/opendelivery/client.ts. Pedidos dos apps entram no mesmo quadro da loja.
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { OdChannel } from "@/db/schema";
import {
  OD_PLATFORM_INFO,
  actionsForStatus,
  buildMerchant,
  effectOfEvent,
  isOdPlatform,
  mapOdOrder,
  newMerchantId,
  shouldApply,
  splitAddress,
  type MappedOrder,
  type OdMerchantInfo,
  type OdOrder,
  type OdPlatform,
} from "@/core/opendelivery";
import { randomOrderNumber } from "@/core/codes";
import { effectivePrice } from "@/core/intelligence";
import { hasModule } from "@/core/modules";
import type { Currency, OrderStatus } from "@/core/types";
import { OdHttpError, isLocal, odCall, odGetUrl, odToken, type OdCreds } from "@/adapters/opendelivery/client";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";

export class OdError extends Error {}

// ---------------------------------------------------------------- credenciais padrão da GoWeb (Admin)
export type OdPlatformDefaults = { clientId?: string; clientSecretSealed?: string; baseUrl?: string; appId?: string };
export type OdConfig = Partial<Record<OdPlatform, OdPlatformDefaults>>;

export async function odConfig(): Promise<OdConfig> {
  const s = await db.query.platformSettings.findFirst({ columns: { odConfig: true } });
  try {
    return JSON.parse(s?.odConfig ?? "{}") as OdConfig;
  } catch {
    return {};
  }
}

export async function saveOdDefaults(platform: OdPlatform, input: { clientId: string; clientSecret: string; baseUrl: string; appId: string }) {
  const cfg = await odConfig();
  const prev = cfg[platform] ?? {};
  const baseUrl = input.baseUrl ? checkBaseUrl(input.baseUrl) : "";
  cfg[platform] = {
    clientId: input.clientId || undefined,
    clientSecretSealed: input.clientSecret ? sealSecret(input.clientSecret) : input.clientId ? prev.clientSecretSealed : undefined,
    baseUrl: baseUrl || undefined,
    appId: input.appId || undefined,
  };
  const v = JSON.stringify(cfg);
  await db.insert(schema.platformSettings).values({ id: "default", odConfig: v }).onConflictDoUpdate({ target: schema.platformSettings.id, set: { odConfig: v, updatedAt: new Date() } });
}

function checkBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new OdError("Endereço da API inválido.");
  }
  if (u.protocol !== "https:" && !(isLocal(u) && process.env.NODE_ENV !== "production")) throw new OdError("O endereço da API precisa começar com https://");
  return u.toString().replace(/\/+$/, "");
}

// ---------------------------------------------------------------- canais
export type ChannelInput = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  appId: string;
  autoConfirm: boolean;
  info: OdMerchantInfo;
  address: ReturnType<typeof splitAddress>;
};

export function channelInfo(ch: Pick<OdChannel, "merchantInfo">): { info: OdMerchantInfo; address: ReturnType<typeof splitAddress> } {
  let j: Partial<{ info: OdMerchantInfo; address: ReturnType<typeof splitAddress> }> = {};
  try {
    j = JSON.parse(ch.merchantInfo || "{}");
  } catch {}
  return {
    info: { document: "", corporateName: "", categories: [], email: "", preparationMin: 25, ...(j.info ?? {}) },
    address: { ...splitAddress(""), ...(j.address ?? {}) },
  };
}

export const listChannels = (tenantId: string) => db.query.odChannels.findMany({ where: eq(schema.odChannels.tenantId, tenantId) });

const secret = (n: number) => randomBytes(n).toString("base64url");

/** Liga (ou atualiza) um app para a loja. Testa as credenciais pegando um token antes de salvar. */
export async function connectChannel(tenant: schema.Tenant, platform: OdPlatform, input: ChannelInput): Promise<OdChannel> {
  if (tenant.country !== "BR") throw new OdError("Disponível só para lojas do Brasil.");
  if (!isOdPlatform(platform)) throw new OdError("App desconhecido.");
  const defaults = (await odConfig())[platform] ?? {};
  const existing = await db.query.odChannels.findFirst({ where: and(eq(schema.odChannels.tenantId, tenant.id), eq(schema.odChannels.platform, platform)) });
  const clientId = input.clientId || existing?.clientId || defaults.clientId || "";
  const clientSecret = input.clientSecret || (existing && input.clientId === existing.clientId ? openSecret(existing.clientSecretSealed) : "") || (!input.clientId ? openSecret(defaults.clientSecretSealed) : "");
  const baseUrl = checkBaseUrl(input.baseUrl || existing?.baseUrl || defaults.baseUrl || OD_PLATFORM_INFO[platform].defaultBaseUrl || "about:blank");
  if (!clientId || !clientSecret) throw new OdError("Informe o Client ID e o Client Secret que o app enviou.");
  const doc = input.info.document.replace(/\D/g, "");
  if (doc.length !== 14) throw new OdError("Informe o CNPJ da loja (14 dígitos).");
  if (!input.info.corporateName.trim()) throw new OdError("Informe a razão social.");

  const signRequests = OD_PLATFORM_INFO[platform].signRequests;
  const creds: OdCreds = { baseUrl, clientId, clientSecret, signRequests, merchantId: existing?.merchantId ?? "", appId: input.appId || defaults.appId || null };
  const tok = await odToken(creds).catch((e) => {
    throw new OdError(e instanceof Error ? e.message : "Não foi possível autenticar no app.");
  });

  // mesmo merchantId em todos os apps da loja (o padrão identifica a loja por ele)
  const sibling = await db.query.odChannels.findFirst({ where: eq(schema.odChannels.tenantId, tenant.id), columns: { merchantId: true } });
  const merchantId = existing?.merchantId ?? sibling?.merchantId ?? newMerchantId(doc, randomUUID());
  const values = {
    baseUrl,
    clientId,
    clientSecretSealed: sealSecret(clientSecret),
    appId: input.appId || defaults.appId || null,
    signRequests,
    autoConfirm: input.autoConfirm,
    enabled: true,
    merchantInfo: JSON.stringify({ info: { ...input.info, document: doc }, address: input.address }),
    tokenSealed: sealSecret(tok.token),
    tokenExpiresAt: new Date(Date.now() + Math.max(60, tok.expiresIn - 60) * 1000),
    lastError: null,
    lastErrorAt: null,
  };
  if (existing) {
    const [row] = await db.update(schema.odChannels).set(values).where(eq(schema.odChannels.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(schema.odChannels)
    .values({ tenantId: tenant.id, platform, merchantId, hookToken: secret(24), apiKeySealed: sealSecret(secret(24)), ...values })
    .returning();
  return row;
}

export async function setChannelEnabled(tenantId: string, channelId: string, enabled: boolean) {
  await db.update(schema.odChannels).set({ enabled }).where(and(eq(schema.odChannels.id, channelId), eq(schema.odChannels.tenantId, tenantId)));
}

export async function removeChannel(tenantId: string, channelId: string) {
  await db.delete(schema.odChannels).where(and(eq(schema.odChannels.id, channelId), eq(schema.odChannels.tenantId, tenantId)));
}

/** Endereços públicos da loja para colar no app (cardápio + webhook) e a chave do cardápio. */
export function channelUrls(ch: OdChannel) {
  const base = `${appUrl()}/api/opendelivery/${ch.hookToken}`;
  return { merchantUrl: `${base}/v1/merchant`, webhookUrl: `${base}/v1/newEvent`, apiKey: openSecret(ch.apiKeySealed) };
}

export const channelByHook = (token: string) =>
  token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? db.query.odChannels.findFirst({ where: eq(schema.odChannels.hookToken, token) }) : Promise.resolve(undefined);

export function checkApiKey(ch: OdChannel, given: string | null): boolean {
  const want = openSecret(ch.apiKeySealed);
  if (!given || !want || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

// ---------------------------------------------------------------- HTTP com token em cache
function credsOf(ch: OdChannel): OdCreds {
  return { baseUrl: ch.baseUrl, clientId: ch.clientId, clientSecret: openSecret(ch.clientSecretSealed), signRequests: ch.signRequests, merchantId: ch.merchantId, appId: ch.appId };
}

async function tokenOf(ch: OdChannel, force = false): Promise<string> {
  if (!force && ch.tokenSealed && ch.tokenExpiresAt && ch.tokenExpiresAt.getTime() > Date.now() + 30_000) return openSecret(ch.tokenSealed);
  const t = await odToken(credsOf(ch));
  const exp = new Date(Date.now() + Math.max(60, t.expiresIn - 60) * 1000);
  await db.update(schema.odChannels).set({ tokenSealed: sealSecret(t.token), tokenExpiresAt: exp }).where(eq(schema.odChannels.id, ch.id));
  ch.tokenSealed = sealSecret(t.token);
  ch.tokenExpiresAt = exp;
  return t.token;
}

async function recordError(ch: OdChannel, e: unknown) {
  const msg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
  await db.update(schema.odChannels).set({ lastError: msg, lastErrorAt: new Date() }).where(eq(schema.odChannels.id, ch.id));
  console.error(`[od ${ch.platform}]`, msg);
}

/** Chamada à API do app; renova o token uma vez se ele expirou antes da hora. */
async function call<T = unknown>(ch: OdChannel, method: "GET" | "POST" | "PUT", path: string, body?: unknown, headers?: Record<string, string>) {
  try {
    return await odCall<T>(credsOf(ch), await tokenOf(ch), method, path, { body, headers });
  } catch (e) {
    if (e instanceof OdHttpError && e.status === 401) return odCall<T>(credsOf(ch), await tokenOf(ch, true), method, path, { body, headers });
    throw e;
  }
}

/** Envia ao app onde estão o cardápio e o webhook da loja (PUT /v1/merchantOnboarding). */
export async function onboardChannel(ch: OdChannel) {
  const u = channelUrls(ch);
  try {
    const { data } = await call<{ orderingAppMerchantId?: string }>(ch, "PUT", `/v1/merchantOnboarding?merchantId=${encodeURIComponent(ch.merchantId)}`, {
      getMerchantURL: { baseURL: u.merchantUrl, apiKey: u.apiKey },
      ordersWebhookURL: u.webhookUrl,
    });
    await db
      .update(schema.odChannels)
      .set({ onboardedAt: new Date(), lastError: null, ...(data?.orderingAppMerchantId ? { orderingAppMerchantId: String(data.orderingAppMerchantId).slice(0, 100) } : {}) })
      .where(eq(schema.odChannels.id, ch.id));
  } catch (e) {
    await recordError(ch, e);
    throw new OdError(e instanceof Error ? e.message : "Falha ao enviar o cadastro.");
  }
}

// ---------------------------------------------------------------- cardápio
const FALLBACK_LOGO = "/crm/icon-512.png";

export async function merchantFor(ch: OdChannel) {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, ch.tenantId) });
  if (!tenant) throw new OdError("loja não encontrada");
  const [cats, prods] = await Promise.all([
    db.query.categories.findMany({ where: eq(schema.categories.tenantId, tenant.id) }),
    db.query.products.findMany({ where: eq(schema.products.tenantId, tenant.id) }),
  ]);
  const promos = tenant.tier === "pro" && hasModule(tenant, "marketing");
  const { info, address } = channelInfo(ch);
  const base = appUrl();
  await db.update(schema.odChannels).set({ lastMenuAt: new Date() }).where(eq(schema.odChannels.id, ch.id));
  return buildMerchant({
    merchantId: ch.merchantId,
    now: new Date(),
    tenant: { ...tenant, currency: tenant.currency as Currency, isOpen: tenant.isOpen && !tenant.suspended, acceptsDelivery: tenant.acceptsDelivery && hasModule(tenant, "delivery") },
    info,
    address,
    categories: cats,
    products: prods
      .filter((p) => !p.durationMin)
      .map((p) => ({
        id: p.id,
        categoryId: p.categoryId,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        priceMinor: promos ? effectivePrice(p) : p.pricePyg,
        originalMinor: p.pricePyg,
        available: p.active && (!p.trackStock || p.stock > 0),
        sortOrder: p.sortOrder,
      })),
    absUrl: (u) => (/^https?:\/\//.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`),
    fallbackLogo: FALLBACK_LOGO,
  });
}

/** Avisa os apps que o cardápio mudou (eles buscam de novo) ou que a loja abriu/fechou. Nunca derruba quem chamou. */
export async function notifyMerchantChanged(tenantId: string, status?: "AVAILABLE" | "UNAVAILABLE") {
  const chs = await db.query.odChannels.findMany({ where: and(eq(schema.odChannels.tenantId, tenantId), eq(schema.odChannels.enabled, true)) });
  for (const ch of chs) {
    await call(ch, "POST", "/v1/merchantUpdate", status ? { merchantStatus: status } : {}).catch((e) => recordError(ch, e));
  }
  return chs.length;
}

// ---------------------------------------------------------------- eventos (webhook + polling)
type OdEvent = { eventId?: string; eventType?: string; orderId?: string; orderURL?: string; createdAt?: string };

/** Processa eventos de um canal. Devolve os que devem ser confirmados (ack) ao app. */
export async function handleEvents(ch: OdChannel, events: OdEvent[]) {
  const ack: { id: string; orderId: string; eventType: string }[] = [];
  for (const ev of events) {
    if (!ev?.eventId || !ev.orderId || !ev.eventType) continue;
    const key = `${ch.id}:${ev.eventId}`;
    const fresh = await db.insert(schema.odEvents).values({ id: key, channelId: ch.id, eventType: ev.eventType, orderId: ev.orderId }).onConflictDoNothing().returning({ id: schema.odEvents.id });
    if (fresh.length) {
      try {
        await applyEvent(ch, ev);
      } catch (e) {
        // libera o evento para nova tentativa (não confirma ao app)
        await db.delete(schema.odEvents).where(eq(schema.odEvents.id, key));
        await recordError(ch, e);
        continue;
      }
    }
    ack.push({ id: ev.eventId, orderId: ev.orderId, eventType: ev.eventType });
  }
  if (events.length) await db.update(schema.odChannels).set({ lastEventAt: new Date() }).where(eq(schema.odChannels.id, ch.id));
  return ack;
}

const orderOf = (ch: OdChannel, externalId: string) =>
  db.query.orders.findFirst({ where: and(eq(schema.orders.tenantId, ch.tenantId), eq(schema.orders.channel, ch.platform), eq(schema.orders.externalId, externalId)) });

async function applyEvent(ch: OdChannel, ev: OdEvent) {
  const eff = effectOfEvent(ev.eventType!);
  if (eff.kind === "ignore") return;
  if (eff.kind === "create") {
    await ingestOrder(ch, ev.orderId!, ev.orderURL);
    return;
  }
  let order = await orderOf(ch, ev.orderId!);
  if (!order) {
    // evento de status de um pedido que ainda não temos: busca o pedido primeiro
    if (eff.kind === "status" && eff.status === "CANCELLED") return;
    await ingestOrder(ch, ev.orderId!, ev.orderURL);
    order = await orderOf(ch, ev.orderId!);
    if (!order) return;
  }
  if (eff.kind === "cancelRequest") {
    await db.update(schema.orders).set({ cancelRequestedAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
    return;
  }
  if (eff.kind === "cancelDenied") {
    await db.update(schema.orders).set({ cancelRequestedAt: null, updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
    return;
  }
  if (shouldApply(order.status, eff.status)) {
    const { setOrderStatus } = await import("@/services/orders");
    await setOrderStatus(order.tenantId, order.id, eff.status, { fromChannel: true });
    if (eff.status === "CANCELLED") await db.update(schema.orders).set({ cancelRequestedAt: null }).where(eq(schema.orders.id, order.id));
  }
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Busca o pedido no app e cria na GoWeb (idempotente pelo id do app). */
export async function ingestOrder(ch: OdChannel, externalId: string, orderUrl?: string) {
  const already = await orderOf(ch, externalId);
  if (already) return already;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, ch.tenantId) });
  if (!tenant) return null;
  const creds = credsOf(ch);
  const token = await tokenOf(ch);
  const raw = orderUrl
    ? await odGetUrl<OdOrder>(creds, token, orderUrl)
    : ((await call<OdOrder>(ch, "GET", `/v1/orders/${encodeURIComponent(externalId)}`)).data as OdOrder);
  const cur = tenant.currency as Currency;
  const known = new Set((await db.query.products.findMany({ where: eq(schema.products.tenantId, tenant.id), columns: { id: true } })).map((p) => p.id));
  const m = mapOdOrder({ ...raw, id: raw?.id ?? externalId }, cur, known, OD_PLATFORM_INFO[ch.platform as OdPlatform]?.name ?? ch.platform);
  const created = await insertMappedOrder(tenant, ch, m);
  if (created && ch.autoConfirm) await confirmOnApp(ch, created.id).catch((e) => recordError(ch, e));
  return created;
}

async function insertMappedOrder(tenant: schema.Tenant, ch: OdChannel, m: MappedOrder) {
  const cur = tenant.currency as Currency;
  return db.transaction(async (tx) => {
    const today = startOfToday();
    let number = "";
    for (let i = 0; i < 15 && !number; i++) {
      const c = randomOrderNumber();
      const clash = await tx.query.orders.findFirst({ where: and(eq(schema.orders.tenantId, tenant.id), eq(schema.orders.number, c), gte(schema.orders.createdAt, today)), columns: { id: true } });
      if (!clash) number = c;
    }
    if (!number) throw new OdError("sem número livre");
    const session = await tx.query.cashSessions.findFirst({
      where: and(eq(schema.cashSessions.tenantId, tenant.id), sql`${schema.cashSessions.closedAt} IS NULL`),
      columns: { id: true },
    });
    const [o] = await tx
      .insert(schema.orders)
      .values({
        tenantId: tenant.id,
        number,
        customerName: m.customerName,
        customerPhone: m.customerPhone,
        customerDoc: m.customerDoc,
        type: m.type,
        address: m.address,
        lat: m.lat,
        lng: m.lng,
        notes: m.notes,
        subtotalPyg: m.subtotalMinor,
        discountPyg: m.discountMinor,
        deliveryFeePyg: m.deliveryFeeMinor,
        totalPyg: m.totalMinor,
        paymentMethod: m.paymentMethod,
        paymentProvider: `app:${ch.platform}`,
        paymentStatus: m.prepaid ? "PAID" : "PENDING",
        payCurrency: cur,
        exchangeRate: 1,
        payAmountMinor: m.totalMinor,
        cashTenderedMinor: m.changeForMinor,
        changeDuePyg: m.changeForMinor && m.changeForMinor > m.totalMinor ? m.changeForMinor - m.totalMinor : null,
        cashSessionId: m.prepaid ? (session?.id ?? null) : null,
        source: ch.platform,
        channel: ch.platform,
        externalId: m.externalId,
        externalDisplayId: m.displayId,
        marketplaceDelivery: m.marketplaceDelivery,
        odFlags: JSON.stringify(m.flags),
      })
      .onConflictDoNothing()
      .returning();
    if (!o) return null; // outro processo criou ao mesmo tempo
    if (m.items.length) {
      await tx.insert(schema.orderItems).values(m.items.map((i) => ({ orderId: o.id, productId: i.productId, name: i.name, unitPricePyg: i.unitMinor, quantity: i.quantity, notes: i.notes })));
    }
    // estoque: o pedido já aconteceu no app — baixa o que houver (sem ficar negativo)
    const qty = new Map<string, number>();
    for (const i of m.items) if (i.productId) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
    if (qty.size) {
      const prods = await tx.query.products.findMany({ where: and(eq(schema.products.tenantId, tenant.id), inArray(schema.products.id, [...qty.keys()]), eq(schema.products.trackStock, true)) });
      for (const p of prods) {
        const q = qty.get(p.id)!;
        const upd = await tx.update(schema.products).set({ stock: sql`${schema.products.stock} - ${q}` }).where(and(eq(schema.products.id, p.id), gte(schema.products.stock, q))).returning({ id: schema.products.id });
        if (upd.length) await tx.insert(schema.stockMovements).values({ tenantId: tenant.id, productId: p.id, delta: -q, reason: "ORDER", orderId: o.id });
      }
    }
    return o;
  });
}

/** Aceita o pedido no app (obrigatório antes de qualquer outro status). */
export async function confirmOnApp(ch: OdChannel, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, ch.tenantId)) });
  if (!o?.externalId || o.odConfirmed) return;
  const { info } = channelInfo(ch);
  await call(ch, "POST", `/v1/orders/${encodeURIComponent(o.externalId)}/confirm`, { createdAt: new Date().toISOString(), orderExternalCode: o.number, preparationTime: info.preparationMin });
  await db.update(schema.orders).set({ odConfirmed: true }).where(eq(schema.orders.id, o.id));
}

/** Status mudou na GoWeb → avisa o app (chamado por setOrderStatus). */
export async function pushStatus(tenantId: string, orderId: string, status: OrderStatus) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
  if (!o?.channel || !o.externalId) return;
  const ch = await db.query.odChannels.findFirst({ where: and(eq(schema.odChannels.tenantId, tenantId), eq(schema.odChannels.platform, o.channel)) });
  if (!ch) return;
  let flags = { sendPreparing: false, sendDelivered: true, sendPickedUp: false };
  try {
    flags = { ...flags, ...JSON.parse(o.odFlags ?? "{}") };
  } catch {}
  const { info } = channelInfo(ch);
  const acts = actionsForStatus(status, { externalId: o.externalId, number: o.number, type: o.type, marketplaceDelivery: o.marketplaceDelivery, confirmed: o.odConfirmed, prepMin: info.preparationMin, flags }, new Date());
  for (const a of acts) {
    try {
      await call(ch, "POST", a.path, a.body);
      if (a.path.endsWith("/confirm")) await db.update(schema.orders).set({ odConfirmed: true }).where(eq(schema.orders.id, o.id));
    } catch (e) {
      await recordError(ch, e);
      break;
    }
  }
}

/** Loja responde ao pedido de cancelamento do cliente/app. */
export async function answerCancellation(tenantId: string, orderId: string, accept: boolean) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
  if (!o?.channel || !o.externalId) throw new OdError("Pedido não é de app.");
  const ch = await db.query.odChannels.findFirst({ where: and(eq(schema.odChannels.tenantId, tenantId), eq(schema.odChannels.platform, o.channel)) });
  if (!ch) throw new OdError("App desconectado.");
  const path = `/v1/orders/${encodeURIComponent(o.externalId)}/${accept ? "acceptCancellation" : "denyCancellation"}`;
  try {
    await call(ch, "POST", path, accept ? undefined : o.status === "OUT_FOR_DELIVERY" ? { reason: "O pedido já saiu para entrega", code: "OUT_FOR_DELIVERY" } : { reason: "O pedido já está pronto ou em preparo", code: "DISH_ALREADY_DONE" });
  } catch (e) {
    await recordError(ch, e);
    throw new OdError(e instanceof Error ? e.message : "O app recusou a resposta.");
  }
  await db.update(schema.orders).set({ cancelRequestedAt: null, updatedAt: new Date() }).where(eq(schema.orders.id, o.id));
  if (accept) {
    const { setOrderStatus } = await import("@/services/orders");
    await setOrderStatus(tenantId, o.id, "CANCELLED", { fromChannel: true });
  }
}

/** Polling: busca eventos novos, processa e confirma. */
export async function pollChannel(ch: OdChannel) {
  await db.update(schema.odChannels).set({ lastPollAt: new Date() }).where(eq(schema.odChannels.id, ch.id));
  try {
    const { data } = await call<OdEvent[]>(ch, "GET", "/v1/events:polling", undefined, { "x-polling-merchants": ch.merchantId });
    const events = Array.isArray(data) ? data : [];
    const ack = await handleEvents(ch, events);
    for (let i = 0; i < ack.length; i += 100) await call(ch, "POST", "/v1/events/acknowledgment", ack.slice(i, i + 100));
    return events.length;
  } catch (e) {
    await recordError(ch, e);
    return 0;
  }
}

const POLL_EVERY_MS = 25_000;

/** Chamado pelo quadro de pedidos (atualiza a cada 5 s): faz polling no máximo a cada 25 s por canal. */
export async function pollTenantIfDue(tenantId: string) {
  const due = new Date(Date.now() - POLL_EVERY_MS);
  const chs = await db
    .update(schema.odChannels)
    .set({ lastPollAt: new Date() })
    .where(and(eq(schema.odChannels.tenantId, tenantId), eq(schema.odChannels.enabled, true), or(sql`${schema.odChannels.lastPollAt} IS NULL`, lt(schema.odChannels.lastPollAt, due))))
    .returning();
  let n = 0;
  for (const ch of chs) n += await pollChannel(ch);
  return n;
}

/** Cron: polling de todas as lojas com canal ligado (rede de segurança se o webhook falhar). */
export async function pollAll() {
  const chs = await db.query.odChannels.findMany({ where: and(eq(schema.odChannels.enabled, true), isNotNull(schema.odChannels.clientId)) });
  let n = 0;
  for (const ch of chs) n += await pollChannel(ch);
  return { channels: chs.length, events: n };
}
