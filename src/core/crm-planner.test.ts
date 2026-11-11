import { describe, expect, it } from "vitest";
import { clock, dayLabel, eventReminderDue, groupByDay, liveActivity, liveShort, nextOccurrence, noteProgress, parseNote, quickWhen, toggleCheck, weekStrip, type AgendaItem } from "./crm-planner";

const at = (s: string) => new Date(s);
const item = (o: Partial<AgendaItem>): AgendaItem => ({ id: "e1", source: "event", kind: "meeting", title: "Reunião", startsAt: at("2026-11-20T13:00:00Z"), durationMin: 30, leadId: null, url: "/crm/agenda", shared: false, done: false, location: null, ...o });

describe("agenda", () => {
  it("agrupa por dia de Brasília", () => {
    const g = groupByDay([item({ id: "b", startsAt: at("2026-11-21T02:00:00Z") }), item({ id: "a", startsAt: at("2026-11-20T13:00:00Z") })]);
    expect(g.map((x) => x.day)).toEqual(["2026-11-20"]); // 23h de Brasília ainda é dia 20
    expect(g[0].items.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("rótulos de dia", () => {
    const now = at("2026-11-20T15:00:00Z");
    expect(dayLabel("2026-11-20", now)).toBe("Hoje");
    expect(dayLabel("2026-11-21", now)).toBe("Amanhã");
    expect(dayLabel("2026-11-25", now)).toBe("qua, 25 nov");
    expect(weekStrip(now)[0]).toEqual({ day: "2026-11-20", wd: "sex", n: 20 });
    expect(weekStrip(now)).toHaveLength(7);
  });
  it("aviso do compromisso: uma vez, dentro da janela", () => {
    const e = { startsAt: at("2026-11-20T13:00:00Z"), durationMin: 30, remindMin: 15, remindedAt: null, doneAt: null };
    expect(eventReminderDue(e, at("2026-11-20T12:40:00Z").getTime())).toBe(false);
    expect(eventReminderDue(e, at("2026-11-20T12:46:00Z").getTime())).toBe(true);
    expect(eventReminderDue({ ...e, remindedAt: new Date() }, at("2026-11-20T12:46:00Z").getTime())).toBe(false);
    expect(eventReminderDue(e, at("2026-11-20T13:31:00Z").getTime())).toBe(false);
    expect(eventReminderDue({ ...e, remindMin: null }, at("2026-11-20T12:59:00Z").getTime())).toBe(false);
  });
});

describe("lembretes", () => {
  const base = at("2026-11-20T12:00:00Z"); // sexta 9h em Brasília
  it("repetições", () => {
    expect(nextOccurrence(base, "none", base.getTime())).toBeNull();
    expect(nextOccurrence(base, "daily", base.getTime())?.toISOString()).toBe("2026-11-21T12:00:00.000Z");
    expect(nextOccurrence(base, "weekdays", base.getTime())?.toISOString()).toBe("2026-11-23T12:00:00.000Z"); // pula o fim de semana
    expect(nextOccurrence(base, "weekly", base.getTime())?.toISOString()).toBe("2026-11-27T12:00:00.000Z");
    expect(nextOccurrence(at("2026-01-31T12:00:00Z"), "monthly", at("2026-01-31T12:00:00Z").getTime())?.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(nextOccurrence(base, "daily", at("2026-11-25T13:00:00Z").getTime())?.toISOString()).toBe("2026-11-26T12:00:00.000Z");
  });
  it("atalhos", () => {
    const now = at("2026-11-20T15:00:00Z"); // sexta 12h
    expect(quickWhen("15m", now)?.toISOString()).toBe("2026-11-20T15:15:00.000Z");
    expect(quickWhen("tomorrow9", now)?.toISOString()).toBe("2026-11-21T12:00:00.000Z");
    expect(quickWhen("tonight", now)?.toISOString()).toBe("2026-11-20T22:00:00.000Z");
    expect(quickWhen("monday9", now)?.toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(quickWhen("x", now)).toBeNull();
  });
});

describe("notas", () => {
  const body = "Ligar amanhã\n- [ ] proposta\n- [x] demo\ntexto";
  it("checklist", () => {
    const l = parseNote(body);
    expect(l[1]).toEqual({ kind: "check", text: "proposta", done: false, index: 1 });
    expect(l[2]).toMatchObject({ kind: "check", done: true });
    expect(noteProgress(body)).toEqual({ total: 2, done: 1 });
    expect(toggleCheck(body, 1)).toBe("Ligar amanhã\n- [x] proposta\n- [x] demo\ntexto");
    expect(toggleCheck(body, 2)).toBe("Ligar amanhã\n- [ ] proposta\n- [ ] demo\ntexto");
    expect(toggleCheck(body, 9)).toBe(body);
  });
});

describe("ilha ao vivo", () => {
  const now = at("2026-11-20T12:50:00Z").getTime();
  it("prioridades", () => {
    const soon = item({ id: "s", startsAt: at("2026-11-20T13:00:00Z") });
    const running = item({ id: "r", startsAt: at("2026-11-20T12:30:00Z"), durationMin: 60 });
    expect(liveActivity({ now, items: [soon, running], reminders: [], journey: null })?.kind).toBe("event_now");
    expect(liveActivity({ now, items: [soon], reminders: [], journey: null })).toMatchObject({ kind: "event_soon", id: "s" });
    expect(liveActivity({ now, items: [], reminders: [{ id: "x", text: "Pix", remindAt: at("2026-11-20T13:10:00Z") }], journey: null })?.kind).toBe("reminder_soon");
    expect(liveActivity({ now, items: [item({ startsAt: at("2026-11-20T15:00:00Z") })], reminders: [], journey: null })).toBeNull();
    const j = liveActivity({ now, items: [], reminders: [], journey: { id: "j", startedAt: at("2026-11-20T12:00:00Z"), pausedSeconds: 600, pauseStartedAt: null } });
    expect(j).toMatchObject({ kind: "journey", since: at("2026-11-20T12:10:00Z").getTime() });
    expect(liveShort(j!, now)).toBe("40:00");
  });
  it("relógio", () => {
    expect(clock(65_000)).toBe("1:05");
    expect(clock(3_725_000)).toBe("1:02:05");
  });
});
