import { describe, expect, it } from "vitest";
import { actionsForStatus, buildMerchant, effectOfEvent, fromOdValue, mapOdOrder, newMerchantId, odSign, odVerify, shouldApply, splitAddress, stableUuid, toOdValue } from "./opendelivery";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("ids e dinheiro", () => {
  it("UUID estável e válido", () => {
    expect(stableUuid("item:abc")).toBe(stableUuid("item:abc"));
    expect(stableUuid("item:abc")).not.toBe(stableUuid("item:abd"));
    expect(stableUuid("x")).toMatch(UUID);
  });
  it("merchantId = CNPJ + uuid", () => {
    expect(newMerchantId("22.815.773/0001-69", "dbc7e35a-c936-4665-9e13-eb55eb8b6824")).toBe("22815773000169-dbc7e35a-c936-4665-9e13-eb55eb8b6824");
    expect(newMerchantId("", "u-u")).toBe("u-u");
  });
  it("converte centavos ↔ decimal sem erro de float", () => {
    expect(toOdValue(1250, "BRL")).toBe(12.5);
    expect(fromOdValue(0.1 + 0.2, "BRL")).toBe(30);
    expect(fromOdValue("19.99", "BRL")).toBe(1999);
    expect(fromOdValue(undefined, "BRL")).toBe(0);
  });
});

describe("cardápio no padrão", () => {
  const base = {
    merchantId: "m-1",
    now: new Date("2026-11-08T12:00:00Z"),
    tenant: {
      id: "t1", name: "Burger do Zé", tagline: "Smash", phone: "+5581999990000", whatsapp: "+5581999990000", address: "Rua A, 10", lat: -8.05, lng: -34.9,
      isOpen: true, acceptsPickup: true, acceptsDelivery: true, currency: "BRL" as const, logoUrl: "/uploads/logo.webp", bannerImageUrl: null,
      deliveryBaseFeePyg: 500, deliveryMaxKm: 6, createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    info: { document: "22.815.773/0001-69", corporateName: "Zé LTDA", categories: ["BURGERS"], email: "ze@x.com", preparationMin: 20 },
    address: { street: "Rua A", number: "10", district: "Centro", city: "Recife", state: "PE", postalCode: "50000-000", complement: "" },
    categories: [{ id: "c1", name: "Lanches", sortOrder: 0 }, { id: "c2", name: "Vazia", sortOrder: 1 }],
    products: [
      { id: "p1", categoryId: "c1", name: "Smash", description: null, imageUrl: "https://cdn/x.jpg", priceMinor: 2500, originalMinor: 3000, available: true, sortOrder: 0 },
      { id: "p2", categoryId: "c1", name: "Duplo", description: "2 carnes", imageUrl: null, priceMinor: 3500, originalMinor: 3500, available: false, sortOrder: 1 },
      { id: "p3", categoryId: null, name: "Sem categoria", description: null, imageUrl: null, priceMinor: 100, originalMinor: 100, available: true, sortOrder: 0 },
    ],
    absUrl: (u: string) => (u.startsWith("http") ? u : `https://goweb.test${u}`),
    fallbackLogo: "/logo.png",
  };
  it("monta Merchant com ofertas, itens e serviços", () => {
    const m = buildMerchant(base);
    expect(m.id).toBe("m-1");
    expect(m.status).toBe("AVAILABLE");
    expect(m.basicInfo.document).toBe("22815773000169");
    expect(m.basicInfo.logoImage.URL).toBe("https://goweb.test/uploads/logo.webp");
    expect(m.categories).toHaveLength(1); // categoria vazia e item sem categoria ficam de fora
    expect(m.items.map((i) => i.externalCode)).toEqual(["p1", "p2"]);
    expect(m.itemOffers[0].price).toEqual({ value: 25, originalValue: 30, currency: "BRL" });
    expect(m.itemOffers[1].status).toBe("UNAVAILABLE");
    expect(m.categories[0].itemOfferId).toEqual(m.itemOffers.map((o) => o.id));
    expect(m.itemOffers[0].itemId).toBe(m.items[0].id);
    expect(m.menus[0].categoryId).toEqual([m.categories[0].id]);
    expect(m.services.map((s) => s.serviceType)).toEqual(["DELIVERY", "TAKEOUT"]);
    expect(m.services[0].serviceArea?.geoRadius.radius[0]).toMatchObject({ size: 6, price: { value: 5, currency: "BRL" } });
  });
  it("loja fechada = UNAVAILABLE em tudo; sem delivery não publica o serviço", () => {
    const m = buildMerchant({ ...base, tenant: { ...base.tenant, isOpen: false, acceptsDelivery: false } });
    expect(m.status).toBe("UNAVAILABLE");
    expect(m.services.map((s) => [s.serviceType, s.status])).toEqual([["TAKEOUT", "UNAVAILABLE"]]);
  });
});

describe("pedido do app → GoWeb", () => {
  const order = {
    id: "8f9a6a3e-0000-4000-8000-000000000001",
    type: "DELIVERY",
    displayId: "4521",
    orderTiming: "INSTANT",
    items: [
      { name: "Smash", externalCode: "p1", quantity: 2, unitPrice: { value: 25 }, totalPrice: { value: 54 }, options: [{ name: "Bacon", quantity: 2, totalPrice: { value: 4 } }], specialInstructions: "sem cebola" },
      { name: "Refri", externalCode: "desconhecido", quantity: 1, unitPrice: { value: 6.5 }, totalPrice: { value: 6.5 } },
    ],
    otherFees: [{ type: "DELIVERY_FEE", receivedBy: "MERCHANT", price: { value: 5 } }, { type: "TIP", price: { value: 2 } }],
    discounts: [{ amount: { value: 10 }, sponsorshipValues: [{ name: "MARKETPLACE", amount: { value: 7 } }, { name: "MERCHANT", amount: { value: 3 } }] }],
    total: { itemsPrice: { value: 60.5 }, otherFees: { value: 7 }, discount: { value: 10 }, orderAmount: { value: 57.5 } },
    payments: { prepaid: 0, pending: 57.5, methods: [{ value: 57.5, type: "PENDING", method: "CASH", changeFor: 100 }] },
    customer: { name: "Maria", phone: { number: "81988887777" } },
    delivery: { deliveredBy: "MERCHANT", deliveryAddress: { formattedAddress: "Rua B, 20, Boa Vista", complement: "ap 3", reference: "perto da praça", coordinates: { latitude: -8.06, longitude: -34.88 } } },
    sendPreparing: true,
  };
  it("mapeia itens, taxas, desconto da loja e pagamento", () => {
    const m = mapOdOrder(order, "BRL", new Set(["p1"]), "99Food");
    expect(m.type).toBe("DELIVERY");
    expect(m.items[0]).toMatchObject({ productId: "p1", unitMinor: 2700, quantity: 2, notes: "2x Bacon · sem cebola" });
    expect(m.items[1]).toMatchObject({ productId: null, unitMinor: 650 });
    expect(m.subtotalMinor).toBe(6050);
    expect(m.deliveryFeeMinor).toBe(500);
    expect(m.discountMinor).toBe(300); // só o que a loja banca
    expect(m.totalMinor).toBe(5750);
    expect(m.paymentMethod).toBe("CASH");
    expect(m.prepaid).toBe(false);
    expect(m.changeForMinor).toBe(10000);
    expect(m.customerPhone).toBe("+5581988887777");
    expect(m.address).toContain("Ref.: perto da praça");
    expect(m.notes).toContain("99Food #4521");
    expect(m.notes).toContain("troco para 100,00");
    expect(m.marketplaceDelivery).toBe(false);
    expect(m.flags.sendPreparing).toBe(true);
  });
  it("pago no app, retirada e entregador do app", () => {
    const pre = mapOdOrder({ ...order, type: "TAKEOUT", payments: { prepaid: 57.5, pending: 0, methods: [{ value: 57.5, type: "PREPAID", method: "PIX" }] } }, "BRL", new Set(), "Keeta");
    expect(pre.type).toBe("PICKUP");
    expect(pre.prepaid).toBe(true);
    expect(pre.paymentMethod).toBe("PIX");
    expect(pre.address).toBeNull();
    const mk = mapOdOrder({ ...order, delivery: { ...order.delivery, deliveredBy: "MARKETPLACE" } }, "BRL", new Set(), "Keeta");
    expect(mk.marketplaceDelivery).toBe(true);
  });
  it("recusa pedido sem id", () => {
    expect(() => mapOdOrder({} as never, "BRL", new Set(), "X")).toThrow();
  });
});

describe("status", () => {
  const o = { externalId: "e1", number: "12", type: "DELIVERY" as const, marketplaceDelivery: false, confirmed: false, prepMin: 20, flags: { sendPreparing: true, sendDelivered: true, sendPickedUp: false } };
  const now = new Date("2026-11-08T12:00:00Z");
  it("confirma antes do primeiro status", () => {
    expect(actionsForStatus("PREPARING", o, now).map((a) => a.path)).toEqual(["/v1/orders/e1/confirm", "/v1/orders/e1/preparing"]);
    expect(actionsForStatus("PREPARING", { ...o, confirmed: true, flags: { ...o.flags, sendPreparing: false } }, now)).toEqual([]);
    expect(actionsForStatus("PREPARING", o, now)[0].body).toMatchObject({ orderExternalCode: "12", preparationTime: 20 });
  });
  it("entrega própria despacha; entregador do app só recebe 'pronto'", () => {
    const c = { ...o, confirmed: true };
    expect(actionsForStatus("OUT_FOR_DELIVERY", c, now).map((a) => a.path)).toEqual(["/v1/orders/e1/dispatch"]);
    expect(actionsForStatus("OUT_FOR_DELIVERY", { ...c, marketplaceDelivery: true }, now).map((a) => a.path)).toEqual(["/v1/orders/e1/readyForPickup"]);
    expect(actionsForStatus("COMPLETED", c, now).map((a) => a.path)).toEqual(["/v1/orders/e1/delivered"]);
    expect(actionsForStatus("COMPLETED", { ...c, marketplaceDelivery: true }, now)).toEqual([]);
    expect(actionsForStatus("CANCELLED", c, now)[0]).toMatchObject({ path: "/v1/orders/e1/requestCancellation", body: { mode: "MANUAL" } });
  });
  it("eventos do app só avançam o pedido", () => {
    expect(effectOfEvent("CREATED")).toEqual({ kind: "create" });
    expect(effectOfEvent("CONCLUDED")).toEqual({ kind: "status", status: "COMPLETED" });
    expect(effectOfEvent("ORDER_CANCELLATION_REQUEST")).toEqual({ kind: "cancelRequest" });
    expect(effectOfEvent("CONFIRMED")).toEqual({ kind: "ignore" });
    expect(shouldApply("PREPARING", "OUT_FOR_DELIVERY")).toBe(true);
    expect(shouldApply("COMPLETED", "OUT_FOR_DELIVERY")).toBe(false);
    expect(shouldApply("READY", "CANCELLED")).toBe(true);
    expect(shouldApply("COMPLETED", "CANCELLED")).toBe(false);
    expect(shouldApply("CANCELLED", "COMPLETED")).toBe(false);
  });
});

describe("assinatura e endereço", () => {
  it("HMAC-SHA256 hex (e base64) do corpo", () => {
    const body = '{"eventId":"1"}';
    const sig = odSign(body, "segredo");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(odVerify(body, sig, "segredo")).toBe(true);
    expect(odVerify(body, sig.toUpperCase(), "segredo")).toBe(true);
    expect(odVerify(body + " ", sig, "segredo")).toBe(false);
    expect(odVerify(body, sig, "outro")).toBe(false);
    expect(odVerify(body, null, "segredo")).toBe(false);
  });
  it("quebra endereço brasileiro", () => {
    const a = splitAddress("Rua do Sol, 120 - Boa Vista, Recife - PE, 50050-000");
    expect(a).toMatchObject({ street: "Rua do Sol", number: "120", district: "Boa Vista", city: "Recife", state: "PE", postalCode: "50050-000" });
  });
});
