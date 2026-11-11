import { describe, expect, it } from "vitest";
import { COURIER_ERRORS, courierPushText, courierT, langFromAccept, resolveCourierLang } from "./courier-i18n";

describe("idiomas do app do entregador", () => {
  it("um idioma por vez", () => {
    expect(courierT("pt")("Hola", "Olá", "Hi")).toBe("Olá");
    expect(courierT("es")("Hola", "Olá", "Hi")).toBe("Hola");
    expect(courierT("en")("Hola", "Olá", "Hi")).toBe("Hi");
  });
  it("escolha salva vence; depois cookie, loja e navegador", () => {
    expect(resolveCourierLang({ saved: "en", cookie: "es", store: "pt" })).toBe("en");
    expect(resolveCourierLang({ saved: null, cookie: "es", store: "pt" })).toBe("es");
    expect(resolveCourierLang({ saved: "xx", store: "es" })).toBe("es");
    expect(resolveCourierLang({ accept: "en-US,en;q=0.9" })).toBe("en");
    expect(resolveCourierLang({})).toBe("pt");
  });
  it("Accept-Language por prioridade", () => {
    expect(langFromAccept("fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7")).toBe("es");
    expect(langFromAccept("de")).toBeNull();
  });
  it("avisos do servidor sem misturar idiomas", () => {
    const pt = courierPushText("pt", "new", { number: 12, store: "Burguer", address: "Rua A", km: 2.34 });
    expect(pt).toEqual({ title: "Nova entrega #12", body: "Burguer · Rua A · 2,3 km da loja" });
    expect(courierPushText("en", "new", { number: 12, km: 2.34 }).body).toBe("2.3 km from the store");
    expect(courierPushText("es", "available", { number: 7 }).title).toBe("Entrega disponible #7");
    expect(courierPushText("en", "cancelled", { number: 7 }).body).toBe("The store canceled this order.");
    for (const v of Object.values(courierPushText("pt", "available", { number: 1 }))) expect(v.includes("·")).toBe(false);
  });
  it("todos os erros nos 3 idiomas", () => {
    for (const e of Object.values(COURIER_ERRORS)) expect(Object.keys(e).sort()).toEqual(["en", "es", "pt"]);
  });
});
