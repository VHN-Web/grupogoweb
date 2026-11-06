import { describe, expect, it } from "vitest";
import { changeDuePyg, formatMinor, formatPyg, minorToPyg, parseMajorToMinor, pygToMinor } from "./money";
import { quoteDelivery, roundFee } from "./delivery";
import { randomOrderNumber, randomTableCode, slugify } from "./codes";
import { parsePaymentConfig, publicPaymentConfig, DEFAULT_PAYMENT_CONFIG } from "./tenant-config";
import { haversineKm } from "@/adapters/distance";
import { ivaIncluded } from "@/adapters/fiscal/FiscalProvider";

const rates = { USD: 7300, BRL: 1300 };

describe("money", () => {
  it("converte PYG para USD arredondando para cima", () => {
    expect(pygToMinor(73000, "USD", rates)).toBe(1000); // US$ 10.00 exato
    expect(pygToMinor(73001, "USD", rates)).toBe(1001); // nunca recebe menos
    expect(pygToMinor(35000, "BRL", rates)).toBe(2693); // 26.923 -> R$ 26,93
    expect(pygToMinor(35000, "PYG", rates)).toBe(35000);
  });
  it("converte moeda menor para PYG", () => {
    expect(minorToPyg(1000, "USD", rates)).toBe(73000);
    expect(minorToPyg(5000, "BRL", rates)).toBe(65000);
  });
  it("calcula troco em guaraníes", () => {
    expect(changeDuePyg(52000, 1000, "USD", rates)).toBe(21000); // paga US$10
    expect(changeDuePyg(52000, 50000, "PYG", rates)).toBe(0);
    expect(changeDuePyg(35000, 100000, "PYG", rates)).toBe(65000);
  });
  it("formata", () => {
    expect(formatPyg(1250000)).toBe("Gs. 1.250.000");
    expect(formatMinor(1001, "USD")).toBe("US$ 10,01");
  });
  it("faz parse de valores digitados", () => {
    expect(parseMajorToMinor("100.000", "PYG")).toBe(100000);
    expect(parseMajorToMinor("20,50", "USD")).toBe(2050);
    expect(parseMajorToMinor("abc", "USD")).toBeNull();
  });
});

describe("delivery", () => {
  const rules = { baseFeePyg: 5000, perKmPyg: 2000, maxKm: 8, freeOverPyg: 200000 };
  it("calcula taxa por km arredondada a Gs. 500", () => {
    const q = quoteDelivery(3.24, 50000, rules);
    expect(q).toEqual({ ok: true, feePyg: 11500, distanceKm: 3.2, free: false });
  });
  it("delivery grátis acima do valor mínimo", () => {
    expect(quoteDelivery(3, 250000, rules)).toMatchObject({ ok: true, feePyg: 0, free: true });
  });
  it("bloqueia fora do raio", () => {
    expect(quoteDelivery(12, 50000, rules)).toMatchObject({ ok: false, reason: "OUT_OF_RANGE" });
    expect(quoteDelivery(null, 50000, rules)).toMatchObject({ ok: false, reason: "NO_LOCATION" });
  });
  it("roundFee", () => {
    expect(roundFee(10001)).toBe(10500);
    expect(roundFee(10000)).toBe(10000);
  });
  it("haversine aproximado", () => {
    // CDE centro -> Puente de la Amistad ~ 2,5 km
    const d = haversineKm({ lat: -25.5097, lng: -54.6111 }, { lat: -25.5094, lng: -54.5886 });
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(3);
  });
});

describe("codes", () => {
  it("número do pedido tem 4 dígitos", () => {
    for (let i = 0; i < 200; i++) expect(randomOrderNumber()).toMatch(/^[1-9]\d{3}$/);
  });
  it("código da mesa sem caracteres ambíguos", () => {
    for (let i = 0; i < 200; i++) expect(randomTableCode()).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  });
  it("slugify", () => {
    expect(slugify("La Esquiña Café & Bar!")).toBe("la-esquina-cafe-bar");
  });
});

describe("tenant config", () => {
  it("usa padrão para JSON inválido ou vazio", () => {
    expect(parsePaymentConfig("lixo").options).toEqual(DEFAULT_PAYMENT_CONFIG.options);
    expect(parsePaymentConfig("{}").options.length).toBeGreaterThan(0);
  });
  it("não vaza credenciais para o navegador", () => {
    const cfg = parsePaymentConfig(JSON.stringify({ ...DEFAULT_PAYMENT_CONFIG, credentials: { bancard: { privateKey: "x" } } }));
    expect(JSON.stringify(publicPaymentConfig(cfg))).not.toContain("privateKey");
  });
});

describe("fiscal", () => {
  it("IVA incluído", () => {
    expect(ivaIncluded(110000, 10)).toBe(10000);
    expect(ivaIncluded(105000, 5)).toBe(5000);
  });
});
