import { describe, expect, it } from "vitest";
import {
  DEFAULT_AFFILIATE_CONFIG as D,
  commission,
  isValidCpf,
  missions,
  normalizeAffCode,
  normalizePixKey,
  parseAffiliateConfig,
  pixPayload,
  shortName,
  tierFor,
  xp,
} from "./affiliates";

describe("afiliados — níveis e comissão", () => {
  it("nível por vendas pagas", () => {
    expect(tierFor(0, D).tier.name).toBe("Bronze");
    expect(tierFor(4, D).tier.name).toBe("Bronze");
    expect(tierFor(5, D).tier.name).toBe("Prata");
    expect(tierFor(15, D).tier.pctBp).toBe(2000);
    expect(tierFor(99, D).tier.name).toBe("Diamante");
    expect(tierFor(99, D).next).toBeNull();
    const t = tierFor(3, D);
    expect(t.toNext).toBe(2);
    expect(t.progress).toBeCloseTo(0.6);
  });
  it("comissão arredonda para baixo", () => {
    expect(commission(99700, 1500)).toBe(14955);
    expect(commission(99999, 300)).toBe(2999);
    expect(commission(-10, 1500)).toBe(0);
  });
  it("config inválida volta ao padrão e mantém ordem", () => {
    expect(parseAffiliateConfig("lixo")).toEqual(D);
    const c = parseAffiliateConfig(JSON.stringify({ tiers: [{}, { minSales: 3, pctBp: 1800 }, { minSales: 2 }], referrerPctBp: 99999 }));
    expect(c.tiers[1].pctBp).toBe(1800);
    expect(c.tiers[2].minSales).toBe(4);
    expect(c.referrerPctBp).toBe(300);
  });
});

describe("afiliados — dados", () => {
  it("CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });
  it("chave Pix", () => {
    expect(normalizePixKey("phone", "(81) 99999-1234")).toBe("+5581999991234");
    expect(normalizePixKey("email", "A@B.com ")).toBe("a@b.com");
    expect(normalizePixKey("cpf", "52998224725")).toBe("52998224725");
    expect(normalizePixKey("cpf", "123")).toBeNull();
    expect(normalizePixKey("random", "nope")).toBeNull();
  });
  it("código e nome curto", () => {
    expect(normalizeAffCode("joão-123!")).toBe("JOAO123");
    expect(shortName("João Silva Santos")).toBe("João S.");
    expect(shortName("Ana")).toBe("Ana");
  });
  it("Pix copia e cola com CRC válido", () => {
    const p = pixPayload({ key: "a@b.com", name: "João Silva", city: "Recife", amountMinor: 14955, txid: "COM-1" });
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("br.gov.bcb.pix");
    expect(p).toContain("5406149.55");
    expect(p).toContain("5910JOAO SILVA");
    // CRC conhecido do exemplo oficial do BC
    const bc = pixPayload({ key: "123e4567-e12b-12d1-a456-426655440000", name: "Fulano de Tal", city: "BRASILIA", amountMinor: 100, txid: "***" });
    expect(bc).toMatch(/6304[0-9A-F]{4}$/);
  });
  it("gamificação", () => {
    expect(xp({ sales: 2, scheduled: 3, leads: 4 })).toBe(265);
    const m = missions({ clicks7d: 25, leads7d: 1, scheduled7d: 0, salesMonth: 0, salesTotal: 0, recruits: 0, weeksWithSale: 0 });
    expect(m[0].done).toBe(true);
    expect(m[1].pct).toBeCloseTo(0.2);
  });
});
