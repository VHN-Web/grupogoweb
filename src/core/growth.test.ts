import { describe, expect, it } from "vitest";
import { addStamp, cashbackValue, citySlug, featureOn, fillTemplate, inSegment, normalizeRef, normalizeSource, parseBirthday, parseGrowth } from "./growth";

describe("crescimento", () => {
  it("lê a configuração com valores seguros", () => {
    const c = parseGrowth(JSON.stringify({ referral: { enabled: true, friendPct: 999 }, reviews: { enabled: true, googleUrl: "javascript:alert(1)" } }));
    expect(c.referral.friendPct).toBe(50);
    expect(c.reviews.googleUrl).toBe("");
    expect(parseGrowth("lixo").loyalty.stamps).toBe(10);
  });
  it("respeita o plano", () => {
    const c = parseGrowth(JSON.stringify({ referral: { enabled: true }, reviews: { enabled: true, googleUrl: "https://g.page/r/x" } }));
    expect(featureOn(c, "referral", false)).toBe(false);
    expect(featureOn(c, "referral", true)).toBe(true);
    expect(featureOn(c, "reviews", false)).toBe(true);
  });
  it("normaliza a origem", () => {
    expect(normalizeSource("IG")).toBe("instagram");
    expect(normalizeSource("zap")).toBe("whatsapp");
    expect(normalizeSource("panfleto")).toBe("panfleto");
    expect(normalizeSource("<script>")).toBe("direto");
    expect(normalizeRef(" ab-12 c ")).toBe("AB12C");
  });
  it("valida aniversário", () => {
    expect(parseBirthday("25/12")).toBe("12-25");
    expect(parseBirthday("31/02")).toBeNull();
    expect(parseBirthday("29/02")).toBe("02-29");
    expect(parseBirthday("1/1")).toBeNull();
  });
  it("cartão fidelidade e cashback", () => {
    expect(addStamp(8, 10)).toEqual({ stamps: 9, reward: false });
    expect(addStamp(9, 10)).toEqual({ stamps: 0, reward: true });
    expect(cashbackValue(4990, 5)).toBe(249);
  });
  it("segmentos", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const old = new Date("2026-09-01T12:00:00Z");
    expect(inSegment({ orders: 1, lastOrderAt: now, birthday: null }, "new", now)).toBe(true);
    expect(inSegment({ orders: 4, lastOrderAt: old, birthday: null }, "away60", now)).toBe(true);
    expect(inSegment({ orders: 4, lastOrderAt: old, birthday: null }, "away90", now)).toBe(false);
    expect(inSegment({ orders: 1, lastOrderAt: old, birthday: "11-20" }, "birthday", now)).toBe(true);
  });
  it("mensagem e cidade", () => {
    expect(fillTemplate("Oi {nome}, use {cupom} na {loja}", { nome: "Ana Lima", cupom: "VOLTA10", loja: "Navalha" })).toBe("Oi Ana, use VOLTA10 na Navalha");
    expect(citySlug("Abreu e Lima")).toBe("abreu-e-lima");
    expect(citySlug("São José dos Campos")).toBe("sao-jose-dos-campos");
  });
});
