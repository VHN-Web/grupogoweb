import { describe, expect, it } from "vitest";
import { buildSystemPrompt, jidToE164, orderNotice, parseGeovana, parseReply, wantsHuman } from "./geovana";

describe("Geovana", () => {
  it("lê marcações de carrinho e humano", () => {
    const ids = new Set(["p1", "p2"]);
    const r = parseReply("Fechado! Seu carrinho está pronto.\n[[CARRINHO: p1:2, p2:1, xx:3, p1:1]]", ids);
    expect(r.text).toBe("Fechado! Seu carrinho está pronto.");
    expect(r.cart).toEqual([{ productId: "p1", quantity: 3 }, { productId: "p2", quantity: 1 }]);
    expect(r.handoff).toBe(false);
    expect(parseReply("Vou chamar a equipe [[HUMANO]]", ids).handoff).toBe(true);
    expect(parseReply("[[CARRINHO: zz:1]]", ids).handoff).toBe(true); // nada aproveitável → humano
  });
  it("config, palavras de humano, telefone e avisos", () => {
    const c = parseGeovana('{"enabled":true,"name":"Bia","tone":"x","pauseMinutes":2,"faq":[{"q":"a","a":"b"},{"q":"","a":"c"}]}');
    expect(c.name).toBe("Bia");
    expect(c.tone).toBe("amigavel");
    expect(c.pauseMinutes).toBe(60);
    expect(c.faq).toHaveLength(1);
    expect(wantsHuman("Quero falar com um ATENDENTE", c.handoffWords)).toBe(true);
    expect(jidToE164("5581999990000@s.whatsapp.net")).toBe("+5581999990000");
    expect(jidToE164("12036302@g.us")).toBeNull();
    expect(orderNotice("OUT_FOR_DELIVERY", { number: "12", storeName: "Loja", trackUrl: "u", type: "DELIVERY" }, "pt")).toContain("saiu para entrega");
    expect(orderNotice("READY", { number: "12", storeName: "Loja", trackUrl: "u", type: "DELIVERY" }, "pt")).toBeNull();
  });
  it("prompt só com o que a loja informou", () => {
    const p = buildSystemPrompt(parseGeovana('{"name":"Geovana","promos":"2x1 terça"}'), {
      storeName: "Burger X", storeUrl: "https://x", isOpen: true, address: null, delivery: "", payments: "Pix", bookingUrl: null,
      catalog: [{ id: "p1", name: "X-Bacon", price: "R$ 30,00" }], customerName: null, customerOrders: [], locale: "pt",
    });
    expect(p).toContain("2x1 terça");
    expect(p).toContain("p1 | X-Bacon | R$ 30,00");
    expect(p).toContain("português do Brasil");
    expect(p).toContain("[[CARRINHO:");
  });
});
