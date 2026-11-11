import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFY, inQuietHours, parseNotifyPrefs, shouldPush } from "./crm-notify";

// 2026-11-11T01:30Z = 22:30 em Brasília; T13:00Z = 10:00
const NIGHT = new Date("2026-11-11T01:30:00Z");
const DAY = new Date("2026-11-11T13:00:00Z");

describe("notificações do CRM", () => {
  it("lê preferências com segurança", () => {
    expect(parseNotifyPrefs(null)).toEqual(DEFAULT_NOTIFY);
    expect(parseNotifyPrefs("lixo")).toEqual(DEFAULT_NOTIFY);
    expect(parseNotifyPrefs(JSON.stringify({ off: ["leads", "x", "leads"], quietFrom: "22:00", quietTo: "07:00", urgentInQuiet: false }))).toEqual({
      off: ["leads"], quietFrom: "22:00", quietTo: "07:00", urgentInQuiet: false,
    });
    // só um dos horários = sem silêncio
    expect(parseNotifyPrefs(JSON.stringify({ quietFrom: "22:00" })).quietFrom).toBeNull();
  });
  it("silêncio atravessando a meia-noite", () => {
    const p = parseNotifyPrefs(JSON.stringify({ quietFrom: "22:00", quietTo: "07:00" }));
    expect(inQuietHours(p, NIGHT)).toBe(true);
    expect(inQuietHours(p, DAY)).toBe(false);
  });
  it("categoria desligada e urgentes no silêncio", () => {
    const p = parseNotifyPrefs(JSON.stringify({ off: ["acessos"], quietFrom: "22:00", quietTo: "07:00" }));
    expect(shouldPush(p, "acessos", DAY)).toBe(false);
    expect(shouldPush(p, "leads", DAY)).toBe(true);
    expect(shouldPush(p, "leads", NIGHT)).toBe(false);
    expect(shouldPush(p, "vendas", NIGHT)).toBe(true);
    expect(shouldPush({ ...p, urgentInQuiet: false }, "suporte", NIGHT)).toBe(false);
    expect(shouldPush(DEFAULT_NOTIFY, null, NIGHT)).toBe(true);
  });
});
