import { describe, expect, it } from "vitest";
import { DEFAULT_MODULE_PRICES, areaAllowed, customPrice, hasModule, needsPro, parseModulePrices, parseModules, sanitizeModules } from "./modules";

describe("plano personalizado", () => {
  it("null = plano fechado (tudo liberado)", () => {
    expect(parseModules(null)).toBeNull();
    expect(hasModule({ modules: null }, "agenda")).toBe(true);
    expect(areaAllowed(null, "marketing")).toBe(true);
  });
  it("lista restringe áreas, mas o núcleo continua liberado", () => {
    const m = parseModules(JSON.stringify(["caixa", "xyz"]));
    expect(m).toEqual(["caixa"]);
    expect(areaAllowed(m, "cash")).toBe(true);
    expect(areaAllowed(m, "tables")).toBe(false);
    expect(areaAllowed(m, "orders")).toBe(true);
    expect(areaAllowed(m, "settings")).toBe(true);
    expect(hasModule({ modules: '["caixa"]' }, "delivery")).toBe(false);
  });
  it("lista vazia = só o núcleo", () => {
    expect(parseModules("[]")).toEqual([]);
    expect(areaAllowed([], "customers")).toBe(false);
  });
  it("preço = núcleo + módulos; só núcleo é mais barato que o plano básico", () => {
    const p = DEFAULT_MODULE_PRICES;
    expect(customPrice(p, []).BRL).toBe(p.core.BRL);
    expect(customPrice(p, ["mesas", "caixa"]).BRL).toBe(p.core.BRL + 1900 + 1900);
    expect(customPrice(p, []).BRL).toBeLessThan(17900);
  });
  it("módulo GoInteligence liga o nível pro", () => {
    expect(needsPro(["mesas"])).toBe(false);
    expect(needsPro(["agenda"])).toBe(true);
  });
  it("preços inválidos voltam ao padrão", () => {
    const p = parseModulePrices(JSON.stringify({ core: { BRL: -5, PYG: "x" }, modules: { mesas: { BRL: 2500 } } }));
    expect(p.core.BRL).toBe(DEFAULT_MODULE_PRICES.core.BRL);
    expect(p.modules.mesas.BRL).toBe(2500);
    expect(p.modules.mesas.PYG).toBe(DEFAULT_MODULE_PRICES.modules.mesas.PYG);
  });
  it("sanitiza a seleção vinda do formulário", () => {
    expect(sanitizeModules(["agenda", "hack", "agenda", "mesas"])).toEqual(["mesas", "agenda"]);
  });
});
