import { describe, expect, it } from "vitest";
import {
  afterFailure,
  afterSuccess,
  aiMode,
  aiParams,
  backoffMs,
  classifyError,
  CLOSED,
  costUsd,
  DEFAULT_WA_GUARD as D,
  inWindow,
  isOpen,
  isRepeat,
  limitUsage,
  localTime,
  minutesUntilWindow,
  parseWaGuard,
  rateDecision,
  STORE_OPT_OUT,
  textHash,
  trimHistory,
  type Counts,
} from "./wa-guard";

const NOW = Date.UTC(2026, 10, 11, 15, 0, 0); // qua 12:00 em Brasília
const zero: Counts = {
  minute: 0, hour: 0, day: 0, lastAt: null, contactMinute: 0, contactHour: 0, contactDay: 0,
  proactiveContactDay: 0, proactiveContactWeek: 0, newContactsToday: 0, contactAlreadyToday: false, globalMinute: 0, globalHour: 0, globalDay: 0,
};

describe("proteção da Geovana: configuração", () => {
  it("padrão quando vazio ou inválido, e corta valores absurdos", () => {
    expect(parseWaGuard(null)).toEqual(D);
    expect(parseWaGuard("lixo")).toEqual(D);
    const c = parseWaGuard(JSON.stringify({ goweb: { perMinute: 99999, minGapSec: -5 }, window: { from: "25:00", days: [9, 0, 0] }, ai: { economyAt: 5 } }));
    expect(c.goweb.perMinute).toBe(600);
    expect(c.goweb.minGapSec).toBe(0);
    expect(c.window.from).toBe(D.window.from);
    expect(c.window.days).toEqual([0]);
    expect(c.ai.economyAt).toBe(0.99);
  });
});

describe("limite de envio", () => {
  const L = D.goweb;
  it("libera dentro dos limites", () => {
    expect(rateDecision(zero, L, D.global, "reply", NOW)).toEqual({ ok: true });
  });
  it("segura por minuto, por contato e pelo intervalo mínimo", () => {
    expect(rateDecision({ ...zero, minute: L.perMinute }, L, D.global, "reply", NOW)).toMatchObject({ ok: false, reason: "limite por minuto do número", retryAt: NOW + 60_000 });
    expect(rateDecision({ ...zero, contactMinute: L.perContactMinute }, L, D.global, "reply", NOW)).toMatchObject({ ok: false });
    expect(rateDecision({ ...zero, lastAt: NOW - 1000 }, L, D.global, "reply", NOW)).toMatchObject({ ok: false, reason: "intervalo mínimo", retryAt: NOW - 1000 + L.minGapSec * 1000 });
    expect(rateDecision({ ...zero, day: L.perDay }, L, D.global, "reply", NOW)).toMatchObject({ ok: false, hard: true });
  });
  it("mensagem da empresa: 1 por contato por dia e teto de contatos novos", () => {
    expect(rateDecision({ ...zero, proactiveContactDay: 1 }, L, D.global, "proactive", NOW)).toMatchObject({ ok: false, hard: true });
    expect(rateDecision({ ...zero, proactiveContactDay: 1 }, L, D.global, "reply", NOW)).toEqual({ ok: true });
    expect(rateDecision({ ...zero, newContactsToday: L.newContactsPerDay }, L, D.global, "proactive", NOW)).toMatchObject({ ok: false, reason: "limite de contatos novos do dia" });
    expect(rateDecision({ ...zero, newContactsToday: L.newContactsPerDay, contactAlreadyToday: true }, L, D.global, "proactive", NOW)).toEqual({ ok: true });
  });
  it("limite geral vale para todos os números", () => {
    expect(rateDecision({ ...zero, globalMinute: D.global.perMinute }, D.store, D.global, "reply", NOW)).toMatchObject({ ok: false, reason: "limite geral por minuto" });
  });
  it("uso em %", () => {
    expect(limitUsage({ minute: 5, hour: 15, day: 60 }, { perMinute: 10, perHour: 150, perDay: 600 })).toBe(50);
  });
});

describe("horário das mensagens da empresa", () => {
  const w = D.window;
  it("seg–sáb 9h–20h no fuso do número", () => {
    expect(inWindow(localTime(NOW, -180), w)).toBe(true); // qua 12h
    expect(inWindow(localTime(Date.UTC(2026, 10, 11, 23, 30), -180), w)).toBe(false); // qua 20h30
    expect(inWindow(localTime(Date.UTC(2026, 10, 15, 15, 0), -180), w)).toBe(false); // domingo
  });
  it("quanto falta para abrir", () => {
    expect(minutesUntilWindow({ minutes: 8 * 60, dow: 3 }, w)).toBe(60);
    expect(minutesUntilWindow({ minutes: 21 * 60, dow: 3 }, w)).toBe(12 * 60); // amanhã 9h
    expect(minutesUntilWindow({ minutes: 21 * 60, dow: 6 }, w)).toBe(36 * 60); // sábado 21h → segunda 9h
    expect(minutesUntilWindow({ minutes: 10 * 60, dow: 2 }, w)).toBe(0);
  });
});

describe("falhas, reenvio e circuit breaker", () => {
  it("classifica os erros da Meta e da Evolution", () => {
    expect(classifyError({ message: "WhatsApp oficial: (#131048) Spam rate limit hit" })).toBe("restricted");
    expect(classifyError({ message: "WhatsApp oficial: (#368) Temporarily blocked for policies violations" })).toBe("restricted");
    expect(classifyError({ message: "WhatsApp oficial: (#131047) Re-engagement message" })).toBe("window");
    expect(classifyError({ message: "WhatsApp oficial: (#131056) (Business Account, Consumer Account) pair rate limit hit" })).toBe("pair");
    expect(classifyError({ message: "WhatsApp oficial: (#130429) Rate limit hit" })).toBe("temporary");
    expect(classifyError({ message: "WhatsApp oficial: (#190) Error validating access token" })).toBe("auth");
    expect(classifyError({ status: 401, message: "Chave da Evolution inválida." })).toBe("auth");
    expect(classifyError({ message: "Servidor do WhatsApp (Evolution) fora do ar." })).toBe("disconnected");
    expect(classifyError({ status: 400, message: 'Evolution: [{"exists":false,"number":"5581..."}]' })).toBe("permanent");
    expect(classifyError({ status: 500, message: "Evolution: Internal Server Error" })).toBe("temporary");
  });
  it("espera progressiva", () => {
    expect(backoffMs(1, D.retry, 0)).toBe(30_000);
    expect(backoffMs(3, D.retry, 0)).toBe(120_000);
    expect(backoffMs(20, D.retry, 0)).toBe(3_600_000);
    expect(backoffMs(1, D.retry, 1)).toBe(36_000);
  });
  it("abre depois de falhas seguidas e dobra o tempo", () => {
    let s = CLOSED;
    for (let i = 0; i < D.breaker.failStreak - 1; i++) s = afterFailure(s, "temporary", D.breaker, NOW).state;
    expect(isOpen(s, NOW)).toBe(false);
    const r = afterFailure(s, "temporary", D.breaker, NOW);
    expect(isOpen(r.state, NOW)).toBe(true);
    expect(r.state.openUntil).toBe(NOW + 15 * 60_000);
    expect(r.alert).toContain("falhas seguidas");
    const again = afterFailure({ ...r.state, failStreak: D.breaker.failStreak - 1 }, "temporary", D.breaker, NOW);
    expect(again.state.openUntil).toBe(NOW + 30 * 60_000);
  });
  it("restrição e credencial param até um sócio retomar; erro do contato não conta", () => {
    const r = afterFailure(CLOSED, "restricted", D.breaker, NOW);
    expect(r.state.manual).toBe(true);
    expect(isOpen(r.state, NOW + 365 * 86_400_000)).toBe(true);
    expect(afterFailure(CLOSED, "auth", D.breaker, NOW).state.manual).toBe(true);
    expect(afterFailure(CLOSED, "permanent", D.breaker, NOW).state).toEqual(CLOSED);
  });
  it("sucesso zera a sequência e fecha abertura vencida", () => {
    const open = { ...CLOSED, openUntil: NOW - 1, reason: "x", failStreak: 5, trips: 2 };
    expect(afterSuccess(open, NOW)).toEqual(CLOSED);
  });
});

describe("duplicadas, loops e opt-out", () => {
  it("mesmo texto (ignorando maiúsculas, acentos e links) = repetição", () => {
    expect(textHash("Olá! Veja: https://a.com/x")).toBe(textHash("ola veja https://b.com/y"));
    expect(isRepeat("Oi, tudo bem? Posso ajudar?", ["oi tudo bem posso ajudar"])).toBe(true);
    expect(isRepeat("Ok", ["ok"])).toBe(false); // curtinho não conta
  });
  it("parar / baja", () => {
    expect(STORE_OPT_OUT.test("Parar")).toBe(true);
    expect(STORE_OPT_OUT.test("no quiero más mensajes")).toBe(true);
    expect(STORE_OPT_OUT.test("quero parar de comer pizza")).toBe(false);
  });
});

describe("economia de IA", () => {
  const u = { day: 0, month: 0, channelDay: 0, storeMonth: 0, chatDay: 0, lastMinuteCalls: 0 };
  it("normal, economia perto do limite e bloqueio", () => {
    expect(aiMode(u, D.ai, "store").mode).toBe("normal");
    expect(aiMode({ ...u, channelDay: D.ai.storeDailyTokens * 0.85 }, D.ai, "store")).toMatchObject({ mode: "economy", pct: 85 });
    expect(aiMode({ ...u, month: D.ai.monthlyTokens }, D.ai, "goweb")).toMatchObject({ mode: "blocked", reason: "orçamento mensal geral da IA" });
    expect(aiMode({ ...u, chatDay: D.ai.chatDailyTokens }, D.ai, "goweb").mode).toBe("blocked");
    expect(aiMode({ ...u, lastMinuteCalls: D.ai.perMinute }, D.ai, "goweb").mode).toBe("blocked");
  });
  it("franquia de 1.000 respostas por loja no mês (WhatsApp + Instagram)", () => {
    expect(D.ai.storeMonthlyReplies).toBe(1000);
    expect(aiMode({ ...u, storeMonthReplies: 999 }, D.ai, "store").mode).toBe("economy");
    expect(aiMode({ ...u, storeMonthReplies: 1000 }, D.ai, "store")).toMatchObject({ mode: "blocked", reason: "franquia mensal de respostas de IA desta loja" });
    expect(aiMode({ ...u, storeMonthReplies: 5000 }, D.ai, "goweb").mode).toBe("normal"); // a GoWeb não tem franquia
    expect(parseWaGuard(JSON.stringify({ ai: { storeMonthlyReplies: 2000 } })).ai.storeMonthlyReplies).toBe(2000);
  });
  it("modo economia corta histórico e tamanho da resposta", () => {
    expect(aiParams("normal", D.ai, "store")).toEqual({ turns: 10, maxTokens: 600, catalogLimit: 150 });
    expect(aiParams("economy", D.ai, "store")).toEqual({ turns: 5, maxTokens: 360, catalogLimit: 60 });
  });
  it("histórico enxuto começando pelo cliente", () => {
    const h = [
      { role: "model" as const, text: "a" },
      { role: "user" as const, text: "x".repeat(900) },
      { role: "model" as const, text: "b" },
      { role: "user" as const, text: "c" },
    ];
    const t = trimHistory(h, 3, 700);
    expect(t.map((x) => x.role)).toEqual(["user", "model", "user"]);
    expect(t[0].text.length).toBe(701);
    expect(trimHistory(h, 4, 700)[0].role).toBe("user");
  });
  it("custo estimado", () => {
    expect(costUsd(1_000_000, 100_000, D.ai)).toBeCloseTo(0.55, 5);
  });
});
