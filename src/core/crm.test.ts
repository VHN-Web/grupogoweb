import { describe, expect, it } from "vitest";
import {
  brDateTime,
  brDayStart,
  buildScript,
  cleanInstagram,
  csvToRecords,
  dedupeKey,
  detectLink,
  journeySeconds,
  huntPlan,
  nextHuntTargets,
  nicheOf,
  normalizeBrPhone,
  parseCrmConfig,
  scoreLead,
  statusFromText,
  toCsv,
} from "./crm";

describe("crm — detector e score", () => {
  it("detecta concorrente, iFood, manual e site próprio", () => {
    expect(detectLink("https://pedido.anota.ai/loja/x").kind).toBe("competitor");
    expect(detectLink("https://www.ifood.com.br/delivery/x").kind).toBe("ifood");
    expect(detectLink("https://wa.me/5583999").kind).toBe("manual");
    expect(detectLink("linktr.ee/loja").kind).toBe("manual");
    expect(detectLink("https://minhapizzaria.com.br").kind).toBe("own_site");
    expect(detectLink("").kind).toBe("none");
  });
  it("score", () => {
    expect(scoreLead({ website: "wa.me/1", reviews: 120, phone: "+5581", instagram: "x" }).score).toBe("OURO");
    expect(scoreLead({ website: "https://goomer.app/x", reviews: 200 }).score).toBe("DESQ");
    expect(scoreLead({ website: "https://site.com", reviews: 10, phone: "+55" }).score).toBe("BRONZE");
    expect(scoreLead({ website: null, reviews: 10, phone: "+55" }).score).toBe("PRATA");
  });
});

describe("crm — dados", () => {
  it("telefone e instagram", () => {
    expect(normalizeBrPhone("83991903829")).toBe("+5583991903829");
    expect(normalizeBrPhone("+55 (83) 3231-3098")).toBe("+558332313098");
    expect(normalizeBrPhone("123")).toBeNull();
    expect(cleanInstagram("https://instagram.com/Loja.X/")).toBe("loja.x");
    expect(cleanInstagram("@abc")).toBe("abc");
  });
  it("chave de duplicidade", () => {
    expect(dedupeKey({ phone: "+5583", name: "A" })).toBe("tel:+5583");
    expect(dedupeKey({ name: "Açaí da Hora", city: "João Pessoa - PB" })).toBe("nm:acaidahora:joaopessoapb");
  });
  it("status da planilha", () => {
    expect(statusFromText("Demonstração Agendada")).toBe("DEMO");
    expect(statusFromText("Novo Lead")).toBe("NEW");
  });
  it("CSV ida e volta", () => {
    const csv = toCsv([["Nome", "Telefone"], ['Bar "do Zé"', "83 9999-0000"]]);
    const r = csvToRecords(csv);
    expect(r[0].name).toBe('Bar "do Zé"');
    expect(r[0].phone).toBe("83 9999-0000");
  });
});

describe("crm — config, datas e scripts", () => {
  it("config com padrões e limites", () => {
    const c = parseCrmConfig(JSON.stringify({ perRun: 999, cities: ["Recife - PE", " "], categories: ["Hamburgueria", "Pizzaria", "Açaiteria", "Lanchonete", "Marmitaria", "Barbearia", "Pet shop", "Confeitaria"] }));
    expect(c.perRun).toBe(20);
    expect(c.priorityCities).toEqual(["Recife - PE"]); // migração da versão antiga
    expect(c.categories.length).toBeGreaterThan(60); // virou "todas"
    expect(c.ufs.length).toBe(27);
    expect(parseCrmConfig("x").goals.contacts).toBe(30);
  });
  it("fila da busca: cidade por cidade, todos os grupos de categorias", () => {
    const cfg = { priorityCities: ["Abreu e Lima - PE"], ufs: ["PE"], allCities: false, categories: ["a", "b", "c"], groupSize: 2, cursor: 1 };
    const a = nextHuntTargets(cfg, 2);
    expect(a.targets[0]).toEqual({ city: "Abreu e Lima - PE", categories: ["c"] });
    expect(a.targets[1]).toEqual({ city: "Recife - PE", categories: ["a", "b"] });
    expect(huntPlan({ ...cfg, ufs: ["PE", "PB"], allCities: true }).cities.length).toBe(185 + 223);
  });
  it("dia em Brasília", () => {
    const d = brDayStart(new Date("2026-11-08T02:00:00Z")); // 23h do dia 7 em Brasília
    expect(d.toISOString()).toBe("2026-11-07T03:00:00.000Z");
    expect(brDateTime("2026-11-08", "14:30")!.toISOString()).toBe("2026-11-08T17:30:00.000Z");
  });
  it("jornada desconta pausas", () => {
    const s = journeySeconds({ startedAt: new Date(0), endedAt: new Date(3600_000), pauseStartedAt: null, pausedSeconds: 600 });
    expect(s).toBe(3000);
  });
  it("nicho e script", () => {
    expect(nicheOf("Barbearia")).toBe("beauty");
    expect(nicheOf("Hamburgueria & Lanchonete")).toBe("food");
    const t = buildScript("whatsapp", { name: "Duju", neighborhood: "Mangabeira", category: "Pastelaria", pain: "Atendimento manual." }, "Lázaro Cruz");
    expect(t).toContain("Lázaro");
    expect(t).toContain("Mangabeira");
    expect(t).toContain("atendimento manual");
  });
});
