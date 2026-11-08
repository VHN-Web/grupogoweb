import { describe, expect, it } from "vitest";
import { closeCycle, cycleBounds, isValidCnpj, isValidCpfDigits, orderStatusFromEvent, parseAsaasConfig, pixKeyType, splitForSale, toReais } from "./asaas";

describe("Asaas — billing híbrido", () => {
  it("split padrão e trava de teto", () => {
    // mensalidade R$ 200, nada abatido, venda R$ 90 a 5% = R$ 4,50
    expect(splitForSale({ targetMinor: 20000, amortizedMinor: 0, saleMinor: 9000, pct: 5 })).toBe(450);
    // faltam R$ 3: nunca passa disso
    expect(splitForSale({ targetMinor: 20000, amortizedMinor: 19700, saleMinor: 9000, pct: 5 })).toBe(300);
    // já quitou: sem split
    expect(splitForSale({ targetMinor: 20000, amortizedMinor: 20000, saleMinor: 9000, pct: 5 })).toBe(0);
    // vendas pendentes reservam o faltante
    expect(splitForSale({ targetMinor: 20000, amortizedMinor: 19000, reservedMinor: 800, saleMinor: 9000, pct: 5 })).toBe(200);
    // centavos arredondam para baixo
    expect(splitForSale({ targetMinor: 20000, amortizedMinor: 0, saleMinor: 999, pct: 5 })).toBe(49);
    expect(toReais(450)).toBe(4.5);
  });
  it("ciclo de 30 dias + carência e fechamento", () => {
    const b = cycleBounds(new Date("2026-11-01T12:00:00Z"), 7);
    expect(b.endAt.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    expect(b.graceEndAt.toISOString()).toBe("2026-12-08T12:00:00.000Z");
    expect(closeCycle(20000, 20000)).toEqual({ residualMinor: 0, status: "PAID_BY_SPLIT" });
    expect(closeCycle(20000, 13550)).toEqual({ residualMinor: 6450, status: "AWAITING_RESIDUAL" });
  });
  it("eventos, documentos e config", () => {
    expect(orderStatusFromEvent("PAYMENT_RECEIVED")).toBe("PAID");
    expect(orderStatusFromEvent("PAYMENT_CHARGEBACK_REQUESTED")).toBe("REFUNDED");
    expect(orderStatusFromEvent("PAYMENT_CREATED")).toBeNull();
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCpfDigits("529.982.247-25")).toBe(true);
    expect(pixKeyType("contato@loja.com")).toBe("EMAIL");
    expect(pixKeyType("52998224725")).toBe("CPF");
    expect(pixKeyType("+5581999990000")).toBe("PHONE");
    const c = parseAsaasConfig('{"env":"production","defaultSplitPct":80,"graceDays":7,"hybridEnabled":true}');
    expect(c.env).toBe("production");
    expect(c.defaultSplitPct).toBe(5);
    expect(c.hybridEnabled).toBe(true);
  });
});
