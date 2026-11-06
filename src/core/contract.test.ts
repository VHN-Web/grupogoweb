import { describe, expect, it } from "vitest";
import { buildContract, contractNumber, type ContractData } from "./contract";

const base: ContractData = {
  number: "GW-2026-000001",
  locale: "pt",
  contractor: { brand: "GoWeb", legalName: "Fulano de Tal", doc: "000.000.000-00", email: "suporte@goweboficial.com" },
  client: { businessName: "Pizzaria X", contactName: "Maria", email: "m@x.com" },
  plan: { name: "Mensal", interval: "MONTHLY", features: ["Cardápio QR"], intelligence: false },
  currency: "BRL",
  setupMinor: 35000,
  domainMinor: 0,
  recurringMinor: 17900,
  graceDays: 7,
  implementationDays: 10,
  retentionMonths: 12,
  acceptedAt: new Date("2026-11-06T12:00:00Z"),
  acceptedIp: "1.2.3.4",
};

describe("contrato", () => {
  it("traz valores, arrependimento (CDC art. 49) e implantação não reembolsável em destaque", () => {
    const { body } = buildContract(base);
    expect(body).toContain("R$ 350,00");
    expect(body).toContain("R$ 179,00");
    expect(body).toContain("art. 49 do CDC");
    expect(body).toMatch(/\*\*O CONTRATANTE declara estar ciente[^*]+não será reembolsado/);
    expect(body).toContain("IP 1.2.3.4");
    expect(body).toContain("Fulano de Tal");
  });
  it("numera as cláusulas de preço sem pular números", () => {
    const { body } = buildContract(base);
    expect(body).toMatch(/3\.1\. Taxa de implantação[\s\S]*3\.2\. Mensalidade/);
    const withDomain = buildContract({ ...base, domainMinor: 9900 }).body;
    expect(withDomain).toMatch(/3\.2\. Domínio próprio[\s\S]*3\.3\. Mensalidade/);
  });
  it("versão em espanhol para o Paraguai", () => {
    const { body } = buildContract({ ...base, locale: "es", currency: "PYG", setupMinor: 500000, recurringMinor: 250000 });
    expect(body).toContain("Ley 1334/98");
    expect(body).toContain("Gs. 500.000");
  });
  it("número legível", () => {
    expect(contractNumber(42, 2026)).toBe("GW-2026-000042");
  });
});
