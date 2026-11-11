// CRM dos sócios — agenda, bloco de notas, lembretes e a "ilha ao vivo" (estilo Dynamic Island / notificação
// em andamento do Android). Regras PURAS: horários em Brasília, repetição de lembretes, checklist das notas e
// o que a ilha mostra agora.
import { brDayInput, brDayStart, brTimeInput } from "./crm";

const MIN = 60_000;
const DAY = 86_400_000;

// ---------------------------------------------------------------- agenda
export const EVENT_KINDS = ["meeting", "demo", "call", "visit", "task", "personal"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_KIND_LABEL: Record<EventKind, string> = { meeting: "Reunião", demo: "Demonstração", call: "Ligação", visit: "Visita", task: "Tarefa", personal: "Pessoal" };
export const EVENT_KIND_COLOR: Record<EventKind | "followup" | "leaddemo", string> = { meeting: "#1F7FD8", demo: "#3CC46B", call: "#22A8B8", visit: "#F5B301", task: "#8B5CF6", personal: "#E0607E", followup: "#F59E0B", leaddemo: "#3CC46B" };
export const REMIND_OPTIONS = [null, 0, 5, 10, 15, 30, 60, 120, 1440] as const;
export const remindLabel = (m: number | null) => (m == null ? "Sem aviso" : m === 0 ? "Na hora" : m < 60 ? `${m} min antes` : m < 1440 ? `${m / 60} h antes` : "1 dia antes");

export const isEventKind = (v: unknown): v is EventKind => typeof v === "string" && (EVENT_KINDS as readonly string[]).includes(v);

/** Item da agenda (compromisso próprio, demo de lead ou retorno marcado). */
export type AgendaItem = { id: string; source: "event" | "leaddemo" | "followup"; kind: EventKind | "followup" | "leaddemo"; title: string; startsAt: Date; durationMin: number; leadId: string | null; url: string; shared: boolean; done: boolean; location: string | null };

/** Agrupa por dia de Brasília (AAAA-MM-DD), ordem cronológica. */
export function groupByDay(items: AgendaItem[]) {
  const map = new Map<string, AgendaItem[]>();
  for (const it of [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const k = brDayInput(it.startsAt);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()].map(([day, list]) => ({ day, items: list }));
}

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "Hoje", "Amanhã" ou "qua, 19 nov". */
export function dayLabel(day: string, now = new Date()) {
  const today = brDayInput(now);
  const tomorrow = brDayInput(new Date(brDayStart(now).getTime() + DAY + 3600_000));
  if (day === today) return "Hoje";
  if (day === tomorrow) return "Amanhã";
  const d = new Date(`${day}T12:00:00Z`);
  return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Os 7 dias a partir de hoje (faixa da semana no topo da agenda). */
export function weekStrip(now = new Date()) {
  const s = brDayStart(now).getTime();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(s + i * DAY + 12 * 3600_000);
    const day = brDayInput(d);
    return { day, wd: WD[new Date(`${day}T12:00:00Z`).getUTCDay()], n: Number(day.slice(8)) };
  });
}

/** Aviso do compromisso já deve sair? (uma vez; nunca depois que acabou) */
export function eventReminderDue(e: { startsAt: Date; durationMin: number; remindMin: number | null; remindedAt: Date | null; doneAt: Date | null }, now: number) {
  if (e.remindMin == null || e.remindedAt || e.doneAt) return false;
  const at = e.startsAt.getTime() - e.remindMin * MIN;
  return now >= at && now < e.startsAt.getTime() + e.durationMin * MIN;
}

// ---------------------------------------------------------------- lembretes
export const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;
export type Repeat = (typeof REPEATS)[number];
export const REPEAT_LABEL: Record<Repeat, string> = { none: "Uma vez", daily: "Todo dia", weekdays: "Dias úteis", weekly: "Toda semana", monthly: "Todo mês" };
export const isRepeat = (v: unknown): v is Repeat => typeof v === "string" && (REPEATS as readonly string[]).includes(v);

/** Próxima vez de um lembrete que repete (sempre depois de `now`, mantendo o horário de Brasília). */
export function nextOccurrence(at: Date, repeat: Repeat, now: number): Date | null {
  if (repeat === "none") return null;
  let t = new Date(at);
  for (let guard = 0; guard < 800 && t.getTime() <= now; guard++) {
    if (repeat === "daily") t = new Date(t.getTime() + DAY);
    else if (repeat === "weekly") t = new Date(t.getTime() + 7 * DAY);
    else if (repeat === "monthly") {
      const local = new Date(t.getTime() - 3 * 3600_000);
      const y = local.getUTCFullYear();
      const m = local.getUTCMonth() + 1;
      const day = Math.min(local.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
      t = new Date(Date.UTC(y, m, day, local.getUTCHours(), local.getUTCMinutes()) + 3 * 3600_000);
    } else {
      // dias úteis: pula sábado e domingo (Brasília)
      do t = new Date(t.getTime() + DAY);
      while ([0, 6].includes(new Date(t.getTime() - 3 * 3600_000).getUTCDay()));
    }
  }
  return t;
}

/** Atalhos de "lembrar em…" → horário. */
export function quickWhen(key: string, now = new Date()): Date | null {
  const n = now.getTime();
  if (key === "15m") return new Date(n + 15 * MIN);
  if (key === "1h") return new Date(n + 60 * MIN);
  if (key === "3h") return new Date(n + 180 * MIN);
  const day = (offset: number, hh: number) => new Date(brDayStart(now).getTime() + offset * DAY + hh * 3600_000);
  if (key === "tonight") return day(0, 19).getTime() > n ? day(0, 19) : day(1, 19);
  if (key === "tomorrow9") return day(1, 9);
  if (key === "monday9") {
    const dow = new Date(n - 3 * 3600_000).getUTCDay();
    return day(((8 - dow) % 7) || 7, 9);
  }
  return null;
}

// ---------------------------------------------------------------- notas
export const NOTE_COLORS = { ivory: ["#FFFDF6", "#2A2620"], yellow: ["#FFF4C2", "#3A3214"], green: ["#DDF6E5", "#16301F"], blue: ["#DCEBFB", "#132538"], pink: ["#FCE1EA", "#3A1824"], violet: ["#ECE4FF", "#241B3A"] } as const;
export type NoteColor = keyof typeof NOTE_COLORS;
export const isNoteColor = (v: unknown): v is NoteColor => typeof v === "string" && v in NOTE_COLORS;

export type NoteLine = { kind: "text"; text: string } | { kind: "check"; text: string; done: boolean; index: number };

/** "- [ ] item" / "- [x] item" viram caixinhas; o resto é texto. */
export function parseNote(body: string): NoteLine[] {
  return body.split("\n").map((line, index) => {
    const m = /^\s*[-*]\s*\[( |x|X)\]\s?(.*)$/.exec(line);
    return m ? { kind: "check" as const, text: m[2], done: m[1].toLowerCase() === "x", index } : { kind: "text" as const, text: line };
  });
}

/** Marca/desmarca a linha `index` do checklist. */
export function toggleCheck(body: string, index: number) {
  const lines = body.split("\n");
  const l = lines[index];
  if (l === undefined) return body;
  lines[index] = l.replace(/\[( |x|X)\]/, (_, c: string) => (c.trim() ? "[ ]" : "[x]"));
  return lines.join("\n");
}

export function noteProgress(body: string) {
  const checks = parseNote(body).filter((l): l is Extract<NoteLine, { kind: "check" }> => l.kind === "check");
  return { total: checks.length, done: checks.filter((c) => c.done).length };
}

// ---------------------------------------------------------------- ilha ao vivo
export type Live =
  | { kind: "event_now"; title: string; since: number; until: number; url: string; id: string }
  | { kind: "event_soon"; title: string; at: number; url: string; id: string }
  | { kind: "reminder_soon"; title: string; at: number; url: string; id: string }
  | { kind: "journey"; title: string; since: number; paused: boolean; url: string; id: string };

/**
 * O que a ilha mostra agora (prioridade): compromisso acontecendo → compromisso em até 60 min →
 * lembrete em até 30 min → jornada de trabalho rodando. Nada disso = ilha some.
 * `since` da jornada já desconta as pausas (o cronômetro do celular conta a partir dele).
 */
export function liveActivity(o: { now: number; items: AgendaItem[]; reminders: { id: string; text: string; remindAt: Date }[]; journey: { id: string; startedAt: Date; pausedSeconds: number; pauseStartedAt: Date | null } | null }): Live | null {
  const ev = o.items.filter((i) => !i.done && i.source !== "followup").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const now = ev.find((i) => i.startsAt.getTime() <= o.now && o.now < i.startsAt.getTime() + i.durationMin * MIN);
  if (now) return { kind: "event_now", title: now.title, since: now.startsAt.getTime(), until: now.startsAt.getTime() + now.durationMin * MIN, url: now.url, id: now.id };
  const soon = ev.find((i) => i.startsAt.getTime() > o.now && i.startsAt.getTime() - o.now <= 60 * MIN);
  if (soon) return { kind: "event_soon", title: soon.title, at: soon.startsAt.getTime(), url: soon.url, id: soon.id };
  const r = [...o.reminders].sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime()).find((x) => x.remindAt.getTime() > o.now && x.remindAt.getTime() - o.now <= 30 * MIN);
  if (r) return { kind: "reminder_soon", title: r.text, at: r.remindAt.getTime(), url: "/crm/lembretes", id: r.id };
  if (o.journey) {
    const pausing = o.journey.pauseStartedAt ? o.now - o.journey.pauseStartedAt.getTime() : 0;
    return { kind: "journey", title: o.journey.pauseStartedAt ? "Jornada em pausa" : "Jornada de trabalho", since: o.journey.startedAt.getTime() + o.journey.pausedSeconds * 1000 + pausing, paused: !!o.journey.pauseStartedAt, url: "/crm", id: o.journey.id };
  }
  return null;
}

/** "12:05" (mm:ss) ou "1:02:05" — contagem da ilha. */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}

/** Texto curto para a ilha recolhida e para a notificação em andamento do Android. */
export function liveShort(l: Live, now: number) {
  if (l.kind === "event_now") return `Agora · termina em ${clock(l.until - now)}`;
  if (l.kind === "event_soon") return `Em ${clock(l.at - now)}`;
  if (l.kind === "reminder_soon") return `Lembrete em ${clock(l.at - now)}`;
  return l.paused ? "Pausada" : clock(now - l.since);
}

export { brDayInput, brTimeInput };
