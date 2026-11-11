import "server-only";
// =============================================================================
// Geovana — atendente com IA no WhatsApp da loja (GoInteligence).
// Canal: Evolution API (servidor da GoWeb, QR Code) ou WhatsApp Cloud API oficial (credenciais da loja).
// Cérebro: Gemini (chave da GoWeb em Admin → Configurações, ou chave própria da loja).
// Regras puras e prompt em core/geovana.ts.
// =============================================================================
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, isNull, like } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { CLOSED_NOTICE_EVERY_MS, buildSystemPrompt, closedNotice, geovanaAnswers, jidToE164, orderNotice, parseGeovana, parseReply, wantsHuman, type GeovanaConfig, type GeovanaContext } from "@/core/geovana";
import { getLabels } from "@/core/types";
import { formatMoney } from "@/core/money";
import { getRegion, tr } from "@/core/region";
import type { Currency } from "@/core/types";
import { parsePaymentConfig, publicPaymentConfig } from "@/core/tenant-config";
import { GEMINI_DEFAULT_MODEL, geminiChat, geminiModel, AiError, type ChatTurn, type OnUsage } from "@/adapters/ai/gemini";
import { EvolutionError, evoConnect, evoCreateInstance, evoDelete, evoLogout, evoSendText, evoSetWebhook, evoState } from "@/adapters/whatsapp/evolution";
import { CloudError, cloudCheck, cloudSendText } from "@/adapters/whatsapp/cloud";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl, tenantPublicUrl } from "@/lib/urls";
import { STORE_OPT_OUT, aiFallbackText, isRepeat, trimHistory, type SendKind } from "@/core/wa-guard";
import { aiGate, aiMeter, guardedSend, isOwnRecentSend, logEvent, noteInbound, storeChannel, type Outcome } from "@/services/wa-guard";

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
  return { evolutionUrl: o.evolutionUrl ?? "", evolutionKeySealed: o.evolutionKeySealed ?? "", geminiKeySealed: o.geminiKeySealed ?? "", // 3.8 Flash foi salvo como padrão provisório e vive congestionado: a Geovana usa o Flash-Lite (rápido)
  model: o.model === "gemini-3.8-flash" ? GEMINI_DEFAULT_MODEL : geminiModel(o.model) };
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

export async function evoServer() {
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
/** Envio direto pelo canal da loja, SEM proteção — só a fila da proteção (services/wa-guard.ts) chama isto. */
export async function storeRawSend(t: Tenant, cfg: GeovanaConfig, phone: string, text: string): Promise<string | null> {
  if (t.demo) return null;
  if (cfg.channel === "evolution" && cfg.instance) {
    const r = await evoSendText(await evoServer(), cfg.instance, phone, text);
    return r?.key?.id ?? null;
  }
  if (cfg.channel === "cloud" && cfg.cloudPhoneId) {
    return cloudSendText(cfg.cloudPhoneId, openSecret(cfg.cloudTokenSealed), phone, text);
  }
  return null;
}

/** Envio com a proteção da Geovana (limites, horário, fila, circuit breaker). Demo e loja sem canal nunca enviam. */
async function sendText(t: Tenant, cfg: GeovanaConfig, phone: string, text: string, kind: SendKind = "reply"): Promise<Outcome> {
  if (t.demo || cfg.channel === "none" || (cfg.channel === "evolution" && !cfg.instance) || (cfg.channel === "cloud" && !cfg.cloudPhoneId)) return { status: "blocked", reason: "sem canal" };
  return guardedSend(
    { channel: storeChannel(t.id), tenantId: t.id, to: phone, text, kind, officialApi: cfg.channel === "cloud" },
    () => storeRawSend(t, cfg, phone, text),
    { waitMs: kind === "reply" ? 8_000 : 0 },
  );
}
const sentId = (o: Outcome) => (o.status === "sent" ? o.id : null);

// ---------------------------------------------------------------- contexto e cérebro
export async function aiKey(cfg: GeovanaConfig) {
  const p = await whatsappPlatform();
  const key = (cfg.ownKeySealed && openSecret(cfg.ownKeySealed)) || (p.geminiKeySealed && openSecret(p.geminiKeySealed)) || process.env.GEMINI_API_KEY || "";
  if (!key) throw new GeovanaError("IA sem chave: a GoWeb precisa cadastrar a chave do Gemini (ou use a chave da sua loja).");
  return { key, model: p.model };
}

export const storeUrl = (t: Tenant) => tenantPublicUrl(t);
const trackUrl = (t: Tenant, id: string) => (t.customDomain ? `https://${t.customDomain}/pedido/${id}` : `${appUrl()}/${t.slug}/pedido/${id}`);

async function buildContext(t: Tenant, phone: string | null, name: string | null, catalogLimit = 150): Promise<GeovanaContext> {
  const region = getRegion(t.country);
  const L = getLabels(region.locale);
  const fm = (v: number) => formatMoney(v, t.currency as Currency);
  const [products, cats, orders, booking] = await Promise.all([
    db.query.products.findMany({ where: and(eq(schema.products.tenantId, t.id), eq(schema.products.active, true)), orderBy: [schema.products.sortOrder], limit: catalogLimit }),
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
export async function geovanaReply(t: Tenant, cfg: GeovanaConfig, history: ChatTurn[], phone: string | null, name: string | null, opts: { maxTokens?: number; catalogLimit?: number; onUsage?: OnUsage } = {}) {
  const ctx = await buildContext(t, phone, name, opts.catalogLimit);
  const { key, model } = await aiKey(cfg);
  const raw = await geminiChat({ key, model, system: buildSystemPrompt(cfg, ctx), history: history.slice(-14), maxTokens: opts.maxTokens, onUsage: opts.onUsage });
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
  const ch = storeChannel(t.id);
  const chat = await chatFor(t.id, phone, m.fromMe ? null : m.name);
  if (m.fromMe) {
    // eco de algo que a fila da proteção enviou depois: anota o id na mensagem guardada e NÃO pausa a IA
    if (m.externalId && (await isOwnRecentSend(ch, phone, m.text))) {
      const pend = await db.query.waMessages.findFirst({ where: and(eq(schema.waMessages.chatId, chat.id), eq(schema.waMessages.role, "ai"), isNull(schema.waMessages.externalId), eq(schema.waMessages.text, m.text.slice(0, 4000))), orderBy: desc(schema.waMessages.createdAt) });
      if (pend) await db.update(schema.waMessages).set({ externalId: m.externalId }).where(eq(schema.waMessages.id, pend.id)).catch(() => null);
      return "echo";
    }
    // mensagem que a própria Geovana enviou chega de volta com o mesmo id → já guardada
    const fresh = await store(t.id, chat.id, "staff", m.text, m.externalId);
    if (fresh) await db.update(schema.waChats).set({ pausedUntil: new Date(Date.now() + cfg.pauseMinutes * 60_000), needsHuman: false }).where(eq(schema.waChats.id, chat.id));
    return fresh ? "staff" : "echo";
  }
  if (!(await store(t.id, chat.id, "user", m.text, m.externalId))) return "duplicate";
  const inbound = t.demo ? { flood: false, pauseMinutes: 0 } : await noteInbound(ch, phone);
  // descadastro: "parar"/"baja" → sem avisos da loja até o cliente escrever de novo
  if (STORE_OPT_OUT.test(m.text)) {
    await db.update(schema.waChats).set({ optOut: true }).where(eq(schema.waChats.id, chat.id));
    if (cfg.enabled && t.tier === "pro" && !t.demo) {
      const text = tr(getRegion(t.country).locale)("Listo, no te mando más avisos por acá. Si necesitás algo, escribinos. 👋", "Pronto, não vou mais te mandar avisos por aqui. Se precisar, é só chamar! 👋");
      const o = await sendText(t, cfg, phone, text, "reply");
      if (o.status !== "blocked") await store(t.id, chat.id, "ai", text, sentId(o));
    }
    return "opt-out";
  }
  if (chat.optOut) await db.update(schema.waChats).set({ optOut: false }).where(eq(schema.waChats.id, chat.id));
  if (!cfg.enabled || t.tier !== "pro" || t.demo) return "disabled";
  if (chat.pausedUntil && chat.pausedUntil > new Date()) return "paused";
  if (inbound.flood) {
    // muitas mensagens em 1 min (robô respondendo robô, loop): a IA fica quieta nessa conversa por um tempo
    await db.update(schema.waChats).set({ pausedUntil: new Date(Date.now() + inbound.pauseMinutes * 60_000) }).where(eq(schema.waChats.id, chat.id));
    return "flood";
  }
  if (!geovanaAnswers(cfg.when, t.isOpen)) {
    // fora do horário escolhido: avisa uma vez (a cada 6 h) que a loja está fechada; a mensagem fica para a equipe
    if (cfg.when === "open" && cfg.closedMessage && (!chat.closedNoticeAt || Date.now() - chat.closedNoticeAt.getTime() > CLOSED_NOTICE_EVERY_MS)) {
      const text = closedNotice(t.name, cfg.hours, getRegion(t.country).locale === "pt");
      const o = await sendText(t, cfg, phone, text, "reply");
      if (o.status !== "blocked") await store(t.id, chat.id, "ai", text, sentId(o));
      await db.update(schema.waChats).set({ closedNoticeAt: new Date() }).where(eq(schema.waChats.id, chat.id));
      return "closed-notice";
    }
    return "off-hours";
  }

  const T = tr(getRegion(t.country).locale);
  let reply: { text: string; handoff: boolean };
  if (wantsHuman(m.text, cfg.handoffWords)) {
    reply = { text: T("Perfecto, ya llamo a alguien del equipo para atenderte. 🙌", "Certo! Já chamei alguém da equipe para te atender. 🙌"), handoff: true };
  } else {
    // proteção da IA: orçamento, chamadas por minuto, conversa que já gastou demais, emergência
    const gate = await aiGate(ch, phone);
    if (gate.mode === "blocked") {
      if (gate.emergency) return "emergency";
      await db.update(schema.waChats).set({ needsHuman: true }).where(eq(schema.waChats.id, chat.id));
      await store(t.id, chat.id, "system", `IA em economia: ${gate.reason}`, null);
      // o cliente recebe 1 aviso (no máx. a cada 6 h) e a conversa vai para a equipe
      const fallback = aiFallbackText("store", getRegion(t.country).locale === "pt");
      const recent = await db.query.waMessages.findFirst({ where: and(eq(schema.waMessages.chatId, chat.id), eq(schema.waMessages.role, "ai"), eq(schema.waMessages.text, fallback), gte(schema.waMessages.createdAt, new Date(Date.now() - 6 * 3600_000))) });
      if (!recent) {
        const o = await sendText(t, cfg, phone, fallback, "reply");
        if (o.status !== "blocked") await store(t.id, chat.id, "ai", fallback, sentId(o));
      }
      return "ai-limit";
    }
    const hist = await db.query.waMessages.findMany({ where: eq(schema.waMessages.chatId, chat.id), orderBy: desc(schema.waMessages.createdAt), limit: 30 });
    const turns = trimHistory(
      [...hist].reverse().filter((h) => h.role !== "system").map((h) => ({ role: h.role === "user" ? ("user" as const) : ("model" as const), text: h.text })),
      gate.params.turns,
      gate.turnChars,
    );
    const meter = aiMeter(ch, phone);
    try {
      reply = await geovanaReply(t, cfg, turns, phone, chat.name, { maxTokens: gate.params.maxTokens, catalogLimit: gate.params.catalogLimit, onUsage: meter.onUsage });
      await meter.save();
    } catch (e) {
      await meter.save();
      console.error("[geovana]", e instanceof Error ? e.message : e);
      await db.update(schema.waChats).set({ needsHuman: true }).where(eq(schema.waChats.id, chat.id));
      await store(t.id, chat.id, "system", `IA indisponível: ${e instanceof Error ? e.message : "erro"}`, null);
      return "ai-error";
    }
  }
  if (reply.text && !reply.handoff) {
    // trava contra loop: a IA repetindo a mesma resposta → não manda de novo, chama a equipe
    const lastBot = (await db.query.waMessages.findMany({ where: and(eq(schema.waMessages.chatId, chat.id), eq(schema.waMessages.role, "ai")), orderBy: desc(schema.waMessages.createdAt), limit: 3 })).map((h) => h.text);
    if (isRepeat(reply.text, lastBot)) {
      await logEvent({ channel: ch, type: "blocked", kind: "reply", contact: phone, reason: "resposta repetida da IA" });
      await db.update(schema.waChats).set({ needsHuman: true }).where(eq(schema.waChats.id, chat.id));
      await store(t.id, chat.id, "system", "IA repetiu a resposta — conversa passada para a equipe", null);
      return "repeat";
    }
  }
  if (reply.text) {
    const o = await sendText(t, cfg, phone, reply.text, "reply");
    if (o.status !== "blocked") await store(t.id, chat.id, "ai", reply.text, sentId(o));
    else await store(t.id, chat.id, "system", `Não enviado: ${o.reason}`, null);
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
    const chat = await chatFor(t.id, o.customerPhone, o.customerName);
    if (chat.optOut) return; // cliente pediu para não receber avisos
    const r = await sendText(t, cfg, o.customerPhone, text, "notice");
    if (r.status !== "blocked") await store(t.id, chat.id, "ai", text, sentId(r));
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
  // mostra no teste o que o cliente receberia fora do horário
  if (!geovanaAnswers(cfg.when, t.isOpen)) {
    const pt = getRegion(t.country).locale === "pt";
    const note = pt ? "(Simulação: agora ela NÃO responde — fora do horário escolhido.)" : "(Simulación: ahora NO responde — fuera del horario elegido.)";
    return { text: cfg.when === "open" && cfg.closedMessage ? `${closedNotice(t.name, cfg.hours, pt)}\n\n${note}` : note, handoff: false };
  }
  // o simulador também gasta IA: entra no orçamento da loja
  const ch = storeChannel(t.id);
  const gate = await aiGate(ch, null);
  if (gate.mode === "blocked") return { text: `(${gate.reason})`, handoff: false };
  const meter = aiMeter(ch, null);
  try {
    return await geovanaReply(t, cfg, history, null, null, { maxTokens: gate.params.maxTokens, catalogLimit: gate.params.catalogLimit, onUsage: meter.onUsage });
  } finally {
    await meter.save();
  }
}
