import "server-only";
// Geovana da GoWeb — IA no WhatsApp DA PRÓPRIA GoWeb: vendas (planos, links, agenda com sócio),
// CRM (cada conversa vira lead com origem do panfleto), suporte (chamado para lojas clientes),
// afiliados, leads esquentando e retorno automático. Regras puras em core/goweb-bot.ts.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { GwChat } from "@/db/schema";
import {
  FLYERS,
  buildGwPrompt,
  flyerFromText,
  followUpDue,
  googleCalendarLink,
  heatScore,
  parseGwBot,
  parseGwReply,
  type GwBotConfig,
  type GwContext,
  type GwReply,
} from "@/core/goweb-bot";
import { normalizeBrPhone } from "@/core/crm";
import { isPreLaunch } from "@/core/launch";
import { MODULES, MODULE_INFO, CORE_INFO, parseModulePrices } from "@/core/modules";
import { sortPlansByPrice } from "@/core/plans";
import { jidToE164 } from "@/core/geovana";
import { geminiChat, type ChatTurn } from "@/adapters/ai/gemini";
import { EvolutionError, evoConnect, evoCreateInstance, evoLogout, evoSendText, evoSetWebhook, evoState } from "@/adapters/whatsapp/evolution";
import { evoServer, whatsappPlatform } from "@/services/geovana";
import { upsertLead, activity } from "@/services/crm";
import { openTicket } from "@/services/support";
import { sendPush } from "@/services/push";
import { getSettings } from "@/services/billing";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";

export class GwBotError extends Error {}
const INSTANCE = "gw-goweb-oficial";
export const GW_ACTOR = "geovana"; // autor das atividades no CRM

// ---------------------------------------------------------------- config
export async function gwBotConfig(): Promise<GwBotConfig> {
  const s = await db.query.platformSettings.findFirst({ columns: { gwBotConfig: true } });
  return parseGwBot(s?.gwBotConfig);
}

export async function saveGwBot(patch: Partial<GwBotConfig>) {
  const next = { ...(await gwBotConfig()), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as GwBotConfig;
  if (!next.hookToken) next.hookToken = randomBytes(24).toString("base64url");
  const v = JSON.stringify(next);
  await db.insert(schema.platformSettings).values({ id: "default", gwBotConfig: v }).onConflictDoUpdate({ target: schema.platformSettings.id, set: { gwBotConfig: v, updatedAt: new Date() } });
  return next;
}

const hookUrl = (token: string) => `${appUrl()}/api/whatsapp/goweb/${token}`;

/** Conecta o WhatsApp da GoWeb no servidor Evolution e devolve o QR. */
export async function gwConnect() {
  const srv = await evoServer();
  const cfg = await saveGwBot({});
  let key = cfg.instanceKeySealed ? openSecret(cfg.instanceKeySealed) : "";
  if (!key) {
    try {
      key = await evoCreateInstance(srv, INSTANCE, hookUrl(cfg.hookToken));
    } catch (e) {
      if (!(e instanceof EvolutionError && (e.status === 403 || e.status === 400 || e.status === 409))) throw e;
      key = srv.key;
    }
  }
  await evoSetWebhook(srv, INSTANCE, hookUrl(cfg.hookToken)).catch(() => null);
  await saveGwBot({ instance: INSTANCE, instanceKeySealed: sealSecret(key) });
  return evoConnect(srv, INSTANCE);
}

export async function gwStatus(): Promise<{ connected: boolean; detail: string }> {
  const cfg = await gwBotConfig();
  if (!cfg.instance) return { connected: false, detail: "não conectado" };
  try {
    const st = await evoState(await evoServer(), cfg.instance);
    return { connected: st === "open", detail: st };
  } catch (e) {
    return { connected: false, detail: e instanceof Error ? e.message : "erro" };
  }
}

export async function gwDisconnect() {
  const cfg = await gwBotConfig();
  if (cfg.instance) await evoLogout(await evoServer(), cfg.instance).catch(() => null);
  await saveGwBot({ enabled: false });
}

export async function gwByHook(token: string) {
  if (!token || token.length < 20) return null;
  const cfg = await gwBotConfig();
  return cfg.hookToken && cfg.hookToken === token ? cfg : null;
}

/** Envia texto pelo WhatsApp da GoWeb. Devolve o id da mensagem (para não duplicar no webhook). */
export async function gwSend(toE164: string, text: string): Promise<string | null> {
  const cfg = await gwBotConfig();
  if (!cfg.instance) throw new GwBotError("WhatsApp da GoWeb não conectado.");
  const r = (await evoSendText(await evoServer(), cfg.instance, toE164, text)) as { key?: { id?: string } } | null;
  return r?.key?.id ?? null;
}

// ---------------------------------------------------------------- avisos aos sócios
/** Push no app do CRM + WhatsApp dos sócios cadastrados. Nunca lança erro. */
export async function notifyPartners(title: string, body: string, url = "/crm") {
  await sendPush("all", { title, body, url, tag: `gw-${Date.now()}` }).catch(() => 0);
  const cfg = await gwBotConfig();
  for (const p of cfg.partnerPhones) await gwSend(p, `*${title}*\n${body}${url.startsWith("http") ? `\n${url}` : `\n${appUrl()}${url}`}`).catch(() => null);
}

// ---------------------------------------------------------------- conversa
async function chatFor(phone: string, name: string | null): Promise<GwChat> {
  const found = await db.query.gwChats.findFirst({ where: eq(schema.gwChats.phone, phone) });
  if (found) {
    if (name && !found.name) await db.update(schema.gwChats).set({ name }).where(eq(schema.gwChats.id, found.id));
    return found;
  }
  // quem é: lojista cliente? afiliado? lead que já existe?
  const digits = phone.replace(/\D/g, "");
  const [cust, aff, lead] = await Promise.all([
    db.query.customers.findFirst({ where: and(eq(schema.customers.whatsapp, phone), isNotNull(schema.customers.tenantId)) }),
    db.query.affiliates.findFirst({ where: eq(schema.affiliates.whatsapp, phone) }),
    db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.phone, normalizeBrPhone(digits) ?? phone) }),
  ]);
  const [c] = await db
    .insert(schema.gwChats)
    .values({ phone, name, tenantId: cust?.tenantId ?? null, affiliateId: aff?.id ?? null, leadId: lead?.id ?? null })
    .onConflictDoNothing()
    .returning();
  return c ?? (await db.query.gwChats.findFirst({ where: eq(schema.gwChats.phone, phone) }))!;
}

async function store(chatId: string, role: "user" | "ai" | "staff" | "system", text: string, externalId: string | null) {
  const r = await db.insert(schema.gwMessages).values({ chatId, role, text: text.slice(0, 4000), externalId }).onConflictDoNothing().returning({ id: schema.gwMessages.id });
  return r.length > 0;
}

const OPT_OUT = /^\s*(parar|pare|sair|stop|cancelar mensagens|n[ãa]o quero (mais )?mensagens?)\s*[.!]*\s*$/i;
const HUMAN_WORDS = /\b(atendente|humano|pessoa|s[óo]cio|falar com algu[ée]m|l[áa]zaro)\b/i;

async function contextFor(chat: GwChat, cfg: GwBotConfig): Promise<GwContext> {
  const base = appUrl();
  const [plansRaw, settings, tenant, aff, lead] = await Promise.all([
    db.query.plans.findMany({ where: and(eq(schema.plans.active, true), eq(schema.plans.isCustom, false)), orderBy: asc(schema.plans.sortOrder) }),
    getSettings(),
    chat.tenantId ? db.query.tenants.findFirst({ where: eq(schema.tenants.id, chat.tenantId) }) : null,
    chat.affiliateId ? db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, chat.affiliateId) }) : null,
    chat.leadId ? db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.id, chat.leadId) }) : null,
  ]);
  const plans = sortPlansByPrice(plansRaw, "BRL");
  const mp = parseModulePrices(settings.modulePrices);
  const custPlan = tenant ? await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, tenant.id), with: { plan: true } }).catch(() => null) : null;
  return {
    now: new Date(),
    plans: plans.map((p) => ({ name: p.name, interval: p.interval, priceMinor: p.priceBrlMinor, setupMinor: p.setupBrlMinor, features: (p.features ?? "").split("\n").map((f) => f.trim()).filter(Boolean), intelligence: p.intelligence })),
    custom: mp.enabled
      ? { enabled: true, coreMinor: mp.core.BRL, setupMinor: mp.setup.BRL, modules: MODULES.map((m) => ({ name: MODULE_INFO[m].pt, desc: MODULE_INFO[m].descPt, priceMinor: mp.modules[m].BRL })) }
      : null,
    links: {
      site: base,
      planos: `${base}/planos?lang=pt`,
      contratar: `${base}/contratar?lang=pt`,
      personalizado: `${base}/contratar?plano=personalizado&lang=pt`,
      shopping: `${base}/shopping?lang=pt`,
      afiliados: `${base}/afiliados`,
    },
    extra: [cfg.extra, `Base de toda loja: ${CORE_INFO.pt} — ${CORE_INFO.descPt}`].filter(Boolean).join("\n"),
    hours: cfg.hours,
    launch: isPreLaunch() ? "12/11/2026" : null,
    store: tenant ? { name: tenant.name, slug: tenant.slug, plan: (custPlan as { plan?: { name?: string } } | null)?.plan?.name ?? null } : null,
    affiliate: aff ? { name: aff.name, code: aff.code, link: `${base}/a/${aff.code}`, tier: aff.status === "ACTIVE" ? "ativo" : "aguardando aprovação" } : null,
    lead: lead ? { name: lead.name, status: lead.status, demoAt: lead.demoAt ? lead.demoAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null } : null,
    flyer: chat.flyer,
    contactName: chat.name,
  };
}

async function aiKey() {
  const p = await whatsappPlatform();
  const key = (p.geminiKeySealed && openSecret(p.geminiKeySealed)) || process.env.GEMINI_API_KEY || "";
  if (!key) throw new GwBotError("Chave do Gemini não cadastrada (Admin → Configurações → Geovana).");
  return { key, model: p.model };
}

/** Gera a resposta (sem enviar). Usado pelo webhook e pelo simulador do admin. */
export async function gwReply(chat: GwChat, cfg: GwBotConfig, turns: ChatTurn[]): Promise<GwReply> {
  const { key, model } = await aiKey();
  const system = buildGwPrompt(await contextFor(chat, cfg));
  const raw = await geminiChat({ key, model, system, history: turns, maxTokens: 700, temperature: 0.5 });
  return parseGwReply(raw, new Date());
}

/** Aplica as marcações da resposta: lead no CRM, agenda, chamado, chamar sócio. Devolve texto extra para o cliente. */
async function applyReply(chat: GwChat, r: GwReply): Promise<string> {
  let extra = "";
  const who = chat.name || chat.phone;
  // ---- CRM
  if (r.lead && !chat.tenantId && !chat.affiliateId) {
    const name = r.lead.negocio || (r.lead.tipo && r.lead.cidade ? `${r.lead.tipo} (${r.lead.cidade})` : null) || r.lead.contato || chat.name || chat.phone;
    const origin = chat.flyer ? FLYERS[chat.flyer] ?? chat.flyer : "WhatsApp";
    const { lead, created } = await upsertLead(
      { name, category: r.lead.tipo ?? null, city: r.lead.cidade ?? null, phone: chat.phone, pain: r.lead.dor ?? null, notes: `Origem: ${origin}${r.lead.contato ? ` · Contato: ${r.lead.contato}` : ""}` },
      "whatsapp",
      GW_ACTOR,
    );
    if (chat.leadId !== lead.id) {
      await db.update(schema.gwChats).set({ leadId: lead.id }).where(eq(schema.gwChats.id, chat.id));
      chat.leadId = lead.id;
    }
    if (created) {
      await db.update(schema.crmLeads).set({ status: "CONTACT", contactAt: new Date(), lastContactAt: new Date() }).where(eq(schema.crmLeads.id, lead.id));
      await notifyPartners("Novo lead no WhatsApp", `${name}${r.lead.cidade ? ` · ${r.lead.cidade}` : ""} — origem: ${origin}`, `/crm/leads/${lead.id}`);
    }
  }
  // ---- agenda com sócio
  if (r.schedule) {
    const when = r.schedule.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    let leadName = who;
    if (chat.leadId) {
      const l = await db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.id, chat.leadId) });
      leadName = l?.name ?? who;
      await db.update(schema.crmLeads).set({ status: "DEMO", demoAt: r.schedule, followUpAt: r.schedule, followUpNotifiedAt: null, updatedAt: new Date() }).where(eq(schema.crmLeads.id, chat.leadId));
      await activity(chat.leadId, GW_ACTOR, "demo", "whatsapp", `Conversa marcada pela Geovana: ${when}`);
    }
    const cal = googleCalendarLink(`GoWeb · conversa com ${leadName}`, r.schedule, `WhatsApp: ${chat.phone}\nMarcado pela Geovana.\n${appUrl()}/crm`);
    await notifyPartners("Conversa marcada", `${leadName} — ${when}. WhatsApp ${chat.phone}`, cal);
  }
  // ---- suporte (só lojas clientes)
  if (r.support && chat.tenantId) {
    const t = await openTicket({ tenantId: chat.tenantId, openedBy: "Geovana (WhatsApp)", category: r.support.priority === "urgente" || r.support.priority === "alta" ? "problema" : "duvida", priority: r.support.priority, subject: r.support.subject, body: `${r.support.body}\n\n(Aberto pela Geovana no WhatsApp ${chat.phone})` }).catch(() => null);
    if (t) extra += `\n\nAbri o chamado *${(t as { protocol?: string }).protocol ?? ""}* para a equipe. Você acompanha em Painel → Suporte.`;
  }
  // ---- chamar sócio
  if (r.human) {
    await db.update(schema.gwChats).set({ needsHuman: true, pausedUntil: null }).where(eq(schema.gwChats.id, chat.id));
    await notifyPartners("Cliente pediu um sócio", `${who} no WhatsApp da GoWeb${chat.tenantId ? " (lojista)" : chat.affiliateId ? " (afiliado)" : ""}.`, "/admin/geovana");
  }
  return extra;
}

export async function handleGwInbound(m: { jid: string; name: string | null; text: string; externalId: string | null; fromMe: boolean }) {
  const phone = jidToE164(m.jid);
  if (!phone || !m.text.trim()) return "ignored";
  const cfg = await gwBotConfig();
  const chat = await chatFor(phone, m.fromMe ? null : m.name);
  if (m.fromMe) {
    // mensagem enviada pelo celular da GoWeb (sócio) → pausa a IA nessa conversa
    const fresh = await store(chat.id, "staff", m.text, m.externalId);
    if (fresh) await db.update(schema.gwChats).set({ pausedUntil: new Date(Date.now() + cfg.pauseMinutes * 60_000), needsHuman: false, lastBotAt: new Date() }).where(eq(schema.gwChats.id, chat.id));
    return fresh ? "staff" : "echo";
  }
  if (!(await store(chat.id, "user", m.text, m.externalId))) return "duplicate";
  const flyer = chat.flyer ? null : flyerFromText(m.text);
  await db.update(schema.gwChats).set({ lastUserAt: new Date(), followUpsSent: 0, ...(flyer ? { flyer } : {}) }).where(eq(schema.gwChats.id, chat.id));
  if (flyer) chat.flyer = flyer;

  if (OPT_OUT.test(m.text)) {
    await db.update(schema.gwChats).set({ optOut: true }).where(eq(schema.gwChats.id, chat.id));
    if (cfg.enabled) await sendAndStore(chat, "Pronto, não vou mais te mandar mensagens por aqui. Se precisar, é só chamar! 👋");
    return "opt-out";
  }
  if (chat.optOut) await db.update(schema.gwChats).set({ optOut: false }).where(eq(schema.gwChats.id, chat.id));
  if (!cfg.enabled) return "disabled";
  if (chat.pausedUntil && chat.pausedUntil > new Date()) return "paused";
  if (chat.needsHuman) return "waiting-human";

  // leads esquentando
  const hist = await db.query.gwMessages.findMany({ where: eq(schema.gwMessages.chatId, chat.id), orderBy: desc(schema.gwMessages.createdAt), limit: 20 });
  const userMsgs = hist.filter((h) => h.role === "user").map((h) => h.text);
  const heat = heatScore(userMsgs);
  await db.update(schema.gwChats).set({ heat }).where(eq(schema.gwChats.id, chat.id));
  if (heat >= 60 && !chat.hotNotifiedAt && !chat.tenantId && !chat.affiliateId) {
    await db.update(schema.gwChats).set({ hotNotifiedAt: new Date() }).where(eq(schema.gwChats.id, chat.id));
    await notifyPartners("Lead esquentando 🔥", `${chat.name || chat.phone} está perguntando de preço/contratação no WhatsApp. Bom momento para um sócio entrar.`, chat.leadId ? `/crm/leads/${chat.leadId}` : "/admin/geovana");
  }

  if (HUMAN_WORDS.test(m.text)) {
    await sendAndStore(chat, "Claro! Já chamei um dos sócios da GoWeb para falar com você por aqui. 🙌");
    await applyReply(chat, { text: "", lead: null, schedule: null, support: null, human: true });
    return "handoff";
  }

  const turns: ChatTurn[] = hist
    .reverse()
    .filter((h) => h.role !== "system")
    .map((h) => ({ role: h.role === "user" ? "user" : "model", text: h.text }));
  let r: GwReply;
  try {
    r = await gwReply(chat, cfg, turns);
  } catch (e) {
    console.error("[gw-bot]", e instanceof Error ? e.message : e);
    await store(chat.id, "system", `IA indisponível: ${e instanceof Error ? e.message : "erro"}`, null);
    await db.update(schema.gwChats).set({ needsHuman: true }).where(eq(schema.gwChats.id, chat.id));
    await notifyPartners("Geovana sem IA agora", `${chat.name || chat.phone} mandou mensagem e a IA não respondeu. Responda pelo WhatsApp da GoWeb.`, "/admin/geovana");
    return "ai-error";
  }
  const extra = await applyReply(chat, r).catch((e) => {
    console.error("[gw-bot apply]", e);
    return "";
  });
  if (r.text || extra) await sendAndStore(chat, `${r.text}${extra}`.trim());
  return r.human ? "handoff" : "replied";
}

async function sendAndStore(chat: GwChat, text: string) {
  const id = await gwSend(chat.phone, text).catch((e) => {
    console.error("[gw-bot send]", e instanceof Error ? e.message : e);
    return null;
  });
  await store(chat.id, "ai", text, id);
  await db.update(schema.gwChats).set({ lastBotAt: new Date() }).where(eq(schema.gwChats.id, chat.id));
}

/** Simulador do admin: responde sem enviar nada nem mexer no CRM. */
export async function gwSimulate(turns: ChatTurn[], as: "lead" | "store" | "affiliate") {
  const cfg = await gwBotConfig();
  const fake = { id: "sim", phone: "+5581900000000", name: "Teste", leadId: null, tenantId: null, affiliateId: null, flyer: flyerFromText(turns.map((t) => t.text).join(" ")), pausedUntil: null, needsHuman: false, heat: 0, hotNotifiedAt: null, lastUserAt: null, lastBotAt: null, followUpsSent: 0, optOut: false, createdAt: new Date() } as GwChat;
  if (as === "store") {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.demo, false) });
    fake.tenantId = t?.id ?? null;
  }
  if (as === "affiliate") {
    const a = await db.query.affiliates.findFirst();
    fake.affiliateId = a?.id ?? null;
  }
  const r = await gwReply(fake, cfg, turns);
  const tags = [r.lead ? `LEAD ${JSON.stringify(r.lead)}` : "", r.schedule ? `AGENDAR ${r.schedule.toISOString()}` : "", r.support ? `SUPORTE ${r.support.priority}: ${r.support.subject}` : "", r.human ? "HUMANO" : ""].filter(Boolean);
  return { text: r.text, tags };
}

// ---------------------------------------------------------------- painel do admin
export async function gwChatsList(limit = 60) {
  return db.query.gwChats.findMany({ orderBy: desc(schema.gwChats.lastUserAt), limit });
}
export async function gwChatMessages(chatId: string) {
  return db.query.gwMessages.findMany({ where: eq(schema.gwMessages.chatId, chatId), orderBy: asc(schema.gwMessages.createdAt), limit: 200 });
}
/** Sócio responde pelo admin (também pausa a IA nessa conversa). */
export async function gwStaffReply(chatId: string, text: string, by: string) {
  const chat = await db.query.gwChats.findFirst({ where: eq(schema.gwChats.id, chatId) });
  if (!chat) throw new GwBotError("Conversa não encontrada.");
  const cfg = await gwBotConfig();
  const id = await gwSend(chat.phone, text);
  await store(chat.id, "staff", `${text}`, id);
  await db.update(schema.gwChats).set({ pausedUntil: new Date(Date.now() + cfg.pauseMinutes * 60_000), needsHuman: false, lastBotAt: new Date() }).where(eq(schema.gwChats.id, chat.id));
  if (chat.leadId) await activity(chat.leadId, by, "contact", "whatsapp", text.slice(0, 300));
}
export async function gwResume(chatId: string) {
  await db.update(schema.gwChats).set({ pausedUntil: null, needsHuman: false }).where(eq(schema.gwChats.id, chatId));
}

// ---------------------------------------------------------------- retorno automático (cron)
/** Leads que pararam de responder recebem um retorno curto e simpático (24 h, 72 h…), só em horário comercial. */
export async function runGwFollowUps(now = new Date()) {
  const cfg = await gwBotConfig();
  if (!cfg.enabled || !cfg.autoFollowUp || !cfg.instance) return { sent: 0 };
  const chats = await db.query.gwChats.findMany({
    where: and(
      isNotNull(schema.gwChats.leadId),
      isNull(schema.gwChats.tenantId),
      isNull(schema.gwChats.affiliateId),
      eq(schema.gwChats.optOut, false),
      eq(schema.gwChats.needsHuman, false),
      or(isNull(schema.gwChats.pausedUntil), lt(schema.gwChats.pausedUntil, now)),
      lt(schema.gwChats.followUpsSent, cfg.followUpHours.length),
    ),
    limit: 40,
  });
  let sent = 0;
  for (const chat of chats) {
    const step = followUpDue(chat.lastUserAt, chat.lastBotAt, chat.followUpsSent, cfg.followUpHours, now);
    if (step === null) continue;
    const lead = await db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.id, chat.leadId!) });
    if (!lead || lead.status === "WON" || lead.status === "LOST") continue;
    const hist = await db.query.gwMessages.findMany({ where: eq(schema.gwMessages.chatId, chat.id), orderBy: desc(schema.gwMessages.createdAt), limit: 12 });
    const turns: ChatTurn[] = hist.reverse().filter((h) => h.role !== "system").map((h) => ({ role: h.role === "user" ? "user" : "model", text: h.text }));
    turns.push({ role: "user", text: `[INSTRUÇÃO INTERNA, não é o cliente] O cliente parou de responder há ${Math.round((now.getTime() - (chat.lastBotAt?.getTime() ?? now.getTime())) / 3600_000)} h. Escreva UM retorno curto (até 2 linhas), simpático, retomando o ponto da conversa e terminando com uma pergunta fácil de responder. ${step === cfg.followUpHours.length - 1 ? "É o último retorno: diga que fica à disposição." : ""} Não use marcações.` });
    try {
      const r = await gwReply(chat, cfg, turns);
      if (!r.text) continue;
      await sendAndStore(chat, r.text);
      await db.update(schema.gwChats).set({ followUpsSent: step + 1 }).where(eq(schema.gwChats.id, chat.id));
      await activity(chat.leadId!, GW_ACTOR, "contact", "whatsapp", `Retorno automático ${step + 1}: ${r.text.slice(0, 200)}`);
      sent++;
    } catch (e) {
      console.error("[gw-bot follow-up]", e instanceof Error ? e.message : e);
      break; // IA fora do ar: tenta na próxima rodada
    }
  }
  return { sent };
}
