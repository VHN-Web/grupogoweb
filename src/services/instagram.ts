import "server-only";
// =============================================================================
// Instagram (Direct) com a Geovana — conta institucional da GoWeb + contas das lojas GoInteligence.
// API oficial da Meta (Instagram API with Instagram Login). Regras puras em core/instagram.ts.
// O cérebro é o mesmo do WhatsApp: geovanaReply (lojas) e gwReply (GoWeb); o orçamento/franquia de IA é o
// mesmo canal da loja na proteção (store:<id>), então WhatsApp + Instagram somam na franquia.
// Plano conferido no SERVIDOR: no login, em cada aviso da Meta e em cada envio.
// =============================================================================
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { IgAccount, IgChat, Tenant } from "@/db/schema";
import { igAuthUrl, igContact, igLogChannel, igVerifySignature, igWindowOpen, instagramAllowed, makeState, missingScopes, parseIgWebhook, readState, tokenNeedsRefresh, type IgEvent, type IgScope } from "@/core/instagram";
import { geovanaAnswers, wantsHuman } from "@/core/geovana";
import { aiFallbackText, costUsd, isRepeat, trimHistory } from "@/core/wa-guard";
import { brMonthStart } from "@/core/crm";
import { getRegion, tr } from "@/core/region";
import { IgError, igExchangeCode, igLongToken, igMe, igProfile, igRefreshToken, igSendText, igSubscribe, igUnsubscribe } from "@/adapters/instagram/client";
import type { OnUsage } from "@/adapters/ai/gemini";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";
import { audit } from "@/lib/security";
import { GOWEB, aiGate, aiMeter, getState, guardConfig, logEvent, storeChannel } from "@/services/wa-guard";
import { geovanaOf, geovanaReply } from "@/services/geovana";

export class InstagramError extends Error {}
export { IgError };

// ---------------------------------------------------------------- app da Meta (Admin → Geovana → Instagram)
export type IgPlatform = { appId: string; appSecretSealed: string; verifyToken: string };

export async function igPlatform(): Promise<IgPlatform> {
  const s = await db.query.platformSettings.findFirst({ columns: { igConfig: true } });
  let o: Partial<IgPlatform> = {};
  try {
    o = JSON.parse(s?.igConfig ?? "{}");
  } catch {}
  return {
    appId: o.appId || process.env.IG_APP_ID || "",
    appSecretSealed: o.appSecretSealed || (process.env.IG_APP_SECRET ? sealSecret(process.env.IG_APP_SECRET) : ""),
    verifyToken: o.verifyToken || process.env.IG_VERIFY_TOKEN || "",
  };
}

export async function saveIgPlatform(patch: { appId?: string; appSecret?: string }) {
  const cur = await igPlatform();
  const next: IgPlatform = {
    appId: patch.appId?.trim() || cur.appId,
    appSecretSealed: patch.appSecret?.trim() ? sealSecret(patch.appSecret.trim()) : cur.appSecretSealed,
    verifyToken: cur.verifyToken || randomBytes(18).toString("base64url"),
  };
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", igConfig: JSON.stringify(next) })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { igConfig: JSON.stringify(next), updatedAt: new Date() } });
  return next;
}

export const igRedirectUri = () => `${appUrl()}/api/instagram/oauth/callback`;
export const igWebhookUrl = () => `${appUrl()}/api/instagram/webhook`;
export const igConfigured = (p: IgPlatform) => !!(p.appId && p.appSecretSealed);

// ---------------------------------------------------------------- plano (servidor)
export function assertTenantInstagram(t: Pick<Tenant, "tier" | "demo" | "country">) {
  const r = instagramAllowed({ tier: t.tier, demo: t.demo, country: t.country });
  if (!r.ok) throw new InstagramError(r.reason);
}

// ---------------------------------------------------------------- login
/** URL do login oficial. Quem chama já conferiu a sessão (admin da plataforma ou dono da loja). */
export async function igLoginUrl(scope: IgScope, actor: string) {
  const p = await igPlatform();
  if (!igConfigured(p)) throw new InstagramError("O app do Instagram ainda não foi cadastrado pela GoWeb (Admin → Geovana → Instagram).");
  if (scope !== "goweb") {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, scope.tenantId) });
    if (!t) throw new InstagramError("Loja não encontrada.");
    assertTenantInstagram(t);
  }
  const state = sealSecret(JSON.stringify(makeState(scope, actor, Date.now(), randomBytes(8).toString("hex"))));
  return igAuthUrl({ appId: p.appId, redirectUri: igRedirectUri(), state });
}

/** Volta do login: confere o state, o plano (de novo), troca o código, liga o webhook e guarda a conta. */
export async function igFinishLogin(code: string, stateRaw: string) {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(openSecret(stateRaw));
  } catch {}
  const st = readState(parsed, Date.now());
  if (!st) throw new InstagramError("Login expirado ou inválido. Tente conectar de novo.");
  let tenant: Tenant | null = null;
  if (st.scope === "store") {
    tenant = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, st.tenantId!) })) ?? null;
    if (!tenant) throw new InstagramError("Loja não encontrada.");
    assertTenantInstagram(tenant);
  }
  const p = await igPlatform();
  const secret = openSecret(p.appSecretSealed);
  const short = await igExchangeCode({ appId: p.appId, appSecret: secret, redirectUri: igRedirectUri(), code });
  const missing = missingScopes(short.permissions);
  if (missing.length) throw new InstagramError(`Faltou autorizar: ${missing.join(", ")}. Conecte de novo e deixe as permissões marcadas.`);
  const long = await igLongToken(secret, short.token);
  const me = await igMe(long.token);
  // a mesma conta não pode atender duas lojas (os avisos da Meta chegam por conta)
  const other = await db.query.igAccounts.findFirst({ where: eq(schema.igAccounts.igUserId, me.userId) });
  if (other && other.tenantId !== (tenant?.id ?? null)) throw new InstagramError("Esta conta do Instagram já está conectada em outro lugar da GoWeb.");
  await igSubscribe(long.token);
  const values = {
    tenantId: tenant?.id ?? null,
    igUserId: me.userId,
    username: me.username,
    tokenSealed: sealSecret(long.token),
    tokenIssuedAt: new Date(),
    tokenExpiresAt: long.expiresAt,
    status: "active" as const,
    lastError: null,
    connectedBy: st.actor,
    updatedAt: new Date(),
  };
  const current = await accountFor(tenant ? { tenantId: tenant.id } : "goweb");
  if (current) await db.update(schema.igAccounts).set(values).where(eq(schema.igAccounts.id, current.id));
  else await db.insert(schema.igAccounts).values(values);
  await audit(tenant?.id ?? null, st.actor, "instagram.conectar", `@${me.username ?? me.userId}`);
  return { scope: st.scope, tenant, username: me.username };
}

export async function accountFor(scope: IgScope) {
  return (await db.query.igAccounts.findFirst({ where: scope === "goweb" ? isNull(schema.igAccounts.tenantId) : eq(schema.igAccounts.tenantId, scope.tenantId) })) ?? null;
}

export async function igDisconnect(scope: IgScope, actor: string) {
  const acc = await accountFor(scope);
  if (!acc) return;
  await igUnsubscribe(openSecret(acc.tokenSealed));
  await db.delete(schema.igAccounts).where(eq(schema.igAccounts.id, acc.id));
  await audit(scope === "goweb" ? null : scope.tenantId, actor, "instagram.desconectar", `@${acc.username ?? acc.igUserId}`);
}

export async function igSetAi(scope: IgScope, on: boolean) {
  const acc = await accountFor(scope);
  if (acc) await db.update(schema.igAccounts).set({ aiEnabled: on, updatedAt: new Date() }).where(eq(schema.igAccounts.id, acc.id));
}

/** Cron diário: renova tokens perto de vencer; conta de loja que saiu do GoInteligence fica pausada. */
export async function igMaintenance(now = Date.now()) {
  const all = await db.query.igAccounts.findMany();
  let refreshed = 0;
  for (const a of all) {
    if (a.tenantId) {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, a.tenantId), columns: { tier: true, demo: true, country: true } });
      const ok = t ? instagramAllowed({ tier: t.tier, demo: t.demo, country: t.country }).ok : false;
      if (!ok && a.status === "active") await db.update(schema.igAccounts).set({ status: "paused", lastError: "Plano sem GoInteligence: Instagram pausado.", updatedAt: new Date() }).where(eq(schema.igAccounts.id, a.id));
      if (ok && a.status === "paused" && a.lastError?.startsWith("Plano")) await db.update(schema.igAccounts).set({ status: "active", lastError: null, updatedAt: new Date() }).where(eq(schema.igAccounts.id, a.id));
    }
    if (!tokenNeedsRefresh({ expiresAt: a.tokenExpiresAt, issuedAt: a.tokenIssuedAt }, now)) continue;
    try {
      const t = await igRefreshToken(openSecret(a.tokenSealed));
      await db.update(schema.igAccounts).set({ tokenSealed: sealSecret(t.token), tokenIssuedAt: new Date(now), tokenExpiresAt: t.expiresAt, updatedAt: new Date() }).where(eq(schema.igAccounts.id, a.id));
      refreshed++;
    } catch (e) {
      await db.update(schema.igAccounts).set({ status: "error", lastError: `Renovação do acesso falhou: ${e instanceof Error ? e.message : "erro"}. Reconecte.`, updatedAt: new Date() }).where(eq(schema.igAccounts.id, a.id));
    }
  }
  return { accounts: all.length, refreshed };
}

// ---------------------------------------------------------------- webhook
/** GET de verificação da Meta (hub.challenge). */
export async function igVerifyChallenge(mode: string | null, token: string | null, challenge: string | null) {
  const p = await igPlatform();
  return mode === "subscribe" && !!p.verifyToken && token === p.verifyToken && challenge ? challenge : null;
}

export async function igSignatureOk(raw: string, header: string | null) {
  const p = await igPlatform();
  return igVerifySignature(raw, header, p.appSecretSealed ? openSecret(p.appSecretSealed) : "");
}

/** Processa um aviso (já com assinatura conferida). Cada mensagem é independente. */
export async function handleIgWebhook(body: unknown) {
  const out: string[] = [];
  for (const ev of parseIgWebhook(body)) {
    const acc = await db.query.igAccounts.findFirst({ where: eq(schema.igAccounts.igUserId, ev.accountId) });
    if (!acc) {
      out.push("unknown-account");
      continue;
    }
    try {
      out.push(await handleEvent(acc, ev));
    } catch (e) {
      console.error("[instagram]", e instanceof Error ? e.message : e);
      out.push("error");
    }
  }
  return out;
}

const scopeOfAcc = (a: IgAccount): IgScope => (a.tenantId ? { tenantId: a.tenantId } : "goweb");

async function chatFor(acc: IgAccount, igsid: string) {
  const [c] = await db
    .insert(schema.igChats)
    .values({ accountId: acc.id, tenantId: acc.tenantId, igsid })
    .onConflictDoUpdate({ target: [schema.igChats.accountId, schema.igChats.igsid], set: { lastAt: new Date() } })
    .returning();
  return c;
}

async function store(chatId: string, role: "user" | "ai" | "staff" | "system", text: string, externalId: string | null) {
  const r = await db.insert(schema.igMessages).values({ chatId, role, text: text.slice(0, 4000), externalId }).onConflictDoNothing().returning({ id: schema.igMessages.id });
  return r.length > 0;
}

async function handleEvent(acc: IgAccount, ev: IgEvent): Promise<string> {
  const scope = scopeOfAcc(acc);
  const logCh = igLogChannel(scope);
  const contact = igContact(ev.contactId);
  const chat = await chatFor(acc, ev.contactId);

  if (ev.echo) {
    // eco do que nós mesmos enviamos (já guardado com o mid) ou resposta da equipe pelo app do Instagram → pausa a IA
    if (ev.mid && (await db.query.igMessages.findFirst({ where: eq(schema.igMessages.externalId, ev.mid), columns: { id: true } }))) return "echo";
    if (await store(chat.id, "staff", ev.text || "[mídia]", ev.mid)) {
      const pause = acc.tenantId ? geovanaOf((await db.query.tenants.findFirst({ where: eq(schema.tenants.id, acc.tenantId) }))!).pauseMinutes : 60;
      await db.update(schema.igChats).set({ pausedUntil: new Date(Date.now() + pause * 60_000), needsHuman: false }).where(eq(schema.igChats.id, chat.id));
    }
    return "staff";
  }

  if (!(await store(chat.id, "user", ev.text || "[foto/vídeo/áudio]", ev.mid))) return "duplicate";
  await db.update(schema.igChats).set({ lastInboundAt: ev.at, lastAt: new Date() }).where(eq(schema.igChats.id, chat.id));
  chat.lastInboundAt = ev.at;
  await logEvent({ channel: logCh, tenantId: acc.tenantId, type: "in", contact });
  if (!chat.name && !chat.username) {
    const prof = await igProfile(openSecret(acc.tokenSealed), ev.contactId).catch(() => null);
    if (prof) await db.update(schema.igChats).set({ name: prof.name, username: prof.username }).where(eq(schema.igChats.id, chat.id));
    chat.name = prof?.name ?? null;
    chat.username = prof?.username ?? null;
  }

  // ---- pode responder? (tudo no servidor)
  if (acc.status !== "active" || !acc.aiEnabled) return "ai-off";
  let tenant: Tenant | null = null;
  if (acc.tenantId) {
    tenant = (await db.query.tenants.findFirst({ where: eq(schema.tenants.id, acc.tenantId) })) ?? null;
    if (!tenant || !instagramAllowed({ tier: tenant.tier, demo: tenant.demo, country: tenant.country }).ok) {
      await db.update(schema.igAccounts).set({ status: "paused", lastError: "Plano sem GoInteligence: Instagram pausado.", updatedAt: new Date() }).where(eq(schema.igAccounts.id, acc.id));
      return "plan";
    }
    const cfg = geovanaOf(tenant);
    if (!cfg.enabled) return "ai-off";
    if (!geovanaAnswers(cfg.when, tenant.isOpen)) return "off-hours";
  }
  if (chat.pausedUntil && chat.pausedUntil > new Date()) return "paused";
  if (!ev.text.trim()) {
    // foto/áudio: a IA não vê — a equipe responde
    await db.update(schema.igChats).set({ needsHuman: true }).where(eq(schema.igChats.id, chat.id));
    return "media";
  }

  const pt = tenant ? getRegion(tenant.country).locale === "pt" : true;
  const T = (es: string, ptx: string) => (pt ? ptx : es);
  const human = tenant ? wantsHuman(ev.text, geovanaOf(tenant).handoffWords) : /\b(humano|atendente|s[oó]cio|pessoa)\b/i.test(ev.text);
  if (human) {
    await db.update(schema.igChats).set({ needsHuman: true, pausedUntil: new Date(Date.now() + 60 * 60_000) }).where(eq(schema.igChats.id, chat.id));
    await sendAndStore(acc, chat, T("Perfecto, ya llamo a alguien del equipo para atenderte. 🙌", "Certo! Já chamei alguém da equipe para te atender. 🙌"));
    if (!tenant) await notifyGoWeb("Pediram um sócio no Instagram", `${who(chat)} no Direct da GoWeb.`);
    return "handoff";
  }

  // ---- IA: mesma proteção e mesmo orçamento/franquia do WhatsApp da loja
  const aiCh = tenant ? storeChannel(tenant.id) : GOWEB;
  const gate = await aiGate(aiCh, contact);
  if (gate.mode === "blocked") {
    if (gate.emergency) return "emergency";
    await db.update(schema.igChats).set({ needsHuman: true }).where(eq(schema.igChats.id, chat.id));
    await store(chat.id, "system", `IA em economia: ${gate.reason}`, null);
    const fallback = aiFallbackText(tenant ? "store" : "goweb", pt);
    const recent = await db.query.igMessages.findFirst({ where: and(eq(schema.igMessages.chatId, chat.id), eq(schema.igMessages.role, "ai"), eq(schema.igMessages.text, fallback), gte(schema.igMessages.createdAt, new Date(Date.now() - 6 * 3600_000))) });
    if (!recent) await sendAndStore(acc, chat, fallback);
    return "ai-limit";
  }
  const hist = await db.query.igMessages.findMany({ where: eq(schema.igMessages.chatId, chat.id), orderBy: desc(schema.igMessages.createdAt), limit: 30 });
  const turns = trimHistory(
    [...hist].reverse().filter((h) => h.role !== "system").map((h) => ({ role: h.role === "user" ? ("user" as const) : ("model" as const), text: h.text })),
    gate.params.turns,
    gate.turnChars,
  );
  const meter = aiMeter(aiCh, contact);
  let text = "";
  try {
    if (tenant) {
      const r = await geovanaReply(tenant, geovanaOf(tenant), turns, null, chat.name, { maxTokens: gate.params.maxTokens, catalogLimit: gate.params.catalogLimit, onUsage: meter.onUsage });
      text = r.text;
      if (r.handoff) await db.update(schema.igChats).set({ needsHuman: true, pausedUntil: new Date(Date.now() + geovanaOf(tenant).pauseMinutes * 60_000) }).where(eq(schema.igChats.id, chat.id));
    } else {
      text = await gowebReply(chat, turns, { maxTokens: gate.params.maxTokens, onUsage: meter.onUsage });
    }
  } catch (e) {
    console.error("[instagram ia]", e instanceof Error ? e.message : e);
    await db.update(schema.igChats).set({ needsHuman: true }).where(eq(schema.igChats.id, chat.id));
    await store(chat.id, "system", `IA indisponível: ${e instanceof Error ? e.message : "erro"}`, null);
    return "ai-error";
  } finally {
    await meter.save();
  }
  if (!text.trim()) return "empty";
  const lastBot = (await db.query.igMessages.findMany({ where: and(eq(schema.igMessages.chatId, chat.id), eq(schema.igMessages.role, "ai")), orderBy: desc(schema.igMessages.createdAt), limit: 3 })).map((h) => h.text);
  if (isRepeat(text, lastBot)) {
    await logEvent({ channel: logCh, tenantId: acc.tenantId, type: "blocked", kind: "reply", contact, reason: "resposta repetida da IA" });
    await db.update(schema.igChats).set({ needsHuman: true }).where(eq(schema.igChats.id, chat.id));
    await store(chat.id, "system", "IA repetiu a resposta — conversa passada para a equipe", null);
    return "repeat";
  }
  await sendAndStore(acc, chat, text);
  return "replied";
}

const who = (c: Pick<IgChat, "name" | "username" | "igsid">) => c.name || (c.username ? `@${c.username}` : `Instagram ${c.igsid.slice(-4)}`);

/** GoWeb: o mesmo cérebro da Geovana do WhatsApp da GoWeb (planos, preços, links), com marcações de lead/agenda/sócio. */
async function gowebReply(chat: IgChat, turns: { role: "user" | "model"; text: string }[], opts: { maxTokens: number; onUsage: OnUsage }) {
  const gw = await import("@/services/goweb-bot");
  const cfg = await gw.gwBotConfig();
  // contexto de lead: no Instagram não há telefone; o @ vai como nome do contato
  const fake: schema.GwChat = {
    id: chat.id,
    phone: "",
    name: chat.name ?? (chat.username ? `@${chat.username}` : null),
    leadId: chat.leadId,
    tenantId: null,
    affiliateId: null,
    flyer: null,
    pausedUntil: null,
    needsHuman: false,
    heat: 0,
    hotNotifiedAt: null,
    lastUserAt: null,
    lastBotAt: null,
    followUpsSent: 0,
    optOut: false,
    createdAt: chat.createdAt,
  };
  const r = await gw.gwReply(fake, cfg, turns, opts);
  if (r.lead) {
    const { upsertLead } = await import("@/services/crm");
    const name = r.lead.negocio || (r.lead.tipo && r.lead.cidade ? `${r.lead.tipo} (${r.lead.cidade})` : null) || r.lead.contato || who(chat);
    const { lead, created } = await upsertLead(
      { name, category: r.lead.tipo ?? null, city: r.lead.cidade ?? null, instagram: chat.username ? `@${chat.username}` : null, pain: r.lead.dor ?? null, notes: `Origem: Instagram (Direct)${r.lead.contato ? ` · Contato: ${r.lead.contato}` : ""}` },
      "instagram",
      gw.GW_ACTOR,
    );
    if (chat.leadId !== lead.id) await db.update(schema.igChats).set({ leadId: lead.id }).where(eq(schema.igChats.id, chat.id));
    if (created) await gw.notifyPartners("Novo lead no Instagram", `${name}${r.lead.cidade ? ` · ${r.lead.cidade}` : ""}`, `/crm/leads/${lead.id}`, "leads");
  }
  if (r.schedule) {
    const when = r.schedule.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await gw.notifyPartners("Conversa marcada (Instagram)", `${who(chat)} — ${when}`, "/admin/geovana/conversas", "demos");
  }
  if (r.human) {
    await db.update(schema.igChats).set({ needsHuman: true }).where(eq(schema.igChats.id, chat.id));
    await notifyGoWeb("Pediram um sócio no Instagram", `${who(chat)} no Direct da GoWeb.`);
  }
  return r.text;
}

async function notifyGoWeb(title: string, body: string) {
  const gw = await import("@/services/goweb-bot");
  await gw.notifyPartners(title, body, "/admin/geovana/conversas", "whatsapp").catch(() => null);
}

// ---------------------------------------------------------------- envio (com as regras do Instagram)
type SendResult = { ok: true; id: string | null } | { ok: false; reason: string };

async function igSend(acc: IgAccount, chat: IgChat, text: string, kind: "reply" | "staff"): Promise<SendResult> {
  const logCh = igLogChannel(scopeOfAcc(acc));
  const contact = igContact(chat.igsid);
  const no = async (reason: string): Promise<SendResult> => {
    await logEvent({ channel: logCh, tenantId: acc.tenantId, type: "blocked", kind, contact, reason });
    return { ok: false, reason };
  };
  const glob = await getState("*");
  if (glob.emergency) return no("emergência: Geovana parada");
  if (acc.status !== "active") return no(acc.lastError ?? "conta do Instagram pausada");
  // só responde: até 24 h depois da última mensagem do cliente (sem mensagens iniciadas pela empresa, sem janela humana de 7 dias)
  if (!igWindowOpen(chat.lastInboundAt, Date.now())) return no("fora da janela de 24 h do Instagram");
  if (acc.tenantId) {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, acc.tenantId), columns: { tier: true, demo: true, country: true } });
    if (!t || !instagramAllowed({ tier: t.tier, demo: t.demo, country: t.country }).ok) return no("plano sem GoInteligence");
  }
  try {
    const id = await igSendText(openSecret(acc.tokenSealed), chat.igsid, text);
    await logEvent({ channel: logCh, tenantId: acc.tenantId, type: "out", kind, contact });
    return { ok: true, id };
  } catch (e) {
    const err = e as IgError;
    const reason = `${err.code ? `#${err.code} ` : ""}${(err.message ?? "erro").slice(0, 200)}`;
    await logEvent({ channel: logCh, tenantId: acc.tenantId, type: "fail", kind, contact, reason });
    // token inválido/sem permissão → para a conta até reconectar
    if (err.status === 401 || err.code === 190 || err.code === 10 || err.code === 200) {
      await db.update(schema.igAccounts).set({ status: "error", lastError: `Instagram recusou o acesso: ${reason}. Reconecte.`, updatedAt: new Date() }).where(eq(schema.igAccounts.id, acc.id));
    }
    return { ok: false, reason };
  }
}

async function sendAndStore(acc: IgAccount, chat: IgChat, text: string) {
  const r = await igSend(acc, chat, text, "reply");
  if (r.ok) await store(chat.id, "ai", text, r.id);
  else await store(chat.id, "system", `Não enviado: ${r.reason}`, null);
  return r;
}

// ---------------------------------------------------------------- caixa de entrada
export async function igChatsFor(scope: IgScope, limit = 40) {
  const acc = await accountFor(scope);
  if (!acc) return [];
  const chats = await db.query.igChats.findMany({ where: eq(schema.igChats.accountId, acc.id), orderBy: desc(schema.igChats.lastAt), limit });
  const last = await Promise.all(chats.map((c) => db.query.igMessages.findMany({ where: eq(schema.igMessages.chatId, c.id), orderBy: desc(schema.igMessages.createdAt), limit: 8 })));
  return chats.map((c, i) => ({ ...c, label: who(c), windowOpen: igWindowOpen(c.lastInboundAt, Date.now()), messages: last[i].reverse() }));
}

/** Resposta da equipe pela caixa de entrada (mesmas regras: 24 h e plano). Pausa a IA nessa conversa. */
export async function igStaffReply(scope: IgScope, chatId: string, text: string, by: string) {
  const tenant = scope === "goweb" ? null : await db.query.tenants.findFirst({ where: eq(schema.tenants.id, scope.tenantId) });
  const T = tr(tenant && getRegion(tenant.country).locale === "es" ? "es" : "pt");
  const acc = await accountFor(scope);
  if (!acc) throw new InstagramError(T("Instagram no conectado.", "Instagram não conectado."));
  const chat = await db.query.igChats.findFirst({ where: and(eq(schema.igChats.id, chatId), eq(schema.igChats.accountId, acc.id)) });
  if (!chat) throw new InstagramError(T("Conversación no encontrada.", "Conversa não encontrada."));
  const msg = text.trim().slice(0, 1000);
  if (!msg) throw new InstagramError(T("Escribí el mensaje.", "Escreva a mensagem."));
  const r = await igSend(acc, chat, msg, "staff");
  if (!r.ok)
    throw new InstagramError(
      r.reason === "fora da janela de 24 h do Instagram"
        ? T("Pasaron 24 h del último mensaje del cliente: Instagram solo deja responder cuando vuelva a escribir.", "Passaram 24 h da última mensagem do cliente: o Instagram só deixa responder quando ele escrever de novo.")
        : `${T("No enviado", "Não enviado")}: ${r.reason}`,
    );
  await store(chat.id, "staff", msg, r.id);
  const pause = tenant ? geovanaOf(tenant).pauseMinutes : 60;
  await db.update(schema.igChats).set({ pausedUntil: new Date(Date.now() + pause * 60_000), needsHuman: false, lastAt: new Date() }).where(eq(schema.igChats.id, chat.id));
  await audit(scope === "goweb" ? null : scope.tenantId, by, "instagram.responder", who(chat));
}

export async function igResumeChat(scope: IgScope, chatId: string) {
  const acc = await accountFor(scope);
  if (!acc) return;
  await db.update(schema.igChats).set({ pausedUntil: null, needsHuman: false }).where(and(eq(schema.igChats.id, chatId), eq(schema.igChats.accountId, acc.id)));
}

/** Para a tela: conta, situação e endereços para cadastrar no app da Meta. */
export async function igOverview(scope: IgScope) {
  const [p, acc] = await Promise.all([igPlatform(), accountFor(scope)]);
  return {
    configured: igConfigured(p),
    account: acc ? { username: acc.username, status: acc.status, aiEnabled: acc.aiEnabled, lastError: acc.lastError, expiresAt: acc.tokenExpiresAt } : null,
    redirectUri: igRedirectUri(),
    webhookUrl: igWebhookUrl(),
    verifyToken: p.verifyToken,
    appId: p.appId,
  };
}

/** Texto curto do erro, no idioma da loja (para as telas). */
export const igErrorText = (e: unknown, pt = true) => (e instanceof InstagramError || e instanceof IgError ? e.message : tr(pt ? "pt" : "es")("No se pudo completar.", "Não foi possível concluir."));

// ---------------------------------------------------------------- consumo de IA por canal (franquia e painel da GoWeb)
/** Respostas de IA da loja no mês, por canal (o contato do Instagram é "ig:<id>"). Franquia = WhatsApp + Instagram. */
export async function storeAiUsage(tenantId: string) {
  const L = schema.geovanaLog;
  const [r] = await db
    .select({
      instagram: sql<number>`count(*) filter (where ${L.contact} like 'ig:%')::int`,
      whatsapp: sql<number>`count(*) filter (where ${L.contact} is null or ${L.contact} not like 'ig:%')::int`,
    })
    .from(L)
    .where(and(eq(L.channel, storeChannel(tenantId)), eq(L.type, "ai"), gte(L.createdAt, brMonthStart())));
  const cfg = await guardConfig();
  const whatsapp = Number(r?.whatsapp ?? 0);
  const instagram = Number(r?.instagram ?? 0);
  return { whatsapp, instagram, total: whatsapp + instagram, franchise: cfg.ai.storeMonthlyReplies };
}

/** Mês corrente: chamadas, tokens e custo estimado da IA por canal (GoWeb/lojas × WhatsApp/Instagram). */
export async function aiUsageByChannel() {
  const L = schema.geovanaLog;
  const kind = sql<string>`case when ${L.channel} = 'goweb' then 'goweb' else 'store' end`;
  const net = sql<string>`case when ${L.contact} like 'ig:%' then 'instagram' else 'whatsapp' end`;
  const rows = await db
    .select({ kind, net, calls: sql<number>`count(*)::int`, tin: sql<number>`coalesce(sum(${L.tokensIn}),0)::bigint`, tout: sql<number>`coalesce(sum(${L.tokensOut}),0)::bigint`, stores: sql<number>`count(distinct ${L.channel})::int` })
    .from(L)
    .where(and(eq(L.type, "ai"), gte(L.createdAt, brMonthStart())))
    .groupBy(kind, net);
  const cfg = await guardConfig();
  return rows.map((r) => ({ kind: r.kind as "goweb" | "store", net: r.net as "whatsapp" | "instagram", calls: Number(r.calls), tokensIn: Number(r.tin), tokensOut: Number(r.tout), stores: Number(r.stores), costUsd: costUsd(Number(r.tin), Number(r.tout), cfg.ai) }));
}
