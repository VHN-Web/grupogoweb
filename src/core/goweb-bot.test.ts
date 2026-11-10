import { describe, expect, it } from "vitest";
import { buildGwPrompt, flyerFromText, followUpDue, googleCalendarLink, heatScore, parseBrDateTime, parseGwBot, parseGwReply } from "./goweb-bot";

const NOW = new Date("2026-11-10T15:00:00-03:00");

describe("Geovana da GoWeb — marcações", () => {
  it("extrai lead, agenda, suporte e humano e limpa o texto", () => {
    const r = parseGwReply("Perfeito, Zé! Marquei para quinta às 15h. [[LEAD: negocio=Pizzaria do Zé; tipo=Pizzaria; cidade=Recife - PE; dor=27% no iFood]] [[AGENDAR: 2026-11-12 15:00]]", NOW);
    expect(r.text).toBe("Perfeito, Zé! Marquei para quinta às 15h.");
    expect(r.lead).toEqual({ negocio: "Pizzaria do Zé", tipo: "Pizzaria", cidade: "Recife - PE", dor: "27% no iFood" });
    expect(r.schedule?.toISOString()).toBe("2026-11-12T18:00:00.000Z");
    const s = parseGwReply("Vou abrir um chamado. [[SUPORTE: alta | Cardápio fora do ar | Cliente não abre o site]] [[HUMANO]]", NOW);
    expect(s.support).toEqual({ priority: "alta", subject: "Cardápio fora do ar", body: "Cliente não abre o site" });
    expect(s.human).toBe(true);
    expect(s.text).toBe("Vou abrir um chamado.");
  });
  it("ignora data passada, longe demais ou inválida", () => {
    expect(parseBrDateTime("2026-11-01 10:00", NOW)).toBeNull();
    expect(parseBrDateTime("2027-06-01 10:00", NOW)).toBeNull();
    expect(parseBrDateTime("amanhã 10h", NOW)).toBeNull();
    expect(parseGwReply("ok [[AGENDAR: amanhã]] [[OUTRA]]", NOW)).toMatchObject({ text: "ok", schedule: null });
  });
  it("origem do panfleto pelo código", () => {
    expect(flyerFromText("Oi! Escaneei o panfleto (cód. P-nao)")).toBe("nao");
    expect(flyerFromText("vim pelo site cód. P-site")).toBe("site");
    expect(flyerFromText("oi, quanto custa?")).toBeNull();
  });
});

describe("Geovana da GoWeb — vendas", () => {
  it("lead esquentando sobe com preço e contratação, desce com desinteresse", () => {
    expect(heatScore(["oi"])).toBeLessThan(60);
    expect(heatScore(["quanto custa o plano?", "e o valor da implantação?", "como faço para contratar?"])).toBeGreaterThanOrEqual(60);
    expect(heatScore(["quanto custa?", "achei caro demais, não tenho interesse"])).toBeLessThan(30);
  });
  it("retorno automático: só se o cliente parou, no tempo certo e em horário comercial", () => {
    const bot = new Date("2026-11-09T14:00:00-03:00");
    expect(followUpDue(new Date("2026-11-09T13:59:00-03:00"), bot, 0, [24, 72], NOW)).toBe(0); // 25 h depois, 15h
    expect(followUpDue(new Date("2026-11-09T14:30:00-03:00"), bot, 0, [24, 72], NOW)).toBeNull(); // cliente respondeu depois
    expect(followUpDue(null, bot, 1, [24, 72], NOW)).toBeNull(); // 2º só após mais 48 h
    expect(followUpDue(null, bot, 0, [24, 72], new Date("2026-11-10T22:00:00-03:00"))).toBeNull(); // à noite não
    expect(followUpDue(null, bot, 2, [24, 72], NOW)).toBeNull(); // acabou
  });
  it("prompt com planos reais, links e quem fala", () => {
    const p = buildGwPrompt({
      now: NOW,
      plans: [{ name: "Mensal", interval: "MONTHLY", priceMinor: 17900, setupMinor: 25000, features: ["Site próprio"], intelligence: false }],
      custom: null,
      links: { site: "https://goweboficial.com", planos: "P", contratar: "C", personalizado: "X", shopping: "S", afiliados: "A" },
      extra: "",
      hours: "seg a sáb",
      launch: "12/11/2026",
      store: null,
      affiliate: null,
      lead: null,
      flyer: "nao",
      contactName: "Zé",
    });
    expect(p).toContain("R$ 179/mês + implantação R$ 250");
    expect(p).toContain("Panfleto “Não escaneie”");
    expect(p).toContain("12/11/2026");
  });
  it("config com valores seguros", () => {
    const c = parseGwBot(JSON.stringify({ enabled: true, followUpHours: [72, 1, 24], partnerPhones: ["+5581999990000", "lixo"], pauseMinutes: 2 }));
    expect(c.followUpHours).toEqual([24, 72]);
    expect(c.partnerPhones).toEqual(["+5581999990000"]);
    expect(c.pauseMinutes).toBe(120);
  });
  it("link do Google Agenda", () => {
    const u = googleCalendarLink("GoWeb · conversa", new Date("2026-11-12T18:00:00Z"), "x");
    expect(u).toContain("dates=20261112T180000Z%2F20261112T183000Z");
  });
});
