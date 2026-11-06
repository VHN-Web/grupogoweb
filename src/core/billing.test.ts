import { describe, expect, it } from "vitest";
import { addInterval, chargesDomain, dunningState, setupAmounts, shouldInvoice, amountIn } from "./billing";
import { verifyMercadoPagoSignature } from "@/adapters/billing/mercadopago";
import { createHmac } from "node:crypto";

const monthly = {
  interval: "MONTHLY" as const,
  pricePyg: 250000,
  priceUsdMinor: 3500,
  priceBrlMinor: 17900,
  setupPyg: 500000,
  setupUsdMinor: 7000,
  setupBrlMinor: 35000,
  includesDomain: false,
};
const yearly = { ...monthly, interval: "YEARLY" as const, includesDomain: true };
const dom = { domainPricePyg: 150000, domainPriceUsdMinor: 2000, domainPriceBrlMinor: 9900 };

describe("planos e implantação", () => {
  it("mensal com domínio cobra o domínio na implantação", () => {
    expect(setupAmounts(monthly, true, dom)).toEqual({ PYG: 650000, USD: 9000, BRL: 44900 });
  });
  it("anual inclui o domínio grátis", () => {
    expect(chargesDomain(yearly, true)).toBe(false);
    expect(setupAmounts(yearly, true, dom)).toEqual({ PYG: 500000, USD: 7000, BRL: 35000 });
  });
  it("sem domínio, só implantação", () => {
    expect(setupAmounts(monthly, false, dom).PYG).toBe(500000);
  });
  it("valor por moeda", () => {
    expect(amountIn({ amountPyg: 1, amountUsdMinor: 2, amountBrlMinor: 3 }, "BRL")).toBe(3);
  });
});

describe("datas de cobrança", () => {
  it("soma mês preservando fim de mês", () => {
    expect(addInterval(new Date("2026-01-31T12:00:00Z"), "MONTHLY").toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addInterval(new Date("2026-11-05T12:00:00Z"), "MONTHLY").toISOString().slice(0, 10)).toBe("2026-12-05");
    expect(addInterval(new Date("2026-11-05T12:00:00Z"), "YEARLY").toISOString().slice(0, 10)).toBe("2027-11-05");
  });
  it("gera a fatura X dias antes do vencimento", () => {
    const due = new Date("2026-12-05T12:00:00Z");
    expect(shouldInvoice(due, new Date("2026-11-29T12:00:00Z"), 5)).toBe(false);
    expect(shouldInvoice(due, new Date("2026-11-30T12:00:00Z"), 5)).toBe(true);
  });
  it("atraso e suspensão", () => {
    const due = new Date("2026-12-05T12:00:00Z");
    expect(dunningState(due, new Date("2026-12-04T12:00:00Z"), 7)).toBe("OK");
    expect(dunningState(due, new Date("2026-12-08T12:00:00Z"), 7)).toBe("PAST_DUE");
    expect(dunningState(due, new Date("2026-12-12T12:00:00Z"), 7)).toBe("SUSPEND");
    expect(dunningState(null, new Date(), 7)).toBe("OK");
  });
});

describe("Mercado Pago", () => {
  it("valida x-signature", () => {
    const secret = "s3cr3t";
    const manifest = "id:123;request-id:abc;ts:1704908010;";
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    expect(verifyMercadoPagoSignature({ xSignature: `ts=1704908010,v1=${v1}`, xRequestId: "abc", dataId: "123", secret })).toBe(true);
    expect(verifyMercadoPagoSignature({ xSignature: `ts=1704908010,v1=${v1}`, xRequestId: "abc", dataId: "999", secret })).toBe(false);
    expect(verifyMercadoPagoSignature({ xSignature: null, xRequestId: "abc", dataId: "123", secret })).toBe(false);
  });
});
