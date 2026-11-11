// =============================================================================
// Proteção da Geovana (WhatsApp + IA) — regras PURAS, sem I/O.
// Vale para os 3 usos da Geovana: o número da GoWeb (leads, lojistas, afiliados), o suporte/cobrança da
// plataforma (que sai pelo mesmo número) e o número de cada loja cliente (Evolution por QR ou API oficial).
//
// Princípios (operação legítima, sem burlar a Meta):
// - nada de trocar de número, "aquecer" chip ou disfarçar automação; limites para BAIXO do que a Meta permite;
// - respostas a quem escreveu têm prioridade; mensagens iniciadas pela empresa só em horário comercial,
//   com teto por contato e por dia, nunca para quem pediu para parar;
// - sinais de restrição (erros da Meta, número desconectado, falhas seguidas) PARAM o envio (circuit breaker);
// - IA com orçamento de tokens por dia/mês, modo economia perto do limite e trava contra loop.
// Serviço que aplica estas regras: services/wa-guard.ts. Configuração editável em Admin → Geovana → Proteção.
// =============================================================================

export type ChannelKind = "goweb" | "store";
/** reply = resposta a quem escreveu; staff = sócio/lojista digitou no painel; support = resposta de chamado;
 *  notice = aviso de pedido; internal = alerta para os sócios; proactive = iniciada pela empresa (lembrete, cobrança, retorno). */
export type SendKind = "reply" | "staff" | "support" | "notice" | "internal" | "proactive";

export const PRIORITY: Record<SendKind, number> = { reply: 0, staff: 0, support: 1, notice: 1, internal: 1, proactive: 2 };

export type Limits = {
  perMinute: number;
  perHour: number;
  perDay: number;
  /** intervalo mínimo entre duas mensagens do MESMO número (segundos) */
  minGapSec: number;
  /** mensagens para o mesmo contato */
  perContactMinute: number;
  perContactHour: number;
  perContactDay: number;
  /** iniciadas pela empresa (proactive) */
  proactivePerContactDay: number;
  proactivePerContactWeek: number;
  /** contatos diferentes que recebem mensagem iniciada pela empresa por dia (o que a Meta mede para limitar) */
  newContactsPerDay: number;
};

export type WaGuardConfig = {
  goweb: Limits;
  /** vale para CADA loja (cada número) */
  store: Limits;
  /** soma de todos os números */
  global: { perMinute: number; perHour: number; perDay: number };
  /** quando mensagens iniciadas pela empresa podem sair (horário local do número) */
  window: { from: string; to: string; days: number[] };
  retry: { maxAttempts: number; baseSec: number; maxSec: number };
  breaker: { failStreak: number; openMin: number; maxOpenMin: number; blockedBurst10m: number };
  ai: {
    perMinute: number;
    maxOutputTokens: { goweb: number; store: number };
    historyTurns: { goweb: number; store: number };
    turnChars: number;
    /** % do orçamento a partir do qual entra o modo economia */
    economyAt: number;
    dailyTokens: number;
    monthlyTokens: number;
    gowebDailyTokens: number;
    storeDailyTokens: number;
    storeMonthlyTokens: number;
    /** uma conversa sozinha não passa disto por dia */
    chatDailyTokens: number;
    /** US$ por 1 milhão de tokens (para a estimativa de custo) */
    priceInPerM: number;
    priceOutPerM: number;
  };
  loop: {
    /** mensagens recebidas do mesmo contato por minuto acima disso = possível robô/loop */
    inboundPerMinute: number;
    floodPauseMin: number;
    /** respostas seguidas da IA sem o contato falar nada */
    botStreakMax: number;
  };
};

// -----------------------------------------------------------------------------
// LIMITES INICIAIS (conservadores) — justificativa de cada número
// -----------------------------------------------------------------------------
// Meta (API oficial): mensagens iniciadas pela empresa contam por contato único em 24 h, começando em 250/dia
// por portfólio; vazão técnica ~80 msg/s; erro 131056 quando há mensagens demais para o mesmo contato em pouco tempo;
// 131048/368 quando bloqueios/denúncias sobem. A Evolution (QR, WhatsApp Web) NÃO tem limite publicado: o WhatsApp
// decide por comportamento — volume em rajada, muitos contatos novos e denúncias. Por isso os números abaixo ficam
// muito abaixo do teto oficial e parecem com o ritmo de uma pessoa atendendo.
export const DEFAULT_WA_GUARD: WaGuardConfig = {
  goweb: {
    perMinute: 10, // ~1 a cada 6 s em média: ritmo humano de atendimento; rajadas maiores são o principal gatilho de bloqueio no QR
    perHour: 150, // pico de ~2,5/min sustentado por 1 h — cobre um dia de lançamento com folga
    perDay: 600, // bem abaixo do que um número pessoal ativo manda; acima disso o padrão vira "disparo"
    minGapSec: 3, // a Evolution já simula 1,2 s "digitando"; 3 s evita duas mensagens coladas
    perContactMinute: 4, // resposta longa pode virar 2–3 balões; 4 cobre isso e corta loop (Meta: 131056)
    perContactHour: 30,
    perContactDay: 80,
    proactivePerContactDay: 1, // no máximo 1 lembrete/cobrança/retorno por dia para a mesma pessoa
    proactivePerContactWeek: 3,
    newContactsPerDay: 40, // 16% do 1º nível da Meta (250) — margem enorme; QR não tem limite oficial, então fica baixo
  },
  store: {
    perMinute: 12, // loja em horário de pico atende vários clientes; ainda abaixo de 1 a cada 5 s
    perHour: 200,
    perDay: 800,
    minGapSec: 2,
    perContactMinute: 4,
    perContactHour: 30,
    perContactDay: 80,
    proactivePerContactDay: 6, // avisos de pedido: recebido → preparo → pronto → a caminho → entregue
    proactivePerContactWeek: 25,
    newContactsPerDay: 150, // clientes que pediram pelo site e recebem aviso; abaixo dos 250 da Meta
  },
  global: { perMinute: 120, perHour: 3000, perDay: 20000 }, // teto de segurança da infraestrutura (Evolution + Vercel), não da Meta
  window: { from: "09:00", to: "20:00", days: [1, 2, 3, 4, 5, 6] }, // seg–sáb, horário comercial; domingo nada iniciado pela empresa
  retry: { maxAttempts: 5, baseSec: 30, maxSec: 3600 }, // 30 s, 1 min, 2 min, 4 min, 8 min (+ variação) e desiste
  breaker: { failStreak: 5, openMin: 15, maxOpenMin: 240, blockedBurst10m: 40 },
  ai: {
    perMinute: 15, // RPM do nível gratuito histórico do Flash-Lite; com chave paga pode subir
    maxOutputTokens: { goweb: 700, store: 600 }, // já era o que o código usava; WhatsApp pede resposta curta
    historyTurns: { goweb: 12, store: 10 }, // antes 20 e 14: as últimas ~5 trocas bastam para o contexto
    turnChars: 700, // corta mensagens longas antigas no histórico (o texto completo fica no banco)
    economyAt: 0.8,
    // ~7 mil tokens por resposta (prompt com catálogo + histórico + resposta). 3 M/dia ≈ 430 respostas/dia ≈ US$ 1,5/dia.
    dailyTokens: 3_000_000,
    monthlyTokens: 60_000_000, // ≈ US$ 25–30/mês no preço do Flash-Lite
    gowebDailyTokens: 700_000, // ≈ 100 respostas/dia no número da GoWeb
    storeDailyTokens: 500_000, // ≈ 70 respostas/dia por loja
    storeMonthlyTokens: 8_000_000,
    chatDailyTokens: 80_000, // ≈ 11 respostas: conversa que passa disso no dia vai para um humano
    priceInPerM: 0.3, // Gemini 3.5 Flash-Lite (ago/2026)
    priceOutPerM: 2.5,
  },
  loop: { inboundPerMinute: 8, floodPauseMin: 15, botStreakMax: 3 },
};

// -----------------------------------------------------------------------------
// leitura da configuração (aceita só valores sãos)
// -----------------------------------------------------------------------------
const num = (v: unknown, d: number, min: number, max: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d;
};
const int = (v: unknown, d: number, min: number, max: number) => Math.round(num(v, d, min, max));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function limits(v: unknown, d: Limits): Limits {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    perMinute: int(o.perMinute, d.perMinute, 1, 600),
    perHour: int(o.perHour, d.perHour, 1, 20_000),
    perDay: int(o.perDay, d.perDay, 1, 200_000),
    minGapSec: num(o.minGapSec, d.minGapSec, 0, 60),
    perContactMinute: int(o.perContactMinute, d.perContactMinute, 1, 30),
    perContactHour: int(o.perContactHour, d.perContactHour, 1, 500),
    perContactDay: int(o.perContactDay, d.perContactDay, 1, 2000),
    proactivePerContactDay: int(o.proactivePerContactDay, d.proactivePerContactDay, 0, 50),
    proactivePerContactWeek: int(o.proactivePerContactWeek, d.proactivePerContactWeek, 0, 200),
    newContactsPerDay: int(o.newContactsPerDay, d.newContactsPerDay, 0, 100_000),
  };
}

export function parseWaGuard(raw: string | null | undefined): WaGuardConfig {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const d = DEFAULT_WA_GUARD;
  const g = (j.global ?? {}) as Record<string, unknown>;
  const w = (j.window ?? {}) as Record<string, unknown>;
  const r = (j.retry ?? {}) as Record<string, unknown>;
  const b = (j.breaker ?? {}) as Record<string, unknown>;
  const a = (j.ai ?? {}) as Record<string, unknown>;
  const l = (j.loop ?? {}) as Record<string, unknown>;
  const mo = (a.maxOutputTokens ?? {}) as Record<string, unknown>;
  const ht = (a.historyTurns ?? {}) as Record<string, unknown>;
  const days = Array.isArray(w.days) ? [...new Set(w.days.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort() : d.window.days;
  return {
    goweb: limits(j.goweb, d.goweb),
    store: limits(j.store, d.store),
    global: { perMinute: int(g.perMinute, d.global.perMinute, 1, 6000), perHour: int(g.perHour, d.global.perHour, 1, 200_000), perDay: int(g.perDay, d.global.perDay, 1, 2_000_000) },
    window: {
      from: typeof w.from === "string" && HHMM.test(w.from) ? w.from : d.window.from,
      to: typeof w.to === "string" && HHMM.test(w.to) ? w.to : d.window.to,
      days: days.length ? days : d.window.days,
    },
    retry: { maxAttempts: int(r.maxAttempts, d.retry.maxAttempts, 1, 10), baseSec: int(r.baseSec, d.retry.baseSec, 5, 600), maxSec: int(r.maxSec, d.retry.maxSec, 60, 86_400) },
    breaker: {
      failStreak: int(b.failStreak, d.breaker.failStreak, 2, 50),
      openMin: int(b.openMin, d.breaker.openMin, 1, 1440),
      maxOpenMin: int(b.maxOpenMin, d.breaker.maxOpenMin, 5, 10_080),
      blockedBurst10m: int(b.blockedBurst10m, d.breaker.blockedBurst10m, 5, 10_000),
    },
    ai: {
      perMinute: int(a.perMinute, d.ai.perMinute, 1, 2000),
      maxOutputTokens: { goweb: int(mo.goweb, d.ai.maxOutputTokens.goweb, 100, 4000), store: int(mo.store, d.ai.maxOutputTokens.store, 100, 4000) },
      historyTurns: { goweb: int(ht.goweb, d.ai.historyTurns.goweb, 2, 40), store: int(ht.store, d.ai.historyTurns.store, 2, 40) },
      turnChars: int(a.turnChars, d.ai.turnChars, 100, 4000),
      economyAt: num(a.economyAt, d.ai.economyAt, 0.3, 0.99),
      dailyTokens: int(a.dailyTokens, d.ai.dailyTokens, 10_000, 1e10),
      monthlyTokens: int(a.monthlyTokens, d.ai.monthlyTokens, 10_000, 1e11),
      gowebDailyTokens: int(a.gowebDailyTokens, d.ai.gowebDailyTokens, 10_000, 1e10),
      storeDailyTokens: int(a.storeDailyTokens, d.ai.storeDailyTokens, 10_000, 1e10),
      storeMonthlyTokens: int(a.storeMonthlyTokens, d.ai.storeMonthlyTokens, 10_000, 1e11),
      chatDailyTokens: int(a.chatDailyTokens, d.ai.chatDailyTokens, 5_000, 1e9),
      priceInPerM: num(a.priceInPerM, d.ai.priceInPerM, 0, 1000),
      priceOutPerM: num(a.priceOutPerM, d.ai.priceOutPerM, 0, 1000),
    },
    loop: { inboundPerMinute: int(l.inboundPerMinute, d.loop.inboundPerMinute, 2, 120), floodPauseMin: int(l.floodPauseMin, d.loop.floodPauseMin, 1, 1440), botStreakMax: int(l.botStreakMax, d.loop.botStreakMax, 1, 20) },
  };
}

// -----------------------------------------------------------------------------
// limite de envio (rate limiting)
// -----------------------------------------------------------------------------
export type Counts = {
  /** número (canal) */
  minute: number;
  hour: number;
  day: number;
  lastAt: number | null; // ms da última mensagem enviada pelo número
  /** contato */
  contactMinute: number;
  contactHour: number;
  contactDay: number;
  /** iniciadas pela empresa para este contato */
  proactiveContactDay: number;
  proactiveContactWeek: number;
  /** contatos únicos que já receberam mensagem iniciada pela empresa hoje / este contato já está entre eles */
  newContactsToday: number;
  contactAlreadyToday: boolean;
  /** todos os números */
  globalMinute: number;
  globalHour: number;
  globalDay: number;
};

export type RateDecision = { ok: true } | { ok: false; reason: string; retryAt: number; hard?: boolean };

const MIN = 60_000;
const HOUR = 3_600_000;

/** Pode enviar agora? Se não, devolve quando tentar de novo (e `hard` = não adianta esperar hoje). */
export function rateDecision(c: Counts, lim: Limits, glob: WaGuardConfig["global"], kind: SendKind, now: number): RateDecision {
  const nextMin = now + MIN;
  if (c.globalMinute >= glob.perMinute) return { ok: false, reason: "limite geral por minuto", retryAt: nextMin };
  if (c.globalHour >= glob.perHour) return { ok: false, reason: "limite geral por hora", retryAt: now + 10 * MIN };
  if (c.globalDay >= glob.perDay) return { ok: false, reason: "limite geral do dia", retryAt: now + HOUR, hard: true };
  if (c.minute >= lim.perMinute) return { ok: false, reason: "limite por minuto do número", retryAt: nextMin };
  if (c.hour >= lim.perHour) return { ok: false, reason: "limite por hora do número", retryAt: now + 10 * MIN };
  if (c.day >= lim.perDay) return { ok: false, reason: "limite do dia do número", retryAt: now + HOUR, hard: true };
  if (c.contactMinute >= lim.perContactMinute) return { ok: false, reason: "muitas mensagens seguidas para o mesmo contato", retryAt: nextMin };
  if (c.contactHour >= lim.perContactHour) return { ok: false, reason: "limite por hora do contato", retryAt: now + 15 * MIN };
  if (c.contactDay >= lim.perContactDay) return { ok: false, reason: "limite do dia do contato", retryAt: now + HOUR, hard: true };
  if (kind === "proactive") {
    if (c.proactiveContactDay >= lim.proactivePerContactDay) return { ok: false, reason: "contato já recebeu mensagem da empresa hoje", retryAt: now + 6 * HOUR, hard: true };
    if (c.proactiveContactWeek >= lim.proactivePerContactWeek) return { ok: false, reason: "contato já recebeu o máximo da semana", retryAt: now + 24 * HOUR, hard: true };
  }
  if ((kind === "proactive" || kind === "notice") && !c.contactAlreadyToday && c.newContactsToday >= lim.newContactsPerDay) {
    return { ok: false, reason: "limite de contatos novos do dia", retryAt: now + HOUR, hard: true };
  }
  if (c.lastAt !== null && now - c.lastAt < lim.minGapSec * 1000) return { ok: false, reason: "intervalo mínimo", retryAt: c.lastAt + lim.minGapSec * 1000 };
  return { ok: true };
}

/** Uso dos limites em % (o maior), para o indicador do painel. */
export function limitUsage(c: Pick<Counts, "minute" | "hour" | "day">, lim: Pick<Limits, "perMinute" | "perHour" | "perDay">) {
  return Math.round(Math.max(c.minute / lim.perMinute, c.hour / lim.perHour, c.day / lim.perDay) * 100);
}

// -----------------------------------------------------------------------------
// horário permitido para mensagens iniciadas pela empresa
// -----------------------------------------------------------------------------
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** `local` = minutos do dia e dia da semana (0 = domingo) no fuso do número. */
export function inWindow(local: { minutes: number; dow: number }, w: WaGuardConfig["window"]) {
  if (!w.days.includes(local.dow)) return false;
  const a = toMin(w.from);
  const b = toMin(w.to);
  return a <= b ? local.minutes >= a && local.minutes < b : local.minutes >= a || local.minutes < b;
}

/** Quantos minutos faltam para a janela abrir (0 = já aberta). */
export function minutesUntilWindow(local: { minutes: number; dow: number }, w: WaGuardConfig["window"]) {
  if (inWindow(local, w)) return 0;
  const start = toMin(w.from);
  for (let d = 0; d <= 7; d++) {
    const dow = (local.dow + d) % 7;
    if (!w.days.includes(dow)) continue;
    const wait = d * 1440 + start - local.minutes;
    if (wait > 0) return wait;
  }
  return 1440;
}

/** Minutos do dia e dia da semana num fuso fixo (offset em minutos, ex.: -180). */
export function localTime(nowMs: number, offsetMin: number) {
  const d = new Date(nowMs + offsetMin * MIN);
  return { minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}

// -----------------------------------------------------------------------------
// falhas: classificação, reenvio com espera progressiva e circuit breaker
// -----------------------------------------------------------------------------
/** temporary = tentar de novo; permanent = não adianta (número inválido…); auth = credencial; restricted = sinal de
 *  restrição da Meta/WhatsApp; window = fora da janela de 24 h (API oficial); disconnected = número desconectado. */
export type ErrorClass = "temporary" | "permanent" | "auth" | "restricted" | "window" | "pair" | "disconnected";

export function classifyError(e: { status?: number; message?: string; code?: number | null }): ErrorClass {
  const m = (e.message ?? "").toLowerCase();
  const code = e.code ?? Number((m.match(/\b(1310\d\d|1300\d\d|13\d{4}|368|190|470|80007)\b/) ?? [])[1] ?? NaN);
  if ([368, 131031, 131048, 131049].includes(code) || /spam|blocked|bloquead|banned|restrict|policy|violat/.test(m)) return "restricted";
  if ([190, 0].includes(code) && /token|auth|oauth|session/.test(m)) return "auth";
  if (e.status === 401 || e.status === 403 || /inválida|invalid (api )?key|unauthorized|forbidden|token/.test(m)) return "auth";
  if (code === 131047 || code === 470 || /24 ?h|re-?engagement|janela/.test(m)) return "window";
  if (code === 131056 || /pair rate/.test(m)) return "pair";
  if (code === 130429 || code === 80007 || e.status === 429 || /rate limit|too many/.test(m)) return "temporary";
  if (/not connected|connection closed|desconect|instance.*(not found|does not exist)|qr|logged ?out|fora do ar/.test(m) || e.status === 404) return "disconnected";
  if (e.status && e.status >= 400 && e.status < 500 && e.status !== 408) return "permanent";
  if (/exists"?:\s*false|not on whatsapp|invalid (phone|number)|número inválido/.test(m)) return "permanent";
  return "temporary";
}

/** Espera antes da tentativa `attempt` (1, 2, 3…): base·2^(n−1), com até 20% de variação, no máximo `maxSec`. */
export function backoffMs(attempt: number, r: WaGuardConfig["retry"], rand = Math.random()) {
  const base = Math.min(r.maxSec, r.baseSec * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * 1000 * (1 + 0.2 * rand));
}

export type BreakerState = {
  /** pausa manual (botão) */
  paused: boolean;
  /** circuito aberto até (ms); null = fechado. `manual` = só volta com um sócio clicando em retomar */
  openUntil: number | null;
  manual: boolean;
  reason: string | null;
  failStreak: number;
  trips: number; // quantas vezes abriu seguidas (para dobrar o tempo)
};

export const CLOSED: BreakerState = { paused: false, openUntil: null, manual: false, reason: null, failStreak: 0, trips: 0 };

export function isOpen(s: BreakerState, now: number) {
  return s.paused || s.manual || (s.openUntil !== null && s.openUntil > now);
}

/** Tempo de abertura: dobra a cada abertura seguida, até o máximo. */
export function openMinutes(trips: number, b: WaGuardConfig["breaker"]) {
  return Math.min(b.maxOpenMin, b.openMin * 2 ** Math.max(0, trips));
}

/** Estado depois de um envio que falhou. `alert` = avisar os sócios agora. */
export function afterFailure(s: BreakerState, cls: ErrorClass, b: WaGuardConfig["breaker"], now: number): { state: BreakerState; alert: string | null } {
  if (cls === "restricted") {
    // sinal de restrição: para e só volta quando um sócio conferir o número (respeita o tempo que a Meta impuser)
    return { state: { ...s, manual: true, openUntil: null, reason: "sinal de restrição do WhatsApp/Meta", failStreak: s.failStreak + 1, trips: s.trips + 1 }, alert: "O WhatsApp sinalizou restrição/spam. Envios parados até um sócio conferir o número." };
  }
  if (cls === "auth") {
    return { state: { ...s, manual: true, openUntil: null, reason: "credencial inválida ou expirada", failStreak: s.failStreak + 1, trips: s.trips + 1 }, alert: "Credencial do WhatsApp inválida/expirada. Envios parados até reconectar." };
  }
  if (cls === "disconnected") {
    const mins = openMinutes(s.trips, b);
    return { state: { ...s, openUntil: now + mins * MIN, reason: "número desconectado", failStreak: s.failStreak + 1, trips: s.trips + 1 }, alert: s.trips === 0 ? "O número do WhatsApp parece desconectado. Envios pausados; confira o QR/conexão." : null };
  }
  if (cls === "permanent" || cls === "window" || cls === "pair") {
    // problema da mensagem/contato, não do número: não conta para abrir o circuito
    return { state: s, alert: null };
  }
  const streak = s.failStreak + 1;
  if (streak >= b.failStreak) {
    const mins = openMinutes(s.trips, b);
    return { state: { ...s, openUntil: now + mins * MIN, reason: `${streak} falhas seguidas de envio`, failStreak: streak, trips: s.trips + 1 }, alert: `${streak} falhas seguidas de envio. Envios pausados por ${mins} min.` };
  }
  return { state: { ...s, failStreak: streak }, alert: null };
}

/** Envio deu certo: zera a contagem de falhas (abertura automática que já venceu também se fecha). */
export function afterSuccess(s: BreakerState, now: number): BreakerState {
  const expired = s.openUntil !== null && s.openUntil <= now;
  return { ...s, failStreak: 0, trips: expired || s.openUntil === null ? 0 : s.trips, openUntil: expired ? null : s.openUntil, reason: expired ? null : s.reason };
}

// -----------------------------------------------------------------------------
// duplicadas e loops
// -----------------------------------------------------------------------------
export function normText(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, "<link>")
    .replace(/[^\p{L}\p{N}<>]+/gu, " ")
    .trim();
}

/** Hash curto (FNV-1a 32 bits) — só para comparar textos, não é segurança. */
export function textHash(t: string) {
  let h = 0x811c9dc5;
  const s = normText(t);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** A IA está repetindo a mesma resposta? */
export function isRepeat(reply: string, lastBotTexts: string[]) {
  const n = normText(reply);
  if (n.length < 8) return false;
  return lastBotTexts.slice(0, 3).some((t) => normText(t) === n);
}

/** Opt-out pelos clientes da loja (pt e es) — igual ao "parar" do número da GoWeb. */
export const STORE_OPT_OUT = /^\s*(parar|pare|sair|stop|cancelar mensagens|n[ãa]o quero (mais )?mensagens?|baja|no quiero (m[áa]s )?mensajes?|dejar de recibir)\s*[.!]*\s*$/i;

// -----------------------------------------------------------------------------
// IA: orçamento de tokens, modo economia e histórico enxuto
// -----------------------------------------------------------------------------
export type AiUsage = { day: number; month: number; channelDay: number; storeMonth: number; chatDay: number; lastMinuteCalls: number };
export type AiMode = { mode: "normal" | "economy" | "blocked"; reason: string | null; pct: number };

/** Decide o modo da IA para esta chamada. `scope` = número da GoWeb ou de uma loja. */
export function aiMode(u: AiUsage, ai: WaGuardConfig["ai"], scope: ChannelKind): AiMode {
  const chDay = scope === "goweb" ? ai.gowebDailyTokens : ai.storeDailyTokens;
  const ratios: [number, string][] = [
    [u.day / ai.dailyTokens, "orçamento diário geral da IA"],
    [u.month / ai.monthlyTokens, "orçamento mensal geral da IA"],
    [u.channelDay / chDay, scope === "goweb" ? "orçamento diário da Geovana da GoWeb" : "orçamento diário da IA desta loja"],
    ...(scope === "store" ? ([[u.storeMonth / ai.storeMonthlyTokens, "orçamento mensal da IA desta loja"]] as [number, string][]) : []),
  ];
  const [worst, why] = ratios.reduce((a, b) => (b[0] > a[0] ? b : a));
  const pct = Math.round(worst * 100);
  if (u.chatDay >= ai.chatDailyTokens) return { mode: "blocked", reason: "esta conversa já consumiu o limite do dia", pct };
  if (worst >= 1) return { mode: "blocked", reason: why, pct };
  if (u.lastMinuteCalls >= ai.perMinute) return { mode: "blocked", reason: "muitas chamadas à IA neste minuto", pct };
  if (worst >= ai.economyAt) return { mode: "economy", reason: why, pct };
  return { mode: "normal", reason: null, pct };
}

/** Parâmetros da chamada conforme o modo: economia = metade do histórico e respostas mais curtas. */
export function aiParams(mode: AiMode["mode"], ai: WaGuardConfig["ai"], scope: ChannelKind) {
  const turns = ai.historyTurns[scope];
  const out = ai.maxOutputTokens[scope];
  return mode === "economy" ? { turns: Math.max(2, Math.ceil(turns / 2)), maxTokens: Math.max(150, Math.round(out * 0.6)), catalogLimit: 60 } : { turns, maxTokens: out, catalogLimit: 150 };
}

export type Turn = { role: "user" | "model"; text: string };

/** Histórico enviado ao modelo: só as últimas `turns` mensagens, cada uma cortada em `chars`, começando por quem escreveu. */
export function trimHistory(h: Turn[], turns: number, chars: number): Turn[] {
  const last = h.slice(-turns).map((t) => ({ role: t.role, text: t.text.length > chars ? `${t.text.slice(0, chars)}…` : t.text }));
  while (last.length > 1 && last[0].role !== "user") last.shift();
  return last;
}

export function costUsd(tokensIn: number, tokensOut: number, ai: Pick<WaGuardConfig["ai"], "priceInPerM" | "priceOutPerM">) {
  return (tokensIn * ai.priceInPerM + tokensOut * ai.priceOutPerM) / 1_000_000;
}

/** Mensagem quando a IA está sem orçamento: o cliente não fica sem resposta e a conversa vai para um humano. */
export function aiFallbackText(scope: ChannelKind, pt: boolean) {
  if (scope === "goweb") return "Recebi sua mensagem! Um dos sócios da GoWeb vai te responder por aqui em breve. 🙌";
  return pt ? "Recebi sua mensagem! Já já alguém da equipe te responde por aqui. 🙌" : "¡Recibí tu mensaje! En breve alguien del equipo te responde por acá. 🙌";
}
