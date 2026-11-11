import { describe, expect, it } from "vitest";
import { brDayKey, deltaPct, deviceOf, isBot, lastDays, visitArea, visitSeries, visitSource } from "./visits";

describe("acessos: áreas", () => {
  it("site oficial", () => {
    for (const p of ["/", "/planos", "/contratar?plano=x", "/shopping/recife", "/vitrine", "/escaneou/P-12"]) expect(visitArea(p)).toBe("site");
  });
  it("página de afiliados e links", () => {
    expect(visitArea("/afiliados")).toBe("afiliados");
    expect(visitArea("/afiliados/cadastro")).toBe("afiliados");
    expect(visitArea("/afiliados/ganhos")).toBeNull(); // área logada não conta
    expect(visitArea("/a/LAZARO10")).toBe("link");
    expect(visitArea("/a/LAZARO10/demo")).toBe("link");
  });
  it("o resto não conta", () => {
    for (const p of ["/crm", "/admin", "/painel/loja", "/entregador", "/burguer", "/api/x"]) expect(visitArea(p)).toBeNull();
  });
});

describe("acessos: visitante", () => {
  it("robôs e prévias de link não contam", () => {
    expect(isBot("WhatsApp/2.23.20.0 A")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")).toBe(false);
  });
  it("aparelho", () => {
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")).toBe("celular");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("computador");
  });
  it("origem", () => {
    expect(visitSource({ origem: "instagram" })).toBe("Instagram");
    expect(visitSource({ utm: "panfleto-recife" })).toBe("panfleto-recife");
    expect(visitSource({ referrer: "https://l.instagram.com/?u=x" })).toBe("Instagram");
    expect(visitSource({ referrer: "https://www.google.com/" })).toBe("Google");
    expect(visitSource({ referrer: "https://goweboficial.com/planos", ownHost: "goweboficial.com" })).toBe("Direto");
    expect(visitSource({})).toBe("Direto");
  });
});

describe("acessos: datas e séries", () => {
  it("dia em Brasília", () => {
    expect(brDayKey(new Date("2026-11-11T02:30:00Z"))).toBe("2026-11-10"); // 23:30 em Brasília
    expect(brDayKey(new Date("2026-11-11T03:00:00Z"))).toBe("2026-11-11");
  });
  it("últimos dias e série com zeros", () => {
    const days = lastDays(3, new Date("2026-11-11T15:00:00Z"));
    expect(days).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    const s = visitSeries([{ day: "2026-11-10", area: "site", visitors: 5, views: 9 }], days);
    expect(s.site.visitors).toEqual([0, 5, 0]);
    expect(s.site.totalViews).toBe(9);
    expect(s.afiliados.totalVisitors).toBe(0);
  });
  it("variação", () => {
    expect(deltaPct(15, 10)).toBe(50);
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBe(0);
  });
});
