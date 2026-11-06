import { describe, expect, it } from "vitest";
import { buildSuggestions, checkCoupon, effectivePrice, freeSlots, localToUtc, DEFAULT_BOOKING, normalizeCode } from "./intelligence";

describe("oferta relâmpago", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  it("usa o preço promocional só enquanto vale", () => {
    expect(effectivePrice({ pricePyg: 3000, promoPricePyg: 2000, promoEndsAt: new Date("2026-11-06T13:00:00Z") }, now)).toBe(2000);
    expect(effectivePrice({ pricePyg: 3000, promoPricePyg: 2000, promoEndsAt: new Date("2026-11-06T11:00:00Z") }, now)).toBe(3000);
    expect(effectivePrice({ pricePyg: 3000, promoPricePyg: 3500, promoEndsAt: new Date("2026-11-07T00:00:00Z") }, now)).toBe(3000);
  });
});

describe("cupons", () => {
  const base = { code: "VOLTA10", kind: "PERCENT" as const, value: 10, minSubtotal: 0, maxUses: null, uses: 0, expiresAt: null, active: true };
  it("calcula percentual e valor fixo sem passar do subtotal", () => {
    expect(checkCoupon(base, 5000)).toEqual({ ok: true, discount: 500 });
    expect(checkCoupon({ ...base, kind: "FIXED", value: 9000 }, 5000)).toEqual({ ok: true, discount: 5000 });
  });
  it("respeita mínimo, validade e limite de usos", () => {
    expect(checkCoupon({ ...base, minSubtotal: 6000 }, 5000)).toEqual({ ok: false, reason: "MIN_SUBTOTAL" });
    expect(checkCoupon({ ...base, expiresAt: new Date(Date.now() - 1000) }, 5000)).toEqual({ ok: false, reason: "EXPIRED" });
    expect(checkCoupon({ ...base, maxUses: 1, uses: 1 }, 5000)).toEqual({ ok: false, reason: "EXHAUSTED" });
  });
  it("normaliza o código", () => expect(normalizeCode(" volta 10! ")).toBe("VOLTA10"));
});

describe("sugestões", () => {
  const P = [
    { id: "burger", categoryId: "b", categoryName: "Hambúrgueres", available: true, service: false },
    { id: "burger2", categoryId: "b", categoryName: "Hambúrgueres", available: true, service: false },
    { id: "fries", categoryId: "p", categoryName: "Porções", available: true, service: false },
    { id: "soda", categoryId: "d", categoryName: "Bebidas", available: true, service: false },
    { id: "cake", categoryId: "s", categoryName: "Sobremesas", available: true, service: false },
  ];
  it("prioriza o que foi comprado junto e nunca sugere a mesma categoria", () => {
    const s = buildSuggestions(P, [["burger", "cake"], ["burger", "cake"], ["burger", "fries"]]);
    expect(s.burger[0]).toBe("cake");
    expect(s.burger).not.toContain("burger2");
    expect(s.burger.length).toBe(3);
  });
  it("sem histórico usa categorias complementares", () => {
    const s = buildSuggestions(P, []);
    expect(s.burger).toEqual(expect.arrayContaining(["fries", "soda"]));
  });
});

describe("agenda", () => {
  const tz = "America/Sao_Paulo";
  it("converte horário local para UTC", () => {
    expect(localToUtc("2026-11-09", 9 * 60, tz).toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });
  it("lista horários livres sem conflito", () => {
    const cfg = { ...DEFAULT_BOOKING, enabled: true, leadMin: 0 };
    const busy = [{ startsAt: localToUtc("2026-11-09", 10 * 60, tz), durationMin: 60 }];
    const slots = freeSlots(cfg, "2026-11-09", 30, busy, tz, new Date("2026-11-01T00:00:00Z")).map((s) => s.label);
    expect(slots[0]).toBe("09:00");
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("11:00");
    expect(freeSlots(cfg, "2026-11-08", 30, [], tz, new Date("2026-11-01T00:00:00Z"))).toEqual([]); // domingo fechado
  });
});
