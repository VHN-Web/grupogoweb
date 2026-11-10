import { describe, expect, it } from "vitest";
import { businessHours, idleNudge, idleText, invoiceStage, invoiceText, setupNudge } from "./nudges";
import { setupForPrompt, setupProgress, setupSteps } from "./setup";

const at = (s: string) => new Date(`${s}-03:00`);

describe("passo a passo", () => {
  const base = { slug: "ze", logoUrl: null, productCount: 0, address: null, lat: null, whatsapp: null, acceptsDelivery: true, deliveryMaxKm: 5, hasOnlinePayment: false, orderCount: 0 };
  it("lista os passos e o próximo", () => {
    const s = setupSteps({ ...base, logoUrl: "/x.png", productCount: 10 });
    const p = setupProgress(s);
    expect(p).toMatchObject({ done: 2, total: 7 });
    expect(p.next?.key).toBe("endereco");
    expect(setupForPrompt(s, "https://g.com")).toContain("https://g.com/painel/ze/config");
    expect(setupProgress(setupSteps({ ...base, logoUrl: "x", productCount: 3, address: "a", lat: 1, whatsapp: "+55", hasOnlinePayment: true, orderCount: 1 })).next).toBeNull();
  });
  it("lembra a cada 2 dias, até 45 dias e no máximo 8 vezes", () => {
    const d = at("2026-11-01T10:00:00");
    expect(setupNudge({ tenantId: "t", deliveredAt: d, sent: 0, now: at("2026-11-01T12:00:00") })).toBeNull(); // menos de meio dia
    expect(setupNudge({ tenantId: "t", deliveredAt: d, sent: 0, now: at("2026-11-02T10:00:00") })).toBe("setup:t:0");
    expect(setupNudge({ tenantId: "t", deliveredAt: d, sent: 0, now: at("2026-11-03T11:00:00") })).toBe("setup:t:1");
    expect(setupNudge({ tenantId: "t", deliveredAt: d, sent: 8, now: at("2026-11-10T10:00:00") })).toBeNull();
    expect(setupNudge({ tenantId: "t", deliveredAt: d, sent: 1, now: at("2026-12-20T10:00:00") })).toBeNull();
  });
});

describe("loja parada", () => {
  it("só depois de 7 dias no ar e 7 sem pedido; 1 por semana", () => {
    const live = at("2026-10-01T10:00:00");
    expect(idleNudge({ tenantId: "t", liveSince: at("2026-11-08T10:00:00"), lastOrderAt: null, now: at("2026-11-10T10:00:00") })).toBeNull();
    expect(idleNudge({ tenantId: "t", liveSince: live, lastOrderAt: at("2026-11-08T10:00:00"), now: at("2026-11-10T10:00:00") })).toBeNull();
    const a = idleNudge({ tenantId: "t", liveSince: live, lastOrderAt: at("2026-11-01T10:00:00"), now: at("2026-11-10T10:00:00") });
    const b = idleNudge({ tenantId: "t", liveSince: live, lastOrderAt: at("2026-11-01T10:00:00"), now: at("2026-11-11T10:00:00") });
    expect(a?.days).toBe(9);
    expect(a?.key).toBe(b?.key);
    expect(idleText({ contact: "José Silva", store: "Pizza do Zé", days: 9, link: "L", panel: "P", week: 3 })).toMatch(/^Oi, José!/);
  });
});

describe("cobrança gentil", () => {
  const due = at("2026-11-20T12:00:00");
  it("etapas: 3 dias antes, no dia, 1 e 3 dias depois", () => {
    expect(invoiceStage(due, at("2026-11-17T09:30:00"))).toBe("d-3");
    expect(invoiceStage(due, at("2026-11-18T10:00:00"))).toBeNull();
    expect(invoiceStage(due, at("2026-11-20T18:00:00"))).toBe("d0");
    expect(invoiceStage(due, at("2026-11-21T09:00:00"))).toBe("d+1");
    expect(invoiceStage(due, at("2026-11-23T09:00:00"))).toBe("d+3");
    expect(invoiceText({ contact: null, store: "Loja", stage: "d+3", amount: "R$ 179,00", due: "20/11/2026", link: "LINK", graceDays: 7 })).toContain("carência de 7 dias");
  });
  it("só em horário comercial", () => {
    expect(businessHours(at("2026-11-10T08:59:00"))).toBe(false);
    expect(businessHours(at("2026-11-10T09:00:00"))).toBe(true);
    expect(businessHours(at("2026-11-10T19:00:00"))).toBe(false);
  });
});
