// Open Delivery (Abrasel) — regras PURAS, sem I/O.
// A GoWeb é o "Software Service" (sistema da loja); 99Food, Keeta e outros apps são "Ordering Applications".
// Especificação: github.com/Abrasel-Nacional/opendelivery (openapi.yaml, v1.7.x). Keeta segue a v1.5 + assinatura.
//
// O que a GoWeb faz:
//  - publica o cardápio da loja em GET {url da loja}/v1/merchant (formato Merchant do padrão);
//  - recebe eventos de pedido por webhook (POST .../v1/newEvent, assinado) ou busca por polling;
//  - transforma o pedido do app em pedido da GoWeb (mesmo quadro, impressora, caixa);
//  - devolve cada mudança de status ao app (confirm, readyForPickup, dispatch, delivered, requestCancellation).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MINOR_UNITS } from "./money";
import type { Currency, OrderStatus, OrderType, PaymentMethod } from "./types";

// ---------------------------------------------------------------- canais
export const OD_PLATFORMS = ["99food", "keeta"] as const;
export type OdPlatform = (typeof OD_PLATFORMS)[number];

export const OD_PLATFORM_INFO: Record<OdPlatform, { name: string; color: string; defaultBaseUrl: string; signRequests: boolean; help: string }> = {
  "99food": {
    name: "99Food",
    color: "#FFB800",
    defaultBaseUrl: "",
    signRequests: false,
    help: "Peça ao seu contato comercial da 99Food a integração Open Delivery informando que o seu sistema é a GoWeb. Eles enviam o Client ID, o Client Secret e o endereço da API.",
  },
  keeta: {
    name: "Keeta",
    color: "#FFD100",
    defaultBaseUrl: "https://open.mykeeta.com/api/open/opendelivery",
    signRequests: true,
    help: "No portal do parceiro da Keeta, autorize a GoWeb como sistema (PDV). As credenciais vêm da GoWeb ou do seu contato na Keeta.",
  },
};

export const isOdPlatform = (v: unknown): v is OdPlatform => typeof v === "string" && (OD_PLATFORMS as readonly string[]).includes(v);

// ---------------------------------------------------------------- ids
/** UUID determinístico (formato v5) a partir de um texto — o mesmo produto sempre gera o mesmo id no padrão. */
export function stableUuid(seed: string): string {
  const h = createHash("sha1").update(`goweb-od:${seed}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** merchantId do padrão: documento da loja + UUID (mín. 36 caracteres). Gerado uma vez por loja. */
export function newMerchantId(document: string | null | undefined, uuid: string): string {
  const doc = String(document ?? "").replace(/\D/g, "");
  return doc ? `${doc}-${uuid}` : uuid;
}

// ---------------------------------------------------------------- dinheiro
/** unidade menor (centavos) → valor decimal do padrão (R$ 12,50 → 12.5) */
export const toOdValue = (minor: number, cur: Currency) => Math.round(minor) / MINOR_UNITS[cur];
/** valor decimal do padrão → unidade menor, sem erro de ponto flutuante */
export const fromOdValue = (value: unknown, cur: Currency) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * MINOR_UNITS[cur]) : 0;
};
const price = (minor: number, cur: Currency) => ({ value: toOdValue(minor, cur), currency: cur });

// ---------------------------------------------------------------- cardápio (GET /v1/merchant)
export const OD_CATEGORIES = [
  "BURGERS", "PIZZA", "FAST_FOOD", "HOT_DOG", "JAPANESE", "DESSERTS", "AMERICAN", "ICE_CREAM", "BBQ", "SANDWICH", "MEXICAN", "BRAZILIAN",
  "PASTRY", "ARABIAN", "COMFORT_FOOD", "VEGETARIAN", "VEGAN", "BAKERY", "HEALTHY", "ITALIAN", "CHINESE", "JUICE_SMOOTHIES", "SEAFOOD", "CAFE",
  "SALADS", "COFFEE_TEA", "PASTA", "BREAKFAST_BRUNCH", "LATIN_AMERICAN", "CONVENIENCE", "PUB", "FAMILY_MEALS", "GOURMET", "AFFORDABLE_MEALS",
] as const;
export const OD_CATEGORY_PT: Record<string, string> = {
  BURGERS: "Hambúrguer", PIZZA: "Pizza", FAST_FOOD: "Lanches", HOT_DOG: "Cachorro-quente", JAPANESE: "Japonesa", DESSERTS: "Doces e sobremesas",
  AMERICAN: "Americana", ICE_CREAM: "Sorvete e açaí", BBQ: "Churrasco", SANDWICH: "Sanduíche", MEXICAN: "Mexicana", BRAZILIAN: "Brasileira",
  PASTRY: "Pastel e salgados", ARABIAN: "Árabe", COMFORT_FOOD: "Comida caseira", VEGETARIAN: "Vegetariana", VEGAN: "Vegana", BAKERY: "Padaria",
  HEALTHY: "Saudável", ITALIAN: "Italiana", CHINESE: "Chinesa", JUICE_SMOOTHIES: "Sucos", SEAFOOD: "Frutos do mar", CAFE: "Cafeteria",
  SALADS: "Saladas", COFFEE_TEA: "Café e chá", PASTA: "Massas", BREAKFAST_BRUNCH: "Café da manhã", LATIN_AMERICAN: "Latina", CONVENIENCE: "Conveniência",
  PUB: "Bar", FAMILY_MEALS: "Marmitas e família", GOURMET: "Gourmet", AFFORDABLE_MEALS: "Econômica",
};

export type OdMerchantInfo = { document: string; corporateName: string; categories: string[]; email: string; preparationMin: number };

export type MerchantInput = {
  merchantId: string;
  now: Date;
  tenant: {
    id: string;
    name: string;
    tagline: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    isOpen: boolean;
    acceptsPickup: boolean;
    acceptsDelivery: boolean;
    currency: Currency;
    logoUrl: string | null;
    bannerImageUrl: string | null;
    deliveryBaseFeePyg: number;
    deliveryMaxKm: number;
    createdAt: Date;
  };
  info: OdMerchantInfo;
  address: { street: string; number: string; district: string; city: string; state: string; postalCode: string; complement: string };
  categories: { id: string; name: string; sortOrder: number }[];
  products: {
    id: string;
    categoryId: string | null;
    name: string;
    description: string | null;
    imageUrl: string | null;
    priceMinor: number; // preço que vale agora (oferta incluída)
    originalMinor: number; // preço cheio
    available: boolean; // ativo e com estoque
    sortOrder: number;
  }[];
  absUrl: (path: string) => string; // transforma /uploads/x em https://…
  fallbackLogo: string;
};

const ALL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

/** Monta o objeto Merchant do padrão a partir dos dados da loja. Só itens com categoria entram no menu. */
export function buildMerchant(m: MerchantInput) {
  const cur = m.tenant.currency;
  const t = m.tenant;
  const menuId = stableUuid(`menu:${t.id}`);
  const avail = stableUuid(`avail:${t.id}`);
  const catsWithItems = m.categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c, i) => ({ c, i, prods: m.products.filter((p) => p.categoryId === c.id).sort((a, b) => a.sortOrder - b.sortOrder) }))
    .filter((x) => x.prods.length > 0);
  const products = catsWithItems.flatMap((x) => x.prods);
  const img = (u: string | null) => (u ? { URL: m.absUrl(u) } : undefined);
  const hours = { id: stableUuid(`hours:${t.id}`), weekHours: [{ dayOfWeek: ALL_DAYS, timePeriods: { startTime: "00:00:00.000Z", endTime: "23:59:00.000Z" } }] };
  const service = (type: "DELIVERY" | "TAKEOUT") => ({
    id: stableUuid(`svc:${type}:${t.id}`),
    status: t.isOpen ? "AVAILABLE" : "UNAVAILABLE",
    serviceType: type,
    serviceTiming: { timing: ["INSTANT"] },
    menuId,
    ...(type === "DELIVERY" && t.lat != null && t.lng != null
      ? {
          serviceArea: {
            id: stableUuid(`area:${t.id}`),
            geoRadius: {
              geoMidpointLatitude: t.lat,
              geoMidpointLongitude: t.lng,
              radius: [{ size: Math.max(1, Math.round(t.deliveryMaxKm)), price: price(t.deliveryBaseFeePyg, cur), estimateDeliveryTime: m.info.preparationMin + 20 }],
            },
          },
        }
      : {}),
    serviceHours: hours,
  });
  const services = [
    ...(t.acceptsDelivery ? [service("DELIVERY")] : []),
    ...(t.acceptsPickup ? [service("TAKEOUT")] : []),
  ];
  return {
    lastUpdate: m.now.toISOString(),
    TTL: 300,
    id: m.merchantId,
    status: t.isOpen ? "AVAILABLE" : "UNAVAILABLE",
    basicInfo: {
      name: t.name,
      document: m.info.document.replace(/\D/g, ""),
      corporateName: m.info.corporateName || t.name,
      description: t.tagline || t.name,
      averagePreparationTime: m.info.preparationMin,
      minOrderValue: price(0, cur),
      merchantType: "RESTAURANT",
      merchantCategories: m.info.categories.length ? m.info.categories : ["BRAZILIAN"],
      address: {
        country: "BR",
        state: m.address.state,
        city: m.address.city,
        district: m.address.district,
        street: m.address.street,
        number: m.address.number,
        postalCode: m.address.postalCode.replace(/\D/g, ""),
        complement: m.address.complement,
        latitude: t.lat ?? 0,
        longitude: t.lng ?? 0,
      },
      contactEmails: m.info.email ? [m.info.email] : [],
      contactPhones: { commercialNumber: t.phone || t.whatsapp || "", ...(t.whatsapp ? { whatsappNumber: t.whatsapp } : {}) },
      logoImage: { URL: m.absUrl(t.logoUrl || m.fallbackLogo) },
      ...(t.bannerImageUrl ? { bannerImage: { URL: m.absUrl(t.bannerImageUrl) } } : {}),
      createdAt: t.createdAt.toISOString(),
    },
    services,
    menus: [{ id: menuId, name: "Cardápio", externalCode: t.id, categoryId: catsWithItems.map((x) => stableUuid(`cat:${x.c.id}`)) }],
    categories: catsWithItems.map((x) => ({
      id: stableUuid(`cat:${x.c.id}`),
      index: x.i,
      name: x.c.name,
      externalCode: x.c.id,
      status: "AVAILABLE",
      availabilityId: [avail],
      itemOfferId: x.prods.map((p) => stableUuid(`offer:${p.id}`)),
    })),
    itemOffers: products.map((p, i) => ({
      id: stableUuid(`offer:${p.id}`),
      itemId: stableUuid(`item:${p.id}`),
      index: i,
      status: p.available ? "AVAILABLE" : "UNAVAILABLE",
      price: { value: toOdValue(p.priceMinor, cur), originalValue: toOdValue(Math.max(p.originalMinor, p.priceMinor), cur), currency: cur },
      availabilityId: [avail],
    })),
    items: products.map((p) => ({
      id: stableUuid(`item:${p.id}`),
      name: p.name,
      description: p.description || p.name,
      externalCode: p.id,
      status: p.available ? "AVAILABLE" : "UNAVAILABLE",
      ...(p.imageUrl ? { image: img(p.imageUrl) } : {}),
      unit: "UN",
    })),
    optionGroups: [],
    availabilities: [{ id: avail, hours: [{ dayOfWeek: ALL_DAYS, timePeriods: { startTime: "00:00:00.000Z", endTime: "23:59:00.000Z" } }] }],
  };
}

// ---------------------------------------------------------------- pedido do app → pedido GoWeb
type Money = { value?: unknown; currency?: string } | undefined | null;
type OdItem = {
  id?: string;
  name?: string;
  externalCode?: string;
  quantity?: unknown;
  specialInstructions?: string;
  unitPrice?: Money;
  totalPrice?: Money;
  options?: { name?: string; quantity?: unknown; externalCode?: string; totalPrice?: Money; specialInstructions?: string }[];
};
export type OdOrder = {
  id?: string;
  type?: string;
  displayId?: string;
  createdAt?: string;
  orderTiming?: string;
  merchant?: { id?: string };
  items?: OdItem[];
  otherFees?: { type?: string; receivedBy?: string; price?: Money }[];
  discounts?: { amount?: Money; sponsorshipValues?: { name?: string; amount?: Money }[] }[];
  total?: { itemsPrice?: Money; otherFees?: Money; discount?: Money; orderAmount?: Money };
  payments?: { prepaid?: unknown; pending?: unknown; methods?: { value?: unknown; type?: string; method?: string; changeFor?: unknown }[] };
  customer?: { name?: string; phone?: { number?: string }; documentNumber?: string };
  schedule?: { scheduledDateTimeStart?: string };
  delivery?: {
    deliveredBy?: string;
    deliveryAddress?: { formattedAddress?: string; street?: string; number?: string; complement?: string; reference?: string; district?: string; city?: string; coordinates?: { latitude?: unknown; longitude?: unknown } };
    pickupCode?: string;
  };
  takeout?: { takeoutDateTime?: string };
  sendPreparing?: boolean;
  sendDelivered?: boolean;
  sendPickedUp?: boolean;
  extraInfo?: string;
};

export type MappedOrder = {
  externalId: string;
  displayId: string;
  type: OrderType;
  customerName: string;
  customerPhone: string | null;
  customerDoc: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  items: { productId: string | null; name: string; unitMinor: number; quantity: number; notes: string | null }[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  discountMinor: number; // desconto que a LOJA dá (o do app não reduz o que a loja recebe)
  totalMinor: number; // valor do pedido para o cliente
  paymentMethod: PaymentMethod;
  prepaid: boolean; // já pago no app
  changeForMinor: number | null;
  marketplaceDelivery: boolean; // entregador do app (não usar motoboys da loja)
  flags: { sendPreparing: boolean; sendDelivered: boolean; sendPickedUp: boolean };
};

const ODPAY: Record<string, PaymentMethod> = { CASH: "CASH", PIX: "PIX", CREDIT: "CARD", DEBIT: "CARD", CREDIT_DEBIT: "CARD", MEAL_VOUCHER: "CARD", FOOD_VOUCHER: "CARD", DIGITAL_WALLET: "CARD" };

const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Transforma o pedido do padrão no formato da GoWeb. `knownProducts` = ids de produtos desta loja. */
export function mapOdOrder(o: OdOrder, cur: Currency, knownProducts: Set<string>, appName: string): MappedOrder {
  if (!o || typeof o !== "object" || !o.id) throw new Error("pedido sem id");
  const type: OrderType = o.type === "TAKEOUT" ? "PICKUP" : o.type === "INDOOR" ? "DINE_IN" : "DELIVERY";
  const items = (o.items ?? []).map((it) => {
    const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
    const total = fromOdValue(it.totalPrice?.value, cur) || fromOdValue(it.unitPrice?.value, cur) * qty;
    const opts = (it.options ?? []).map((op) => `${Number(op.quantity) > 1 ? `${Number(op.quantity)}x ` : ""}${s(op.name, 80)}${op.specialInstructions ? ` (${s(op.specialInstructions, 80)})` : ""}`).filter(Boolean);
    const notes = [opts.join(", "), s(it.specialInstructions, 200)].filter(Boolean).join(" · ") || null;
    const ext = s(it.externalCode, 80);
    return { productId: ext && knownProducts.has(ext) ? ext : null, name: s(it.name, 120) || "Item", unitMinor: Math.round(total / qty), quantity: qty, notes };
  });
  const subtotal = items.reduce((a, i) => a + i.unitMinor * i.quantity, 0);
  const fee = (o.otherFees ?? []).filter((f) => f.type === "DELIVERY_FEE").reduce((a, f) => a + fromOdValue(f.price?.value, cur), 0);
  const tip = (o.otherFees ?? []).filter((f) => f.type === "TIP").reduce((a, f) => a + fromOdValue(f.price?.value, cur), 0);
  // desconto bancado pela loja (MERCHANT) — o que o app banca não é desconto para a loja
  const merchantDiscount = (o.discounts ?? []).reduce(
    (a, d) => a + (d.sponsorshipValues ?? []).filter((sp) => sp.name === "MERCHANT").reduce((b, sp) => b + fromOdValue(sp.amount?.value, cur), 0),
    0,
  );
  const orderAmount = fromOdValue(o.total?.orderAmount?.value, cur);
  const pending = Number(o.payments?.pending ?? 0);
  const prepaid = !(pending > 0);
  const pendingMethod = (o.payments?.methods ?? []).find((m) => m.type === "PENDING") ?? (o.payments?.methods ?? [])[0];
  const paymentMethod = (pendingMethod?.method && ODPAY[pendingMethod.method]) || (prepaid ? "CARD" : "CASH");
  const changeFor = pendingMethod?.changeFor != null ? fromOdValue(pendingMethod.changeFor, cur) : null;
  const addr = o.delivery?.deliveryAddress;
  const lat = Number(addr?.coordinates?.latitude);
  const lng = Number(addr?.coordinates?.longitude);
  const address = type === "DELIVERY"
    ? [s(addr?.formattedAddress, 300) || [s(addr?.street), s(addr?.number), s(addr?.district), s(addr?.city)].filter(Boolean).join(", "), s(addr?.complement, 120), addr?.reference ? `Ref.: ${s(addr.reference, 120)}` : ""].filter(Boolean).join(" · ")
    : null;
  const displayId = s(o.displayId, 20) || o.id.slice(0, 6);
  const when = o.orderTiming === "SCHEDULED" && o.schedule?.scheduledDateTimeStart ? `AGENDADO para ${o.schedule.scheduledDateTimeStart}` : "";
  const notes = [
    `${appName} #${displayId}`,
    when,
    prepaid ? "Pago no app" : `Cobrar na entrega${changeFor ? ` (troco para ${toOdValue(changeFor, cur).toFixed(2).replace(".", ",")})` : ""}`,
    o.delivery?.pickupCode ? `Código de retirada: ${s(o.delivery.pickupCode, 20)}` : "",
    tip ? `Gorjeta: ${toOdValue(tip, cur).toFixed(2).replace(".", ",")}` : "",
    s(o.extraInfo, 300),
  ].filter(Boolean).join(" · ");
  const phone = s(o.customer?.phone?.number, 30).replace(/[^\d+]/g, "");
  return {
    externalId: o.id,
    displayId,
    type,
    customerName: s(o.customer?.name, 80) || `Cliente ${appName}`,
    customerPhone: phone ? (phone.startsWith("+") ? phone : phone.length >= 12 ? `+${phone}` : `+55${phone}`) : null,
    customerDoc: s(o.customer?.documentNumber, 20).replace(/\D/g, "") || null,
    address,
    lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
    lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    notes: notes || null,
    items,
    subtotalMinor: subtotal,
    deliveryFeeMinor: fee,
    discountMinor: Math.min(merchantDiscount, subtotal + fee),
    totalMinor: orderAmount || Math.max(0, subtotal + fee - merchantDiscount),
    paymentMethod,
    prepaid,
    changeForMinor: changeFor,
    marketplaceDelivery: type === "DELIVERY" && o.delivery?.deliveredBy === "MARKETPLACE",
    flags: { sendPreparing: o.sendPreparing === true, sendDelivered: o.sendDelivered !== false, sendPickedUp: o.sendPickedUp === true },
  };
}

// ---------------------------------------------------------------- status
export type OdAction = { path: string; body?: Record<string, unknown> };

/**
 * Ações a enviar ao app quando o status muda NA GOWEB.
 * `confirmed` = já confirmamos o pedido no app (confirm é obrigatório antes de qualquer outro).
 */
export function actionsForStatus(
  to: OrderStatus,
  o: { externalId: string; number: string; type: OrderType; marketplaceDelivery: boolean; confirmed: boolean; prepMin: number; flags: MappedOrder["flags"] },
  now: Date,
): OdAction[] {
  const base = `/v1/orders/${encodeURIComponent(o.externalId)}`;
  const confirm: OdAction = { path: `${base}/confirm`, body: { createdAt: now.toISOString(), orderExternalCode: o.number, preparationTime: o.prepMin } };
  const pre = o.confirmed ? [] : [confirm];
  switch (to) {
    case "RECEIVED":
      return [];
    case "PREPARING":
      return [...pre, ...(o.flags.sendPreparing ? [{ path: `${base}/preparing` }] : [])];
    case "READY":
      return [...pre, { path: `${base}/readyForPickup` }];
    case "OUT_FOR_DELIVERY":
      // entregador do app: a loja só avisa que está pronto; entrega própria: despacha
      return o.marketplaceDelivery ? [...pre, { path: `${base}/readyForPickup` }] : [...pre, { path: `${base}/dispatch`, body: {} }];
    case "COMPLETED":
      if (o.type === "DELIVERY" && !o.marketplaceDelivery) return [...pre, ...(o.flags.sendDelivered ? [{ path: `${base}/delivered` }] : [])];
      if (o.type === "PICKUP") return [...pre, ...(o.flags.sendPickedUp ? [{ path: `${base}/pickedUp` }] : [])];
      return pre;
    case "CANCELLED":
      return [{ path: `${base}/requestCancellation`, body: { reason: "Cancelado pela loja", code: "INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT", mode: "MANUAL" } }];
  }
}

export const CANCEL_CODES: { code: string; pt: string }[] = [
  { code: "UNAVAILABLE_ITEM", pt: "Item indisponível" },
  { code: "RESTAURANT_WITHOUT_DELIVERY_PERSON", pt: "Sem entregador" },
  { code: "OUTSIDE_DELIVERY_HOURS", pt: "Fora do horário" },
  { code: "ORDER_OUTSIDE_THE_DELIVERY_AREA", pt: "Fora da área de entrega" },
  { code: "INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT", pt: "Problema na loja" },
  { code: "DUPLICATE_APPLICATION", pt: "Pedido duplicado" },
];

/** Evento recebido do app → o que fazer na GoWeb. */
export type EventEffect =
  | { kind: "create" }
  | { kind: "status"; status: OrderStatus }
  | { kind: "cancelRequest" } // cliente/app pede para cancelar: loja aceita ou recusa
  | { kind: "cancelDenied" }
  | { kind: "ignore" };

export function effectOfEvent(eventType: string): EventEffect {
  switch (eventType) {
    case "CREATED":
      return { kind: "create" };
    case "CANCELLED":
      return { kind: "status", status: "CANCELLED" };
    case "DISPATCHED":
    case "PICKED_UP":
      return { kind: "status", status: "OUT_FOR_DELIVERY" };
    case "DELIVERED":
    case "CONCLUDED":
      return { kind: "status", status: "COMPLETED" };
    case "ORDER_CANCELLATION_REQUEST":
      return { kind: "cancelRequest" };
    case "CANCELLATION_REQUEST_DENIED":
    case "CANCELLED_DENIED":
      return { kind: "cancelDenied" };
    default:
      return { kind: "ignore" };
  }
}

const RANK: Record<OrderStatus, number> = { RECEIVED: 0, PREPARING: 1, READY: 2, OUT_FOR_DELIVERY: 3, COMPLETED: 4, CANCELLED: 5 };
/** Evento do app só avança o pedido (nunca volta) — cancelamento sempre vale, salvo se já concluído. */
export function shouldApply(current: OrderStatus, next: OrderStatus): boolean {
  if (current === "CANCELLED" || current === next) return false;
  if (next === "CANCELLED") return current !== "COMPLETED";
  return RANK[next] > RANK[current];
}

// ---------------------------------------------------------------- assinatura
/** X-App-Signature: HMAC-SHA256 do corpo com o client secret (hex). */
export function odSign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function odVerify(body: string, header: string | null | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const got = header.trim().toLowerCase().replace(/^sha256=/, "");
  const want = odSign(body, secret);
  // alguns apps mandam em base64
  const wantB64 = createHmac("sha256", secret).update(body, "utf8").digest("base64");
  const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  return eq(got, want) || eq(header.trim(), wantB64);
}

// ---------------------------------------------------------------- endereço da loja
/** Quebra "Rua X, 123 - Bairro, Cidade - UF, 00000-000" no formato do padrão (melhor esforço; editável no painel). */
export function splitAddress(raw: string | null | undefined) {
  const a = String(raw ?? "");
  const cep = a.match(/\b\d{5}-?\d{3}\b/)?.[0] ?? "";
  const uf = a.match(/(?:-|,|\/)\s*([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/)?.[1] ?? "";
  const parts = a.replace(cep, "").split(/,|\s-\s/).map((x) => x.trim()).filter(Boolean);
  const street = parts[0] ?? "";
  const number = parts.find((p) => /^\d+[A-Za-z]?$|^s\/?n$/i.test(p)) ?? "S/N";
  const rest = parts.filter((p) => p !== street && p !== number && p !== uf);
  return { street, number, district: rest[0] ?? "", city: rest[1] ?? rest[0] ?? "", state: uf, postalCode: cep, complement: "" };
}
