import "server-only";
// =============================================================================
// Proteção da Geovana — aplica as regras de core/wa-guard.ts em TODO envio de WhatsApp da Geovana
// (número da GoWeb: leads, lojistas, afiliados, suporte, cobrança, lembretes; e o número de cada loja)
// e em toda chamada à IA dessas conversas.
//
// Fluxo de um envio (guardedSend):
//   emergência/pausa/circuit breaker → duplicada → janela de 24 h (API oficial) → horário comercial (iniciadas
//   pela empresa) → contato sem resposta → limites (com trava no banco para não estourar em paralelo)
//   → envia → sucesso fecha o circuito | falha classifica, reenvia com espera progressiva ou para o número.
// O que não pode sair agora vai para a fila (wa_outbox), drenada pelos webhooks, pelo cron do CRM,
// por /api/cron/wa-queue (pinger externo) e ao abrir Admin → Geovana → Proteção.
// =============================================================================
import { and, asc, desc, eq, gte, inArray, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  CLOSED,
  PRIORITY,
  afterFailure,
  afterSuccess,
  aiMode,
  aiParams,
  backoffMs,
  classifyError,
  costUsd,
  isOpen,
  limitUsage,
  localTime,
  minutesUntilWindow,
  openMinutes,
  parseWaGuard,
  rateDecision,
  textHash,
  type AiMode,
  type BreakerState,
  type ChannelKind,
  type Counts,
  type SendKind,
  type WaGuardConfig,
} from "@/core/wa-guard";
import { brDayStart, brMonthStart } from "@/core/crm";
import { getRegion } from "@/core/region";
import type { AiUsage, OnUsage } from "@/adapters/ai/gemini";
import { sendPush } from "@/services/push";

export const GOWEB = "goweb";
const GLOBAL = "*";
export const storeChannel = (tenantId: string) => `store:${tenantId}`;
export const scopeOf = (channel: string): ChannelKind => (channel === GOWEB ? "goweb" : "store");
const tenantOf = (channel: string) => (channel.startsWith("store:") ? channel.slice(6) : null);

const MIN = 60_000;
const HOUR = 3_600_000;
const L = schema.geovanaLog;

// ---------------------------------------------------------------- configuração
let cache: { cfg: WaGuardConfig; at: number } | null = null;

export async function guardConfig(fresh = false): Promise<WaGuardConfig> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.cfg;
  const s = await db.query.platformSettings.findFirst({ columns: { waGuardConfig: true } });
  const cfg = parseWaGuard(s?.waGuardConfig);
  cache = { cfg, at: Date.now() };
  return cfg;
}

export async function saveGuardConfig(cfg: WaGuardConfig) {
  const json = JSON.stringify(parseWaGuard(JSON.stringify(cfg)));
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", waGuardConfig: json })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { waGuardConfig: json, updatedAt: new Date() } });
  cache = null;
}

// ---------------------------------------------------------------- estado (pausa, emergência, circuit breaker)
export type GuardState = BreakerState & { emergency?: boolean; by?: string | null; at?: number };

export async function getState(channel: string): Promise<GuardState> {
  const r = await db.query.waGuardState.findFirst({ where: eq(schema.waGuardState.channel, channel) });
  try {
    return { ...CLOSED, ...(r ? (JSON.parse(r.state) as Partial<GuardState>) : {}) };
  } catch {
    return { ...CLOSED };
  }
}

async function putState(channel: string, s: GuardState) {
  const state = JSON.stringify({ ...s, at: Date.now() });
  await db
    .insert(schema.waGuardState)
    .values({ channel, state })
    .onConflictDoUpdate({ target: schema.waGuardState.channel, set: { state, updatedAt: new Date() } });
}

/** Pausar/retomar envios de um número ("goweb", "store:<id>") ou de todos ("*"). Mensagens ficam na fila. */
export async function setPaused(channel: string, paused: boolean, by: string) {
  const s = await getState(channel);
  await putState(channel, { ...s, paused, by });
}

/** Botão de emergência: para TUDO (envios e IA) até alguém desligar. A fila não anda; nada novo entra. */
export async function setEmergency(on: boolean, by: string) {
  const s = await getState(GLOBAL);
  await putState(GLOBAL, { ...s, emergency: on, paused: on ? true : s.paused, by });
  if (on) await alert(GLOBAL, "Emergência: Geovana parada", `${by} acionou o botão de emergência. Nenhuma mensagem nem IA até desligar.`, true);
}

/** Retomar um número que o circuit breaker parou (restrição, credencial, falhas). Use depois de conferir o número. */
export async function resumeChannel(channel: string, by: string) {
  const s = await getState(channel);
  await putState(channel, { ...CLOSED, paused: s.paused, by });
}

// ---------------------------------------------------------------- registro
type LogInput = { channel: string; tenantId?: string | null; type: "in" | "out" | "fail" | "blocked" | "queued" | "ai"; kind?: string | null; contact?: string | null; textHash?: string | null; reason?: string | null; tokensIn?: number; tokensOut?: number };

export async function logEvent(e: LogInput) {
  const [r] = await db
    .insert(L)
    .values({ channel: e.channel, tenantId: e.tenantId ?? tenantOf(e.channel), type: e.type, kind: e.kind ?? null, contact: e.contact ?? null, textHash: e.textHash ?? null, reason: e.reason?.slice(0, 200) ?? null, tokensIn: e.tokensIn ?? 0, tokensOut: e.tokensOut ?? 0 })
    .returning({ id: L.id });
  return r.id;
}

// ---------------------------------------------------------------- avisos aos sócios (no máx. 1 por motivo a cada 30 min)
async function alert(channel: string, title: string, body: string, urgent = false) {
  const key = `waguard:${channel}:${textHash(title)}:${Math.floor(Date.now() / (30 * MIN))}`;
  const claimed = await db.insert(schema.nudgeLog).values({ key }).onConflictDoNothing().returning({ key: schema.nudgeLog.key });
  if (!claimed.length) return;
  let where = channel === GOWEB ? "WhatsApp da GoWeb" : channel === GLOBAL ? "Geovana" : "loja";
  const tid = tenantOf(channel);
  if (tid) {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tid), columns: { name: true } });
    where = t?.name ?? where;
  }
  await sendPush("all", { title: `${title} · ${where}`, body, url: "/admin/geovana/protecao", tag: `waguard-${channel}`, category: urgent ? "suporte" : "whatsapp" }).catch(() => 0);
}

// ---------------------------------------------------------------- fuso do número
function tzOffsetMin(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.round((Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - at.getTime()) / MIN);
}

async function offsetOf(channel: string) {
  const tid = tenantOf(channel);
  if (!tid) return -180; // GoWeb: Brasília
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tid), columns: { country: true } });
  return tzOffsetMin(getRegion(t?.country ?? "BR").timeZone);
}

// ---------------------------------------------------------------- contagens
async function sendCounts(q: typeof db, channel: string, contact: string, now: number): Promise<Counts> {
  const ago = (ms: number) => new Date(now - ms);
  const isOut = sql`${L.type} = 'out'`;
  const ch = sql`${L.channel} = ${channel}`;
  const ct = sql`${L.contact} = ${contact}`;
  const biz = sql`${L.kind} in ('proactive', 'notice')`;
  const [r] = await q
    .select({
      minute: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${L.createdAt} > ${ago(MIN)})::int`,
      hour: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${L.createdAt} > ${ago(HOUR)})::int`,
      day: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${L.createdAt} > ${ago(24 * HOUR)})::int`,
      lastAt: sql<string | null>`max(${L.createdAt}) filter (where ${isOut} and ${ch})`,
      contactMinute: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${ct} and ${L.createdAt} > ${ago(MIN)})::int`,
      contactHour: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${ct} and ${L.createdAt} > ${ago(HOUR)})::int`,
      contactDay: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${ct} and ${L.createdAt} > ${ago(24 * HOUR)})::int`,
      proactiveContactDay: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${ct} and ${L.kind} = 'proactive' and ${L.createdAt} > ${ago(24 * HOUR)})::int`,
      proactiveContactWeek: sql<number>`count(*) filter (where ${isOut} and ${ch} and ${ct} and ${L.kind} = 'proactive')::int`,
      newContactsToday: sql<number>`count(distinct ${L.contact}) filter (where ${isOut} and ${ch} and ${biz} and ${L.createdAt} > ${ago(24 * HOUR)})::int`,
      contactAlreadyToday: sql<boolean>`coalesce(bool_or(${ct}) filter (where ${isOut} and ${ch} and ${biz} and ${L.createdAt} > ${ago(24 * HOUR)}), false)`,
      globalMinute: sql<number>`count(*) filter (where ${isOut} and ${L.createdAt} > ${ago(MIN)})::int`,
      globalHour: sql<number>`count(*) filter (where ${isOut} and ${L.createdAt} > ${ago(HOUR)})::int`,
      globalDay: sql<number>`count(*) filter (where ${isOut} and ${L.createdAt} > ${ago(24 * HOUR)})::int`,
    })
    .from(L)
    .where(and(eq(L.type, "out"), gte(L.createdAt, ago(7 * 24 * HOUR))));
  return { ...r, lastAt: r.lastAt ? new Date(r.lastAt).getTime() : null, contactAlreadyToday: !!r.contactAlreadyToday };
}

/** Mesma mensagem para o mesmo contato nos últimos 10 min? */
async function recentDuplicate(channel: string, contact: string, hash: string, now: number) {
  const r = await db.query.geovanaLog.findFirst({ where: and(eq(L.channel, channel), eq(L.contact, contact), eq(L.textHash, hash), inArray(L.type, ["out"]), gte(L.createdAt, new Date(now - 10 * MIN))), columns: { id: true } });
  return !!r;
}

export async function lastInboundAt(channel: string, contact: string) {
  const r = await db.query.geovanaLog.findFirst({ where: and(eq(L.channel, channel), eq(L.contact, contact), eq(L.type, "in")), orderBy: desc(L.createdAt), columns: { createdAt: true } });
  return r?.createdAt ?? null;
}

/** Mensagens enviadas ao contato desde a última que ele mandou (para não insistir com quem não responde). */
async function outsSinceLastInbound(channel: string, contact: string) {
  const last = await lastInboundAt(channel, contact);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(L)
    .where(and(eq(L.channel, channel), eq(L.contact, contact), eq(L.type, "out"), eq(L.kind, "proactive"), last ? gte(L.createdAt, last) : undefined));
  return r?.n ?? 0;
}

// ---------------------------------------------------------------- envio protegido
export type Transport = () => Promise<string | null>;
export type SendInput = {
  channel: string;
  tenantId?: string | null;
  to: string;
  text: string;
  kind: SendKind;
  dedupeKey?: string | null;
  /** API oficial da Meta: fora de 24 h da última mensagem do cliente só sai modelo aprovado */
  officialApi?: boolean;
};
export type Outcome = { status: "sent"; id: string | null } | { status: "queued"; at: Date; reason: string } | { status: "blocked"; reason: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enqueue(input: SendInput, at: Date, reason: string, opts: { outboxId?: string; attempts?: number }): Promise<Outcome> {
  if (opts.outboxId) {
    await db.update(schema.waOutbox).set({ status: "pending", nextAt: at, attempts: opts.attempts ?? 0, lastError: reason }).where(eq(schema.waOutbox.id, opts.outboxId));
  } else {
    const bucket = Math.floor(Date.now() / (10 * MIN));
    const dedupeKey = input.dedupeKey ?? `${input.channel}|${input.to}|${textHash(input.text)}|${bucket}`;
    const r = await db
      .insert(schema.waOutbox)
      .values({ channel: input.channel, tenantId: input.tenantId ?? tenantOf(input.channel), to: input.to, text: input.text.slice(0, 4000), kind: input.kind, priority: PRIORITY[input.kind], dedupeKey, nextAt: at, attempts: opts.attempts ?? 0, lastError: reason })
      .onConflictDoNothing()
      .returning({ id: schema.waOutbox.id });
    if (!r.length) return { status: "blocked", reason: "mensagem duplicada (já está na fila)" };
  }
  await logEvent({ channel: input.channel, tenantId: input.tenantId, type: "queued", kind: input.kind, contact: input.to, textHash: textHash(input.text), reason });
  return { status: "queued", at, reason };
}

async function block(input: SendInput, reason: string, outboxId?: string): Promise<Outcome> {
  await logEvent({ channel: input.channel, tenantId: input.tenantId, type: "blocked", kind: input.kind, contact: input.to, textHash: textHash(input.text), reason });
  if (outboxId) await db.update(schema.waOutbox).set({ status: "cancelled", lastError: reason }).where(eq(schema.waOutbox.id, outboxId));
  return { status: "blocked", reason };
}

/** Volume anormal: muitas mensagens barradas POR LIMITE em 10 min = algo tentando disparar demais → para o número.
 *  (não conta o que só esperou o horário comercial, pausa ou intervalo mínimo — isso é normal) */
async function checkAnomaly(channel: string, cfg: WaGuardConfig, now: number) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(L)
    .where(and(eq(L.channel, channel), inArray(L.type, ["blocked", "queued"]), or(like(L.reason, "limite%"), like(L.reason, "muitas mensagens%")), gte(L.createdAt, new Date(now - 10 * MIN))));
  if ((r?.n ?? 0) < cfg.breaker.blockedBurst10m) return;
  const s = await getState(channel);
  if (isOpen(s, now)) return;
  const mins = openMinutes(s.trips, cfg.breaker);
  await putState(channel, { ...s, openUntil: now + mins * MIN, reason: "volume anormal de mensagens", trips: s.trips + 1 });
  await alert(channel, "Volume anormal na Geovana", `${r.n} mensagens seguradas em 10 min. Envios pausados por ${mins} min para proteger o número.`);
}

/**
 * Envia respeitando todas as proteções. `transport` faz o envio de verdade (Evolution / API oficial) e devolve o id.
 * `waitMs`: quanto pode esperar aqui mesmo (ex.: intervalo mínimo) antes de mandar para a fila.
 */
export async function guardedSend(input: SendInput, transport: Transport, opts: { waitMs?: number; outboxId?: string; attempts?: number } = {}): Promise<Outcome> {
  const cfg = await guardConfig();
  const lim = scopeOf(input.channel) === "goweb" ? cfg.goweb : cfg.store;
  const hash = textHash(input.text);
  let now = Date.now();

  // 1. emergência, pausa e circuit breaker
  const [glob, st] = await Promise.all([getState(GLOBAL), getState(input.channel)]);
  if (glob.emergency) return block(input, "emergência: Geovana parada", opts.outboxId);
  if (st.manual) return block(input, `número parado: ${st.reason ?? "conferir"}`, opts.outboxId);
  if (glob.paused || st.paused) return enqueue(input, new Date(now + 10 * MIN), "envios pausados", opts);
  if (st.openUntil && st.openUntil > now) return enqueue(input, new Date(st.openUntil), st.reason ?? "proteção ativa", opts);

  // 2. duplicada
  if (input.kind !== "staff" && (await recentDuplicate(input.channel, input.to, hash, now))) return block(input, "mensagem duplicada", opts.outboxId);

  // 3. API oficial: fora da janela de 24 h não dá para mandar texto livre (evita erro 131047 e queda de qualidade)
  if (input.officialApi && input.kind !== "reply" && input.kind !== "staff") {
    const last = await lastInboundAt(input.channel, input.to);
    if (!last || now - last.getTime() > 24 * HOUR) return block(input, "fora da janela de 24 h da API oficial (exige modelo aprovado)", opts.outboxId);
  }

  // 4. iniciada pela empresa: só no horário comercial e sem insistir com quem não responde
  if (input.kind === "proactive") {
    const wait = minutesUntilWindow(localTime(now, await offsetOf(input.channel)), cfg.window);
    if (wait > 0) return enqueue(input, new Date(now + wait * MIN), "fora do horário comercial", opts);
    if ((await outsSinceLastInbound(input.channel, input.to)) >= cfg.loop.botStreakMax) return block(input, "contato não respondeu às últimas mensagens", opts.outboxId);
  }

  // 5. limites (trava por número no banco: dois envios ao mesmo tempo não estouram o limite)
  let logId: string | null = null;
  for (let attempt = 0; attempt < 2 && !logId; attempt++) {
    now = Date.now();
    const res = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.channel}))`);
      const d = rateDecision(await sendCounts(tx as unknown as typeof db, input.channel, input.to, now), lim, cfg.global, input.kind, now);
      if (!d.ok) return { d, id: null as string | null };
      const [r] = await tx
        .insert(L)
        .values({ channel: input.channel, tenantId: input.tenantId ?? tenantOf(input.channel), type: "out", kind: input.kind, contact: input.to, textHash: hash })
        .returning({ id: L.id });
      return { d, id: r.id };
    });
    if (res.id) {
      logId = res.id;
      break;
    }
    const d = res.d as Extract<typeof res.d, { ok: false }>;
    const wait = d.retryAt - now;
    if (!d.hard && attempt === 0 && wait <= (opts.waitMs ?? 0)) {
      await sleep(Math.max(0, wait) + 50);
      continue;
    }
    await checkAnomaly(input.channel, cfg, now);
    if (d.hard && (input.kind === "proactive" || input.kind === "notice")) return block(input, d.reason, opts.outboxId);
    return enqueue(input, new Date(d.retryAt), d.reason, opts);
  }

  // 6. envia
  try {
    const id = await transport();
    const fresh = await getState(input.channel);
    if (fresh.failStreak || fresh.openUntil) await putState(input.channel, afterSuccess(fresh, Date.now()));
    if (opts.outboxId) await db.update(schema.waOutbox).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(schema.waOutbox.id, opts.outboxId));
    return { status: "sent", id };
  } catch (e) {
    const err = e as { status?: number; message?: string; code?: number | null };
    const cls = classifyError({ status: err.status, message: err.message, code: err.code ?? null });
    const reason = `${cls}: ${(err.message ?? "erro").slice(0, 160)}`;
    await db.update(L).set({ type: "fail", reason }).where(eq(L.id, logId!));
    const { state, alert: msg } = afterFailure(await getState(input.channel), cls, cfg.breaker, Date.now());
    await putState(input.channel, state);
    if (msg) await alert(input.channel, cls === "restricted" ? "WhatsApp com sinal de restrição" : cls === "auth" ? "WhatsApp sem credencial válida" : "Falhas de envio na Geovana", msg, cls === "restricted" || cls === "auth");
    const attempts = (opts.attempts ?? 0) + 1;
    if ((cls === "temporary" || cls === "disconnected" || cls === "pair") && attempts < cfg.retry.maxAttempts) {
      const wait = cls === "pair" ? Math.max(60_000, backoffMs(attempts, cfg.retry)) : backoffMs(attempts, cfg.retry);
      return enqueue(input, new Date(Date.now() + wait), reason, { ...opts, attempts });
    }
    if (opts.outboxId) await db.update(schema.waOutbox).set({ status: "failed", attempts, lastError: reason }).where(eq(schema.waOutbox.id, opts.outboxId));
    return { status: "blocked", reason };
  }
}

// ---------------------------------------------------------------- fila
async function transportFor(row: typeof schema.waOutbox.$inferSelect): Promise<{ transport: Transport; officialApi: boolean } | null> {
  if (row.channel === GOWEB) {
    const gw = await import("@/services/goweb-bot");
    return { transport: () => gw.gwRawSend(row.to, row.text), officialApi: false };
  }
  const tid = tenantOf(row.channel);
  if (!tid) return null;
  const g = await import("@/services/geovana");
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tid) });
  if (!t || t.demo) return null;
  const cfg = g.geovanaOf(t);
  if (cfg.channel === "none") return null;
  return { transport: () => g.storeRawSend(t, cfg, row.to, row.text), officialApi: cfg.channel === "cloud" };
}

/** Envia o que está na fila e já pode sair (prioridade: respostas, avisos, depois mensagens da empresa). */
export async function drainOutbox(max = 20, budgetMs = 20_000) {
  const started = Date.now();
  const now = new Date();
  const out = { sent: 0, queued: 0, blocked: 0, expired: 0 };
  // emergência ou tudo pausado: a fila fica parada (nada é descartado)
  const glob = await getState(GLOBAL);
  if (glob.emergency || glob.paused) return out;
  // "sending" travado há mais de 10 min (função caiu no meio) volta para a fila
  await db.update(schema.waOutbox).set({ status: "pending" }).where(and(eq(schema.waOutbox.status, "sending"), lt(schema.waOutbox.nextAt, new Date(Date.now() - 10 * MIN))));
  const due = await db.query.waOutbox.findMany({ where: and(eq(schema.waOutbox.status, "pending"), lte(schema.waOutbox.nextAt, now)), orderBy: [asc(schema.waOutbox.priority), asc(schema.waOutbox.nextAt)], limit: max });
  for (const row of due) {
    if (Date.now() - started > budgetMs) break;
    const [claimed] = await db.update(schema.waOutbox).set({ status: "sending", nextAt: new Date() }).where(and(eq(schema.waOutbox.id, row.id), eq(schema.waOutbox.status, "pending"))).returning({ id: schema.waOutbox.id });
    if (!claimed) continue;
    // resposta que ficou presa mais de 3 h não faz mais sentido na conversa
    if ((row.kind === "reply" || row.kind === "staff") && Date.now() - row.createdAt.getTime() > 3 * HOUR) {
      await db.update(schema.waOutbox).set({ status: "cancelled", lastError: "expirou (resposta atrasada demais)" }).where(eq(schema.waOutbox.id, row.id));
      out.expired++;
      continue;
    }
    const tr = await transportFor(row).catch(() => null);
    if (!tr) {
      await db.update(schema.waOutbox).set({ status: "failed", lastError: "canal não configurado" }).where(eq(schema.waOutbox.id, row.id));
      out.blocked++;
      continue;
    }
    const r = await guardedSend({ channel: row.channel, tenantId: row.tenantId, to: row.to, text: row.text, kind: row.kind as SendKind, officialApi: tr.officialApi }, tr.transport, { outboxId: row.id, attempts: row.attempts, waitMs: 4_000 }).catch((e) => {
      console.error("[wa-guard fila]", e);
      return { status: "queued" } as Outcome;
    });
    out[r.status === "sent" ? "sent" : r.status === "queued" ? "queued" : "blocked"]++;
  }
  return out;
}

/** Drena um pouco da fila sem atrapalhar quem chamou (fim de webhook, abertura do painel). */
export async function drainSoon() {
  await drainOutbox(5, 8_000).catch((e) => console.error("[wa-guard fila]", e));
}

// ---------------------------------------------------------------- mensagens recebidas
/** Registra a mensagem recebida. `flood` = o contato mandou demais em 1 min (robô ou loop): não chamar a IA. */
export async function noteInbound(channel: string, contact: string) {
  const cfg = await guardConfig();
  await logEvent({ channel, type: "in", contact });
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(L)
    .where(and(eq(L.channel, channel), eq(L.contact, contact), eq(L.type, "in"), gte(L.createdAt, new Date(Date.now() - MIN))));
  const flood = (r?.n ?? 0) > cfg.loop.inboundPerMinute;
  if (flood) await logEvent({ channel, type: "blocked", kind: "reply", contact, reason: "contato mandando mensagens demais (possível robô/loop)" });
  return { flood, pauseMinutes: cfg.loop.floodPauseMin };
}

/** A mensagem "enviada pelo celular" é, na verdade, eco de algo que a fila mandou? (não pausar a IA por isso) */
export async function isOwnRecentSend(channel: string, contact: string, text: string) {
  const r = await db.query.geovanaLog.findFirst({ where: and(eq(L.channel, channel), eq(L.contact, contact), eq(L.type, "out"), eq(L.textHash, textHash(text)), gte(L.createdAt, new Date(Date.now() - 5 * MIN))), columns: { id: true } });
  return !!r;
}

/** Eventos de conexão da Evolution: fechou = pausa; 401/403 ao fechar = deslogado/banido = para até um sócio conferir. */
export async function onConnection(channel: string, state: string, reason: number | null) {
  const cfg = await guardConfig();
  const s = await getState(channel);
  const now = Date.now();
  if (state === "open") {
    if (!s.manual && s.reason === "número desconectado") await putState(channel, { ...s, openUntil: null, reason: null, failStreak: 0, trips: 0 });
    return;
  }
  if (state !== "close") return;
  if (reason === 401 || reason === 403) {
    await putState(channel, { ...s, manual: true, openUntil: null, reason: `WhatsApp encerrou a sessão (${reason}) — possível restrição` });
    await alert(channel, "WhatsApp encerrou a sessão", `O número foi deslogado (código ${reason}). Pode ser restrição do WhatsApp. Envios parados até um sócio conferir e reconectar.`, true);
    return;
  }
  if (!isOpen(s, now)) {
    await putState(channel, { ...s, openUntil: now + openMinutes(s.trips, cfg.breaker) * MIN, reason: "número desconectado", trips: s.trips + 1 });
    await alert(channel, "WhatsApp desconectado", "A conexão caiu. Mensagens ficam na fila até voltar.");
  }
}

// ---------------------------------------------------------------- IA
export type AiGate = AiMode & { params: ReturnType<typeof aiParams>; turnChars: number; emergency: boolean };

/** Antes de chamar a IA: modo normal, economia ou bloqueado (orçamento, minuto, conversa gulosa, emergência). */
export async function aiGate(channel: string, contact: string | null): Promise<AiGate> {
  const cfg = await guardConfig();
  const scope = scopeOf(channel);
  const glob = await getState(GLOBAL);
  if (glob.emergency) return { mode: "blocked", reason: "emergência: Geovana parada", pct: 0, params: aiParams("normal", cfg.ai, scope), turnChars: cfg.ai.turnChars, emergency: true };
  const day = brDayStart();
  const month = brMonthStart();
  const tok = sql`(${L.tokensIn} + ${L.tokensOut})`;
  const isAi = sql`${L.type} = 'ai'`;
  const [u] = await db
    .select({
      day: sql<number>`coalesce(sum(${tok}) filter (where ${isAi} and ${L.createdAt} >= ${day}), 0)::bigint`,
      month: sql<number>`coalesce(sum(${tok}) filter (where ${isAi}), 0)::bigint`,
      channelDay: sql<number>`coalesce(sum(${tok}) filter (where ${isAi} and ${L.channel} = ${channel} and ${L.createdAt} >= ${day}), 0)::bigint`,
      storeMonth: sql<number>`coalesce(sum(${tok}) filter (where ${isAi} and ${L.channel} = ${channel}), 0)::bigint`,
      chatDay: sql<number>`coalesce(sum(${tok}) filter (where ${isAi} and ${L.channel} = ${channel} and ${L.contact} = ${contact ?? "-"} and ${L.createdAt} >= ${day}), 0)::bigint`,
      lastMinuteCalls: sql<number>`count(*) filter (where ${isAi} and ${L.createdAt} > ${new Date(Date.now() - MIN)})::int`,
    })
    .from(L)
    .where(and(eq(L.type, "ai"), gte(L.createdAt, month)));
  const usage = { day: Number(u.day), month: Number(u.month), channelDay: Number(u.channelDay), storeMonth: Number(u.storeMonth), chatDay: contact ? Number(u.chatDay) : 0, lastMinuteCalls: Number(u.lastMinuteCalls) };
  const m = aiMode(usage, cfg.ai, scope);
  if (m.mode === "blocked" && m.reason?.startsWith("orçamento")) await alert(channel, "IA da Geovana sem orçamento", `Atingiu o ${m.reason}. As conversas vão para a equipe até o orçamento renovar ou ser aumentado.`);
  return { ...m, params: aiParams(m.mode, cfg.ai, scope), turnChars: cfg.ai.turnChars, emergency: false };
}

/** Medidor de tokens: passe `onUsage` para o Gemini e depois chame `save()`. */
export function aiMeter(channel: string, contact: string | null) {
  const got: AiUsage[] = [];
  const onUsage: OnUsage = (u) => got.push(u);
  return {
    onUsage,
    async save() {
      for (const u of got) await logEvent({ channel, type: "ai", contact, tokensIn: u.input, tokensOut: u.output, reason: u.model }).catch(() => null);
    },
  };
}

// ---------------------------------------------------------------- painel
export async function guardOverview() {
  const cfg = await guardConfig(true);
  const now = Date.now();
  const day = brDayStart();
  const month = brMonthStart();
  const tok = sql`(${L.tokensIn} + ${L.tokensOut})`;
  const since24 = new Date(now - 24 * HOUR);
  const [rows, aiMonth, queue, states, reasons, recentFails] = await Promise.all([
    db
      .select({
        channel: L.channel,
        tenantId: L.tenantId,
        sent: sql<number>`count(*) filter (where ${L.type} = 'out')::int`,
        received: sql<number>`count(*) filter (where ${L.type} = 'in')::int`,
        failed: sql<number>`count(*) filter (where ${L.type} = 'fail')::int`,
        blocked: sql<number>`count(*) filter (where ${L.type} = 'blocked')::int`,
        queued: sql<number>`count(*) filter (where ${L.type} = 'queued')::int`,
        aiCalls: sql<number>`count(*) filter (where ${L.type} = 'ai' and ${L.createdAt} >= ${day})::int`,
        tokensIn: sql<number>`coalesce(sum(${L.tokensIn}) filter (where ${L.type} = 'ai' and ${L.createdAt} >= ${day}), 0)::bigint`,
        tokensOut: sql<number>`coalesce(sum(${L.tokensOut}) filter (where ${L.type} = 'ai' and ${L.createdAt} >= ${day}), 0)::bigint`,
        minute: sql<number>`count(*) filter (where ${L.type} = 'out' and ${L.createdAt} > ${new Date(now - MIN)})::int`,
        hour: sql<number>`count(*) filter (where ${L.type} = 'out' and ${L.createdAt} > ${new Date(now - HOUR)})::int`,
      })
      .from(L)
      .where(gte(L.createdAt, since24))
      .groupBy(L.channel, L.tenantId),
    db
      .select({ tokensIn: sql<number>`coalesce(sum(${L.tokensIn}), 0)::bigint`, tokensOut: sql<number>`coalesce(sum(${L.tokensOut}), 0)::bigint`, calls: sql<number>`count(*)::int` })
      .from(L)
      .where(and(eq(L.type, "ai"), gte(L.createdAt, month))),
    db
      .select({ channel: schema.waOutbox.channel, status: schema.waOutbox.status, n: sql<number>`count(*)::int` })
      .from(schema.waOutbox)
      .where(inArray(schema.waOutbox.status, ["pending", "sending", "failed"]))
      .groupBy(schema.waOutbox.channel, schema.waOutbox.status),
    db.query.waGuardState.findMany(),
    db
      .select({ reason: L.reason, type: L.type, n: sql<number>`count(*)::int` })
      .from(L)
      .where(and(inArray(L.type, ["blocked", "fail", "queued"]), gte(L.createdAt, since24)))
      .groupBy(L.reason, L.type)
      .orderBy(desc(sql`count(*)`))
      .limit(12),
    db.query.waOutbox.findMany({ where: and(eq(schema.waOutbox.status, "failed"), gte(schema.waOutbox.createdAt, new Date(now - 7 * 24 * HOUR))), orderBy: desc(schema.waOutbox.createdAt), limit: 10 }),
  ]);
  const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter(Boolean) as string[])];
  const names = tenantIds.length ? await db.query.tenants.findMany({ where: inArray(schema.tenants.id, tenantIds), columns: { id: true, name: true, slug: true } }) : [];
  const stateOf = (ch: string): GuardState => {
    const r = states.find((s) => s.channel === ch);
    try {
      return { ...CLOSED, ...(r ? JSON.parse(r.state) : {}) };
    } catch {
      return { ...CLOSED };
    }
  };
  const channels = new Set([GOWEB, ...rows.map((r) => r.channel), ...states.map((s) => s.channel).filter((c) => c !== GLOBAL), ...queue.map((q) => q.channel)]);
  const list = [...channels].map((ch) => {
    const r = rows.find((x) => x.channel === ch);
    const lim = scopeOf(ch) === "goweb" ? cfg.goweb : cfg.store;
    const tIn = Number(r?.tokensIn ?? 0);
    const tOut = Number(r?.tokensOut ?? 0);
    const st = stateOf(ch);
    const tenant = names.find((n) => n.id === tenantOf(ch));
    return {
      channel: ch,
      name: ch === GOWEB ? "WhatsApp da GoWeb (vendas, suporte, cobrança)" : tenant?.name ?? "Loja",
      slug: tenant?.slug ?? null,
      sent: r?.sent ?? 0,
      received: r?.received ?? 0,
      failed: r?.failed ?? 0,
      blocked: r?.blocked ?? 0,
      pending: queue.filter((q) => q.channel === ch && (q.status === "pending" || q.status === "sending")).reduce((a, q) => a + q.n, 0),
      deadQueue: queue.filter((q) => q.channel === ch && q.status === "failed").reduce((a, q) => a + q.n, 0),
      aiCalls: r?.aiCalls ?? 0,
      tokens: tIn + tOut,
      cost: costUsd(tIn, tOut, cfg.ai),
      usage: limitUsage({ minute: r?.minute ?? 0, hour: r?.hour ?? 0, day: r?.sent ?? 0 }, lim),
      tokenUsage: Math.round(((tIn + tOut) / (scopeOf(ch) === "goweb" ? cfg.ai.gowebDailyTokens : cfg.ai.storeDailyTokens)) * 100),
      state: st,
      open: isOpen(st, now),
    };
  });
  list.sort((a, b) => (a.channel === GOWEB ? -1 : b.channel === GOWEB ? 1 : b.sent + b.received - (a.sent + a.received)));
  const dayIn = list.reduce((a, c) => a + c.tokens, 0);
  const monthIn = Number(aiMonth[0]?.tokensIn ?? 0);
  const monthOut = Number(aiMonth[0]?.tokensOut ?? 0);
  return {
    cfg,
    global: stateOf(GLOBAL),
    channels: list,
    totals: {
      sent: list.reduce((a, c) => a + c.sent, 0),
      received: list.reduce((a, c) => a + c.received, 0),
      failed: list.reduce((a, c) => a + c.failed, 0),
      blocked: list.reduce((a, c) => a + c.blocked, 0),
      pending: list.reduce((a, c) => a + c.pending, 0),
      tokensDay: dayIn,
      tokensMonth: monthIn + monthOut,
      aiCallsMonth: aiMonth[0]?.calls ?? 0,
      costDay: list.reduce((a, c) => a + c.cost, 0),
      costMonth: costUsd(monthIn, monthOut, cfg.ai),
      dayPct: Math.round((dayIn / cfg.ai.dailyTokens) * 100),
      monthPct: Math.round(((monthIn + monthOut) / cfg.ai.monthlyTokens) * 100),
    },
    reasons,
    recentFails,
  };
}

/** Resumo para o painel da loja (Geovana): está pausada? quanto usou hoje? */
export async function storeGuardSummary(tenantId: string) {
  const ch = storeChannel(tenantId);
  const cfg = await guardConfig();
  const [st, glob, [r], [q]] = await Promise.all([
    getState(ch),
    getState(GLOBAL),
    db
      .select({
        sent: sql<number>`count(*) filter (where ${L.type} = 'out')::int`,
        blocked: sql<number>`count(*) filter (where ${L.type} in ('blocked', 'fail'))::int`,
        tokens: sql<number>`coalesce(sum(${L.tokensIn} + ${L.tokensOut}) filter (where ${L.type} = 'ai'), 0)::bigint`,
      })
      .from(L)
      .where(and(eq(L.channel, ch), gte(L.createdAt, brDayStart()))),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.waOutbox).where(and(eq(schema.waOutbox.channel, ch), ne(schema.waOutbox.status, "sent"), inArray(schema.waOutbox.status, ["pending", "sending"]))),
  ]);
  return {
    stopped: glob.emergency || st.manual || glob.paused || st.paused || (st.openUntil !== null && st.openUntil > Date.now()),
    reason: glob.emergency ? "emergência" : st.manual ? st.reason : glob.paused || st.paused ? "envios pausados pela GoWeb" : st.openUntil && st.openUntil > Date.now() ? st.reason : null,
    sent: r?.sent ?? 0,
    blocked: r?.blocked ?? 0,
    pending: q?.n ?? 0,
    tokenPct: Math.round((Number(r?.tokens ?? 0) / cfg.ai.storeDailyTokens) * 100),
    perDay: cfg.store.perDay,
  };
}

/** Limpeza (cron): registros com mais de 40 dias e fila resolvida com mais de 14 dias. */
export async function pruneGuard() {
  await db.delete(L).where(lt(L.createdAt, new Date(Date.now() - 40 * 24 * HOUR)));
  await db.delete(schema.waOutbox).where(and(inArray(schema.waOutbox.status, ["sent", "failed", "cancelled"]), lt(schema.waOutbox.createdAt, new Date(Date.now() - 14 * 24 * HOUR))));
}
