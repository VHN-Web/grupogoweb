import "server-only";
// =============================================================================
// Geovana — atendente com IA no WhatsApp da loja (GoInteligence).
// Canal: Evolution API (servidor da GoWeb, QR Code) ou WhatsApp Cloud API oficial (credenciais da loja).
// Cérebro: Gemini (chave da GoWeb em Admin → Configurações, ou chave própria da loja).
// Regras puras e prompt em core/geovana.ts.
// =============================================================================
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, like } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { buildSystemPrompt, jidToE164, orderNotice, parseGeovana, parseReply, wantsHuman, type GeovanaConfig, type GeovanaContext } from "@/core/geovana";
import { getLabels } from "@/core/types";
import { formatMoney } from "@/core/money";
import { getRegion, tr } from "@/core/region";
import type { Currency } from "@/core/types";
import { parsePaymentConfig, publicPaymentConfig } from "@/core/tenant-config";
import { geminiChat, geminiModel, AiError, type ChatTurn } from "@/adapters/ai/gemini";
import { EvolutionError, evoConnect, evoCreateInstance, evoDelete, evoLogout, evoSendText, evoSetWebhook, evoState } from "@/adapters/whatsapp/evolution";
import { CloudError, cloudCheck, cloudSendText } from "@/adapters/whatsapp/cloud";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl, tenantPublicUrl } from "@/lib/urls";

export class GeovanaError extends Error {}
export { EvolutionError, CloudError, AiError };

// ---------------------------------------------------------------- plataforma
export type WhatsappPlatform = { evolutionUrl: string; evolutionKeySealed: string; geminiKeySealed: string; model: string };

export async function whatsappPlatform(): Promise<WhatsappPlatform> {
  const s = await db.query.platformSettings.findFirst({ columns: { whatsappConfig: true } });
  let o: Partial<WhatsappPlatform> = {};
  try {
    o = JSON.parse(s?.whatsappConfig ?? "{}");
  } catch {}
  return { evolutionUrl: o.evolutionUrl ?? "", evolutionKeySealed: o.evolutionKeySealed ?? "", geminiKeySealed: o.geminiKeySealed ?? "", model: geminiModel(o.model) };
}

export async function saveWhatsappPlatform(patch: Partial<WhatsappPlatform>) {
  const cur = await whatsappPlatform();
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", whatsappConfig: JSON.stringify(next) })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { whatsappConfig: JSON.stringify(next), updatedAt: new Date() } });
  return next;
}

async function evoServer() {
  const p = await whatsappPlatform();
  if (!p.evolutionUrl || !p.evolutionKeySealed) throw new GeovanaError("A GoWeb ainda não ligou o servidor do WhatsApp. Use a API oficial ou fale com o suporte.");
  return { url: p.evolutionUrl, key: openSecret(p.evolutionKeySealed) };
}

// ---------------------------------------------------------------- config da loja
export const geovanaOf = (t: Pick<Tenant, "geovanaConfig">) => parseGeovana(t.geovanaConfig);

export async function saveGeovana(t: Tenant, patch: Partial<GeovanaConfig>) {
  const next = { ...geovanaOf(t), ...patch };
  if (!next.hookToken) next.hookToken = randomBytes(18).toString("base64url");
  await db.update(schema.tenants).set({ geovanaConfig: JSON.stringify(next) }).where(eq(schema.tenants.id, t.id));
  t.geovanaConfig = JSON.stringify(next);
  return next;
}

export const evolutionHookUrl = (token: string) => `${appUrl()}/api/whatsapp/evolution/${token}`;
export const cloudHookUrl = (token: string) => `${appUrl()}/api/whatsapp/cloud/${token}`;

/** Loja pelo segredo da URL do webhook. */
export async function tenantByHook(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const list = await db.query.tenants.findMany({ where: and(eq(schema.tenants.demo, false), like(schema.tenants.geovanaConfig, `%"hookToken":"${token}"%`)), limit: 2 });
  return list.find((t) => geovanaOf(t).hookToken === token) ?? null;
}

function guard(t: Tenant) {
  if (t.demo) throw new GeovanaError("Lojas de demonstração não conectam WhatsApp real.");
  if (t.tier !== "pro") throw new GeovanaError("A Geovana faz parte do GoInteligence.");
}

// ---------------------------------------------------------------- conexão: Evolution (QR)
export async function connectEvolution(t: Tenant) {
  guard(t);
  const srv = await evoServer();
  const cfg = await saveGeovana(t, {});
  const instance = cfg.instance || `gw-${t.slug}`.slice(0, 60);
  let key = cfg.instanceKeySealed ? openSecret(cfg.instanceKeySealed) : "";
  if (!key) {
    try {
      key = await evoCreateInstance(srv, instance, evolutionHookUrl(cfg.hookToken));
    } catch (e) {
      // já existe no servidor: reaproveita (o webhook é reconfigurado)
      if (!(e instanceof EvolutionError && (e.status === 403 || e.status === 400 || e.status === 409))) throw e;
      key = srv.key;
    }
  }
  await evoSetWebhook(srv, instance, evolutionHookUrl(cfg.hookToken)).catch(() => null);
  await saveGeovana(t, { channel: "evolution", instance, instanceKeySealed: sealSecret(key) });
  return evoConnect(srv, instance);
}

export async function evolutionQr(t: Tenant) {
  const srv = await evoServer();
  const cfg = geovanaOf(t);
  if (!cfg.instance) throw new GeovanaError("Conecte primeiro.");
  return evoConnect(srv, cfg.instance);
}

export async function channelStatus(t: Tenant): Promise<{ channel: GeovanaConfig["channel"]; connected: boolean; detail: string }> {
  const cfg = geovanaOf(t);
  try {
    if (cfg.channel === "evolution" && cfg.instance) {
      const st = await evoState(await evoServer(), cfg.instance);
      return { channel: "evolution", connected: st === "open", detail: st };
    }
    if (cfg.channel === "cloud" && cfg.cloudPhoneId) {
      const r = await cloudCheck(cfg.cloudPhoneId, openSecret(cfg.cloudTokenSealed));
      return { channel: "cloud", connected: true, detail: `${r.name} ${r.phone}`.trim() };
    }
  } catch (e) {
    return { channel: cfg.channel, connected: false, detail: e instanceof Error ? e.message : "erro" };
  }
  return { channel: "none", connected: false, detail: "" };
}

export async function disconnectChannel(t: Tenant) {
  const cfg = geovanaOf(t);
  if (cfg.channel === "evolution" && cfg.instance) {
    const srv = await evoServer().catch(() => null);
    if (srv) {
      await evoLogout(srv, cfg.instance).catch(() => null);
      await evoDelete(srv, cfg.instance).catch(() => null);
    }
  }
  await saveGeovana(t, { channel: "none", instance: "", instanceKeySealed: "", cloudPhoneId: "", cloudTokenSealed: "", cloudAppSecretSealed: "", enabled: false });
}

// ---------------------------------------------------------------- conexão: API oficial
export async function connectCloud(t: Tenant, f: { phoneId: string; token: string; appSecret: string }) {
  guard(t);
  const phoneId = f.phoneId.replace(/\D/g, "");
  if (!phoneId || f.token.length < 20 || f.appSecret.length < 16) throw new GeovanaError("Preencha Phone Number ID, token permanente e App Secret.");
  const info = await cloudCheck(phoneId, f.token.trim());
  const cur = await saveGeovana(t, {});
  await saveGeovana(t, {
    channel: "cloud",
    cloudPhoneId: phoneId,
    cloudTokenSealed: sealSecret(f.token.trim()),
    cloudAppSecretSealed: sealSecret(f.appSecret.trim()),
    cloudVerifyToken: cur.cloudVerifyToken || randomBytes(12).toString("hex"),
  });
  return info;
}

// ---------------------------------------------------------------- envio
async function sendText(t: Tenant, cfg: GeovanaConfig, phone: string, text: string): Promise<string | null> {
  if (t.demo) return null;
  if (cfg.channel === "evolution" && cfg.instance) {
    const r = await evoSendText(await evoServer(), cfg.instance, phone, text);
    return r?.key?.id ?? null;
  }
  if (cfg.channel === "cloud" && cfg.cloudPhoneId) {
    await cloudSendText(cfg.cloudPhoneId, openSecret(cfg.cloudTokenSealed), phone, text);
    return null;
  }
  return null;
}

// ---------------------------------------------------------------- contexto e cérebro
async function aiKey(cfg: GeovanaConfig) {
  const p = await whatsappPlatform();
  const key = (cfg.ownKeySealed && openSecret(cfg.ownKeySealed)) || (p.geminiKeySealed && openSecret(p.geminiKeySealed)) || process.env.GEMINI_API_KEY || "";
  if (!key) throw new GeovanaError("IA sem chave: a GoWeb precisa cadastrar a chave do Gemini (ou use a chave da sua loja).");
  return { key, model: p.model };
}

export const storeUrl = (t: Tenant) => tenantPublicUrl(t);
const trackUrl = (t: Tenant, id: string) => (t.customDomain ? `https://${t.customDomain}/pedido/${id}` : `${appUrl()}/${t.slug}/pedido/${id}`);

async function buildContext(t: Tenant, phone: string | null, name: string | null): Promise<GeovanaContext> {
  const region = getRegion(t.country);
  const L = getLabels(region.locale);
  const fm = (v: number) => formatMoney(v, t.currency as Currency);
  const [products, cats, orders, booking] = await Promise.all([
    db.query.products.findMany({ where: and(eq(schema.products.tenantId, t.id), eq(schema.products.active, true)), orderBy: [schema.products.sortOrder], limit: 150 }),
    db.query.categories.findMany({ where: eq(schema.categories.tenantId, t.id) }),
    phone
      ? db.query.orders.findMany({ where: and(eq(schema.orders.tenantId, t.id), eq(schema.orders.customerPhone, phone), gte(schema.orders.createdAt, new Date(Date.now() - 30 * 86_400_000))), orderBy: desc(schema.orders.createdAt), limit: 3 })
      : Promise.resolve([]),
    Promise.resolve(t.bookingConfig && t.bookingConfig !== "{}" ? storeUrl(t) : null),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const pay = publicPaymentConfig(parsePaymentConfig(t.paymentConfig));
  const payments = [...new Set(pay.options.map((o) => L.paymentMethod[o.method]))].join(", ");
  const delivery = t.acceptsDelivery ? `${region.locale === "pt" ? "Entrega até" : "Delivery hasta"} ${t.deliveryMaxKm} km, ${region.locale === "pt" ? "taxa a partir de" : "desde"} ${fm(t.deliveryBaseFeePyg)}${t.deliveryFreeOverPyg ? ` (${region.locale === "pt" ? "grátis acima de" : "gratis desde"} ${fm(t.deliveryFreeOverPyg)})` : ""}` : region.locale === "pt" ? "Sem entrega (só retirada/consumo no local)" : "Sin delivery";
  const fmtWhen = (d: Date) => new Intl.DateTimeFormat(region.intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: region.timeZone }).format(d);
  return {
    storeName: t.name,
    storeUrl: storeUrl(t),
    isOpen: t.isOpen,
    address: t.address,
    delivery,
    payments,
    bookingUrl: booking,
    catalog: products.map((p) => ({ id: p.id.slice(0, 8), name: p.name, price: fm(p.promoPricePyg && p.promoEndsAt && p.promoEndsAt > new Date() ? p.promoPricePyg : p.pricePyg), category: p.categoryId ? catName.get(p.categoryId) : null, description: p.description })),
    customerName: name,
    customerOrders: orders.map((o) => ({ number: o.number, status: L.orderStatus[o.status], when: fmtWhen(o.createdAt), total: fm(o.totalPyg), trackUrl: trackUrl(t, o.id) })),
    locale: region.locale,
  };
}

/** Gera a resposta da Geovana (sem enviar). Ids curtos (8) no prompt; aqui viram os ids reais. */
export async function geovanaReply(t: Tenant, cfg: GeovanaConfig, history: ChatTurn[], phone: string | null, name: string | null) {
  const ctx = await buildContext(t, phone, name);
  const { key, model } = await aiKey(cfg);
  const raw = await geminiChat({ key, model, system: buildSystemPrompt(cfg, ctx), history: history.slice(-14) });
  const products = await db.query.products.findMany({ where: and(eq(schema.products.tenantId, t.id), eq(schema.products.active, true)), columns: { id: true, name: true, pricePyg: true, promoPricePyg: true, promoEndsAt: true } });
  const byShort = new Map(products.map((p) => [p.id.slice(0, 8), p]));
  const r = parseReply(raw, new Set(byShort.keys()));
  let text = r.text;
  if (r.cart.length && cfg.takeOrders) {
    const items = r.cart.map((c) => {
      const p = byShort.get(c.productId)!;
      const unit = p.promoPricePyg && p.promoEndsAt && p.promoEndsAt > new Date() ? p.promoPricePyg : p.pricePyg;
      return { productId: p.id, name: p.name, quantity: c.quantity, unitPricePyg: unit };
    });
    const [cart] = await db
      .insert(schema.carts)
      .values({ tenantId: t.id, customerName: name, customerPhone: phone ?? "+0", items: JSON.stringify(items), subtotalPyg: items.reduce((a, i) => a + i.unitPricePyg * i.quantity, 0), status: "CONTACTED", contactedAt: new Date() })
      .returning({ id: schema.carts.id });
    const T = tr(getRegion(t.country).locale);
    text = `${text}\n\n${T("Tu carrito está listo, finalizá acá", "Seu carrinho está pronto, finalize aqui")}: ${storeUrl(t)}?carrinho=${cart.id}`.trim();
  }
  return { text, handoff: r.handoff };
}

// ---------------------------------------------------------------- mensagens recebidas
async function chatFor(tenantId: string, phone: string, name: string | null) {
  const [c] = await db
    .insert(schema.waChats)
    .values({ tenantId, phone, name })
    .onConflictDoUpdate({ target: [schema.waChats.tenantId, schema.waChats.phone], set: { lastAt: new Date(), ...(name ? { name } : {}) } })
    .returning();
  return c;
}

/** Guarda a mensagem; false = já processada (mesmo id do WhatsApp). */
async function store(tenantId: string, chatId: string, role: "user" | "ai" | "staff" | "system", text: string, externalId: string | null) {
  const r = await db.insert(schema.waMessages).values({ tenantId, chatId, role, text: text.slice(0, 4000), externalId }).onConflictDoNothing().returning({ id: schema.waMessages.id });
  return r.length > 0;
}

export async function handleInbound(t: Tenant, m: { jid: string; name: string | null; text: string; externalId: string | null; fromMe: boolean }) {
  const phone = jidToE164(m.jid);
  if (!phone || !m.text.trim()) return "ignored";
  const cfg = geovanaOf(t);
  const chat = await chatFor(t.id, phone, m.fromMe ? null : m.name);
  if (m.fromMe) {
    // mensagem que a própria Geovana enviou chega de volta com o mesmo id → já guardada
    const fresh = await store(t.id, chat.id, "staff", m.text, m.externalId);
    if (fresh) await db.update(schema.waChats).set({ pausedUntil: new Date(Date.now() + cfg.pauseMinutes * 60_000), needsHuman: false }).where(eq(schema.waChats.id, chat.id));
    return fresh ? "staff" : "echo";
  }
  if (!(await store(t.id, chat.id, "user", m.text, m.externalId))) return "duplicate";
  if (!cfg.enabled || t.tier !== "pro" || t.demo) return "disabled";
  if (chat.pausedUntil && chat.pausedUntil > new Date()) return "paused";
  if (cfg.onlyWhenClosed && t.isOpen) return "open-hours";

  const T = tr(getRegion(t.country).locale);
  let reply: { text: string; handoff: boolean };
  if (wantsHuman(m.text, cfg.handoffWords)) {
    reply = { text: T("Perfecto, ya llamo a alguien del equipo para atenderte. 🙌", "Certo! Já chamei alguém da equipe para te atender. 🙌"), handoff: true };
  } else {
    const hist = await db.query.waMessages.findMany({ where: eq(schema.waMessages.chatId, chat.id), orderBy: desc(schema.waMessages.createdAt), limit: 14 });
    const turns: ChatTurn[] = hist.reverse().filter((h) => h.role !== "system").map((h) => ({ role: h.role === "user" ? "user" : "model", text: h.text }));
    try {
      reply = await geovanaReply(t, cfg, turns, phone, chat.name);
    } catch (e) {
      console.error("[geovana]", e instanceof Error ? e.message : e);
      await db.update(schema.waChats).set({ needsHuman: true }).where(eq(schema.waChats.id, chat.id));
      await store(t.id, chat.id, "system", `IA indisponível: ${e instanceof Error ? e.message : "erro"}`, null);
      return "ai-error";
    }
  }
  if (reply.text) {
    const extId = await sendText(t, cfg, phone, reply.text);
    await store(t.id, chat.id, "ai", reply.text, extId);
  }
  if (reply.handoff) {
    await db.update(schema.waChats).set({ needsHuman: true, pausedUntil: new Date(Date.now() + cfg.pauseMinutes * 60_000) }).where(eq(schema.waChats.id, chat.id));
  }
  return reply.handoff ? "handoff" : "replied";
}

// ---------------------------------------------------------------- avisos de pedido
export async function notifyOrderStatus(tenantId: string, orderId: string, status: string) {
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!t || t.demo) return;
  const cfg = geovanaOf(t);
  if (!cfg.orderNotices || cfg.channel === "none" || t.tier !== "pro") return;
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)) });
  if (!o?.customerPhone) return;
  const text = orderNotice(status, { number: o.number, storeName: t.name, trackUrl: trackUrl(t, o.id), type: o.type }, getRegion(t.country).locale);
  if (!text) return;
  try {
    const extId = await sendText(t, cfg, o.customerPhone, text);
    const chat = await chatFor(t.id, o.customerPhone, o.customerName);
    await store(t.id, chat.id, "ai", text, extId);
  } catch (e) {
    console.error("[geovana aviso]", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------- painel
export async function recentChats(tenantId: string) {
  const chats = await db.query.waChats.findMany({ where: eq(schema.waChats.tenantId, tenantId), orderBy: desc(schema.waChats.lastAt), limit: 30 });
  const last = await Promise.all(chats.map((c) => db.query.waMessages.findMany({ where: eq(schema.waMessages.chatId, c.id), orderBy: desc(schema.waMessages.createdAt), limit: 6 })));
  return chats.map((c, i) => ({ ...c, messages: last[i].reverse() }));
}

export async function setChatPaused(tenantId: string, chatId: string, minutes: number) {
  await db
    .update(schema.waChats)
    .set({ pausedUntil: minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null, needsHuman: minutes > 0 ? undefined : false })
    .where(and(eq(schema.waChats.id, chatId), eq(schema.waChats.tenantId, tenantId)));
}

/** Simulador do painel: conversa de teste sem WhatsApp (não cria carrinho real se for só teste). */
export async function simulate(t: Tenant, history: ChatTurn[]) {
  const cfg = geovanaOf(t);
  const last = history.at(-1)?.text ?? "";
  if (wantsHuman(last, cfg.handoffWords)) return { text: tr(getRegion(t.country).locale)("Perfecto, ya llamo a alguien del equipo. 🙌", "Certo! Já chamei alguém da equipe para te atender. 🙌"), handoff: true };
  return geovanaReply(t, cfg, history, null, null);
}
