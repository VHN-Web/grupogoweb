import { describe, expect, it } from "vitest";
import { PAGES, allowedPages, allowedTools, describeAction, matchPages } from "./assistant";
import { PANEL_AREAS } from "./types";

const ALL = new Set(PANEL_AREAS);

describe("assistente", () => {
  it("plano fechado + pro: todas as ferramentas", () => {
    expect(allowedTools(ALL, null, true).map((t) => t.name)).toContain("create_coupon");
  });
  it("sem GoInteligence: sem cupom/oferta", () => {
    const names = allowedTools(ALL, null, false).map((t) => t.name);
    expect(names).not.toContain("create_coupon");
    expect(names).toContain("update_product");
  });
  it("plano personalizado sem delivery: sem motoboy", () => {
    const names = allowedTools(ALL, ["caixa"], true).map((t) => t.name);
    expect(names).not.toContain("add_courier");
    expect(names).not.toContain("create_coupon");
  });
  it("funcionário só com pedidos: não mexe em produto", () => {
    const names = allowedTools(new Set(["orders"] as const), null, true).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["set_store_open", "update_order_status"]));
    expect(names).not.toContain("update_product");
  });
  it("guia acha a tela pela pergunta (com e sem acento)", () => {
    expect(matchPages("como imprimo o QR das mesas?", PAGES)[0].id).toBe("tables");
    expect(matchPages("quero mudar o preco de um produto", PAGES)[0].id).toBe("products");
    expect(matchPages("cadastrar motoboy", allowedPages(ALL, ["caixa"], true))).toEqual([]);
  });
  it("descreve a ação para confirmar", () => {
    const money = (v: number) => `R$ ${v.toFixed(2)}`;
    expect(describeAction("update_product", { productId: "x", price: 25.9, active: false }, { locale: "pt", money, productName: "X-Burger" })).toBe("Alterar «X-Burger»: preço R$ 25.90, pausar");
    expect(describeAction("set_store_open", { open: false }, { locale: "pt", money })).toBe("Fechar a loja para pedidos online");
  });
});
