import { describe, expect, it } from "vitest";
import { demoBanner, demoSlug, geovanaAbout, nicheOf, parseLinks, parseProfile, pickTemplate, researchPrompt, validColor } from "./store-research";

const IN = { name: "Pizzaria do João", city: "Recife - PE", links: [], country: "BR" as const };

const AI = `Aqui está:
\`\`\`json
{"encontrado":true,"nome":"Pizzaria do João","nicho":"pizzaria","slogan":"A melhor pizza de Boa Viagem","descricao":"Pizzas de forno a lenha. Entrega rápida.","endereco":"Rua X, 10 - Boa Viagem","horario":"Ter a Dom, 18h às 23h","nota":4.8,"avaliacoes":312,"entrega":true,"retirada":true,"consumoLocal":true,"corPrincipal":"#c0392b","destaques":["4,8 no Google","Forno a lenha"],"instagram":"https://instagram.com/pizzariadojoao/","site":"","cardapio":[{"categoria":"Pizzas","nome":"Calabresa","descricao":"molho e calabresa","preco":"R$ 45,90"},{"categoria":"Pizzas","nome":"Margherita","preco":42},{"categoria":"Bebidas","nome":"Coca 2L","preco":14},{"categoria":"Pizzas","nome":"Sem preço"}],"cardapioFonte":"ifood","fontes":[{"titulo":"iFood","url":"https://www.ifood.com.br/x"},{"titulo":"lixo","url":"javascript:alert(1)"}]}
\`\`\``;

describe("demo montada pela Geovana", () => {
  it("links colados pelo vendedor", () => {
    expect(parseLinks("@pizzariadojoao\nhttps://maps.app.goo.gl/abc  pizzariadojoao.com.br javascript:alert(1)")).toEqual([
      "https://instagram.com/pizzariadojoao",
      "https://maps.app.goo.gl/abc",
      "https://pizzariadojoao.com.br/",
    ]);
  });
  it("prompt com nome, cidade, links e regra de não inventar", () => {
    const p = researchPrompt({ ...IN, links: ["https://instagram.com/x"] });
    expect(p).toContain("Pizzaria do João");
    expect(p).toContain("Recife - PE");
    expect(p).toContain("https://instagram.com/x");
    expect(p).toContain("NUNCA invente");
  });
  it("lê o perfil, valida preços e fontes", () => {
    const p = parseProfile(AI, IN, "BRL", [{ title: "Google Maps", url: "https://maps.google.com/x" }])!;
    expect(p.found).toBe(true);
    expect(p.niche).toBe("pizzaria");
    expect(p.color).toBe("#C0392B");
    expect(p.rating).toBe(4.8);
    expect(p.instagram).toBe("pizzariadojoao");
    expect(p.menu.map((m) => [m.name, m.priceMinor])).toEqual([["Calabresa", 4590], ["Margherita", 4200], ["Coca 2L", 1400]]);
    expect(p.menuSource).toBe("ifood");
    expect(p.sources.map((s) => s.url)).toEqual(["https://maps.google.com/x", "https://www.ifood.com.br/x"]);
  });
  it("resposta ruim não quebra", () => {
    expect(parseProfile("não achei nada", IN, "BRL")).toBeNull();
    const p = parseProfile('{"encontrado":false,"nicho":"xyz"}', IN, "BRL")!;
    expect(p.found).toBe(false);
    expect(p.niche).toBe("outro");
    expect(p.name).toBe("Pizzaria do João");
    expect(p.menuSource).toBe("nenhum");
  });
  it("cor, modelo, endereço, banner e texto da atendente", () => {
    expect(validColor("#abc")).toBe("#AABBCC");
    expect(validColor("vermelho")).toBeNull();
    const ts = [{ slug: "demo", theme: "classic", country: "PY" }, { slug: "cantina-da-nonna", theme: "restaurant", country: "BR" }, { slug: "burguer-da-praca", theme: "burger", country: "BR" }];
    expect(pickTemplate(ts, "pizzaria", "BR")?.slug).toBe("cantina-da-nonna");
    expect(pickTemplate(ts, "barbearia", "BR")?.slug).toBe("cantina-da-nonna"); // sem barbearia BR: outro do país
    expect(nicheOf("acaiteria").theme).toBe("cafe");
    expect(demoSlug("Pizzaria do João & Cia")).toBe("pizzaria-do-joao-cia-demo");
    const p = parseProfile(AI, IN, "BRL")!;
    const b = demoBanner(p, true, (m) => `R$ ${(m / 100).toFixed(2)}`);
    expect(b.bannerTitle).toBe("4,8 no Google");
    expect(b.bannerHighlight).toBe("R$ 45.90");
    expect(geovanaAbout(p, true)).toContain("Destaques: 4,8 no Google; Forno a lenha.");
  });
});
