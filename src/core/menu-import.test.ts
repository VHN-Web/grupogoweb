import { describe, expect, it } from "vitest";
import { menuSummary, parseMenuJson } from "./menu-import";

describe("cardápio por foto", () => {
  it("lê o JSON da IA, converte preço e tira repetidos", () => {
    const raw = '```json\n{"itens":[{"categoria":"Pizzas","nome":"Calabresa (grande)","descricao":"molho, mussarela","preco":45.9},{"categoria":"Pizzas","nome":"Calabresa (grande)","preco":45.9},{"categoria":"Bebidas","nome":"Coca 2L","preco":"R$ 12,50"},{"nome":"Sem preço"},{"categoria":"","nome":"Água","preco":3}]}\n```';
    const it = parseMenuJson(raw, "BRL");
    expect(it).toEqual([
      { category: "Pizzas", name: "Calabresa (grande)", description: "molho, mussarela", priceMinor: 4590 },
      { category: "Bebidas", name: "Coca 2L", description: "", priceMinor: 1250 },
      { category: "Cardápio", name: "Água", description: "", priceMinor: 300 },
    ]);
    expect(menuSummary(it)).toBe("3 produto(s) em 3 categoria(s) (Pizzas 1, Bebidas 1, Cardápio 1)");
  });
  it("aceita lista direta, preço com milhar e ignora lixo", () => {
    expect(parseMenuJson('[{"categoria":"Combos","nome":"Família","preco":"1.299,90"}]', "BRL")[0].priceMinor).toBe(129990);
    expect(parseMenuJson("não consegui ler", "BRL")).toEqual([]);
    expect(parseMenuJson('{"itens":[{"nome":"X","preco":-5}]}', "BRL")).toEqual([]);
  });
});
