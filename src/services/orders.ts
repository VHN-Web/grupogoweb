import "server-only";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { randomOrderNumber } from "@/core/codes";
import { quoteDelivery } from "@/core/delivery";
import { changeDuePyg, pygToMinor, type Rates } from "@/core/money";
import { parsePaymentConfig } from "@/core/tenant-config";
import { CURRENCIES, ORDER_TYPES, PAYMENT_METHODS, type OrderStatus, type PaymentStatus } from "@/core/types";
import { getPaymentProvider } from "@/adapters/payments/registry";
import { getDistanceProvider } from "@/adapters/distance";
import { getExchangeRateProvider } from "@/adapters/exchange-rates";
import { maybeAutoIssueFiscal } from "./fiscal";

export class OrderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export const createOrderSchema = z.object({
  slug: z.string(),
  customerName: z.string().trim().min(2).max(60),
  customerPhone: z.string().trim().max(30).optional().nullable(),
  type: z.enum(ORDER_TYPES),
  tableCode: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(200).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().max(140).optional().nullable(),
      }),
    )
    .min(1)
    .max(60),
  paymentMethod: z.enum(PAYMENT_METHODS),
  payCurrency: z.enum(CURRENCIES),
  cashTenderedMinor: z.number().int().min(0).optional().nullable(),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type CreateOrderResult = {
  orderId: string;
  number: string;
  redirectUrl?: string;
  instructions?: string;
};

function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Cotação de delivery (usada pelo checkout para mostrar a taxa antes de confirmar). */
export async function quoteDeliveryForTenant(slug: string, lat: number, lng: number, subtotalPyg: number) {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) throw new OrderError("NOT_FOUND", "Local no encontrado");
  if (tenant.lat == null || tenant.lng == null) return { ok: false as const, reason: "NO_STORE_LOCATION" as const };
  const km = await getDistanceProvider().distanceKm({ lat: tenant.lat, lng: tenant.lng }, { lat, lng });
  return quoteDelivery(km, subtotalPyg, {
    baseFeePyg: tenant.deliveryBaseFeePyg,
    perKmPyg: tenant.deliveryPerKmPyg,
    maxKm: tenant.deliveryMaxKm,
    freeOverPyg: tenant.deliveryFreeOverPyg,
  });
}

export async function createOrder(raw: unknown): Promise<CreateOrderResult> {
  const input = createOrderSchema.parse(raw);
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, input.slug) });
  if (!tenant) throw new OrderError("NOT_FOUND", "Local no encontrado");
  if (tenant.suspended) throw new OrderError("SUSPENDED", "El local no está disponible en este momento");
  if (!tenant.isOpen) throw new OrderError("CLOSED", "El local está cerrado en este momento");

  if (input.type === "DINE_IN" && !tenant.acceptsDineIn) throw new OrderError("TYPE", "No acepta pedidos en mesa");
  if (input.type === "PICKUP" && !tenant.acceptsPickup) throw new OrderError("TYPE", "No acepta retiro en local");
  if (input.type === "DELIVERY" && !tenant.acceptsDelivery) throw new OrderError("TYPE", "No hace delivery");

  // ---- Mesa
  let table: schema.DiningTable | undefined;
  if (input.type === "DINE_IN") {
    if (!input.tableCode) throw new OrderError("TABLE", "Escaneá el QR de tu mesa");
    table = await db.query.diningTables.findFirst({
      where: and(
        eq(schema.diningTables.tenantId, tenant.id),
        eq(schema.diningTables.code, input.tableCode.toUpperCase()),
        eq(schema.diningTables.active, true),
      ),
    });
    if (!table) throw new OrderError("TABLE", "Mesa no encontrada");
  }

  // ---- Itens (preço SEMPRE recalculado no servidor)
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const prods = await db.query.products.findMany({
    where: and(eq(schema.products.tenantId, tenant.id), inArray(schema.products.id, ids), eq(schema.products.active, true)),
  });
  const byId = new Map(prods.map((p) => [p.id, p]));
  const qtyByProduct = new Map<string, number>();
  const lines = input.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new OrderError("PRODUCT", "Un producto ya no está disponible");
    qtyByProduct.set(p.id, (qtyByProduct.get(p.id) ?? 0) + i.quantity);
    return { product: p, quantity: i.quantity, notes: i.notes ?? null };
  });
  for (const [pid, qty] of qtyByProduct) {
    const p = byId.get(pid)!;
    if (p.trackStock && p.stock < qty) throw new OrderError("STOCK", `Sin stock suficiente: ${p.name}`);
  }
  const subtotalPyg = lines.reduce((s, l) => s + l.product.pricePyg * l.quantity, 0);

  // ---- Delivery (recalculado no servidor)
  let deliveryFeePyg = 0;
  let distanceKm: number | null = null;
  if (input.type === "DELIVERY") {
    if (!input.address) throw new OrderError("ADDRESS", "Indicá la dirección de entrega");
    if (input.lat == null || input.lng == null) throw new OrderError("ADDRESS", "Compartí tu ubicación para calcular el delivery");
    const q = await quoteDeliveryForTenant(tenant.slug, input.lat, input.lng, subtotalPyg);
    if (!q.ok) {
      if (q.reason === "OUT_OF_RANGE") throw new OrderError("RANGE", "Tu dirección está fuera del área de delivery");
      if (q.reason === "NO_STORE_LOCATION") {
        deliveryFeePyg = tenant.deliveryBaseFeePyg; // local sem coordenadas: cobra taxa base
      } else throw new OrderError("ADDRESS", "No pudimos calcular el delivery");
    } else {
      deliveryFeePyg = q.feePyg;
      distanceKm = q.distanceKm;
    }
  }
  const totalPyg = subtotalPyg + deliveryFeePyg;

  // ---- Pagamento
  const payCfg = parsePaymentConfig(tenant.paymentConfig);
  const option = payCfg.options.find((o) => o.enabled && o.method === input.paymentMethod);
  if (!option) throw new OrderError("PAYMENT", "Medio de pago no disponible");
  if (!option.currencies.includes(input.payCurrency)) throw new OrderError("PAYMENT", "Moneda no aceptada para este medio");
  const provider = getPaymentProvider(option.provider);
  if (!provider.available) throw new OrderError("PAYMENT", "Medio de pago no disponible");

  const rates: Rates = await getExchangeRateProvider().getRates(tenant);
  const exchangeRate = input.payCurrency === "PYG" ? 1 : rates[input.payCurrency];
  const payAmountMinor = pygToMinor(totalPyg, input.payCurrency, rates);

  let cashTenderedMinor: number | null = null;
  let change: number | null = null;
  if (input.paymentMethod === "CASH" && input.cashTenderedMinor) {
    if (input.cashTenderedMinor < payAmountMinor) throw new OrderError("CASH", "El monto en efectivo es menor al total");
    cashTenderedMinor = input.cashTenderedMinor;
    change = changeDuePyg(totalPyg, cashTenderedMinor, input.payCurrency, rates);
  }

  // ---- Persistência atômica (pedido + itens + baixa de estoque)
  const order = await db.transaction(async (tx) => {
    // número curto único no dia
    const today = startOfToday();
    let number = "";
    for (let attempt = 0; attempt < 15; attempt++) {
      const candidate = randomOrderNumber();
      const clash = await tx.query.orders.findFirst({
        where: and(eq(schema.orders.tenantId, tenant.id), eq(schema.orders.number, candidate), gte(schema.orders.createdAt, today)),
        columns: { id: true },
      });
      if (!clash) {
        number = candidate;
        break;
      }
    }
    if (!number) throw new OrderError("NUMBER", "Intentá de nuevo");

    const openSession = await tx.query.cashSessions.findFirst({
      where: and(eq(schema.cashSessions.tenantId, tenant.id), isNull(schema.cashSessions.closedAt)),
      columns: { id: true },
    });

    const [o] = await tx
      .insert(schema.orders)
      .values({
        tenantId: tenant.id,
        number,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        type: input.type,
        tableId: table?.id ?? null,
        tableLabel: table?.label ?? null,
        address: input.type === "DELIVERY" ? input.address : null,
        lat: input.type === "DELIVERY" ? input.lat : null,
        lng: input.type === "DELIVERY" ? input.lng : null,
        distanceKm,
        notes: input.notes ?? null,
        subtotalPyg,
        deliveryFeePyg,
        totalPyg,
        paymentMethod: input.paymentMethod,
        paymentProvider: provider.id,
        payCurrency: input.payCurrency,
        exchangeRate,
        payAmountMinor,
        cashTenderedMinor,
        changeDuePyg: change,
        cashSessionId: openSession?.id ?? null,
      })
      .returning();

    await tx.insert(schema.orderItems).values(
      lines.map((l) => ({
        orderId: o.id,
        productId: l.product.id,
        name: l.product.name,
        unitPricePyg: l.product.pricePyg,
        quantity: l.quantity,
        notes: l.notes,
      })),
    );

    for (const [pid, qty] of qtyByProduct) {
      const p = byId.get(pid)!;
      if (!p.trackStock) continue;
      // baixa condicional: evita estoque negativo em pedidos simultâneos
      const updated = await tx
        .update(schema.products)
        .set({ stock: sql`${schema.products.stock} - ${qty}` })
        .where(and(eq(schema.products.id, pid), gte(schema.products.stock, qty)))
        .returning({ id: schema.products.id });
      if (updated.length === 0) throw new OrderError("STOCK", `Sin stock suficiente: ${p.name}`);
      await tx.insert(schema.stockMovements).values({ tenantId: tenant.id, productId: pid, delta: -qty, reason: "ORDER", orderId: o.id });
    }
    return o;
  });

  // ---- Inicia pagamento no adapter (fora da transação: pode chamar API externa)
  const returnUrl = `${appUrl()}/${tenant.slug}/pedido/${order.id}`;
  const result = await provider.createPayment({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    orderId: order.id,
    orderNumber: order.number,
    amountMinor: payAmountMinor,
    currency: input.payCurrency,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    returnUrl,
    webhookUrl: `${appUrl()}/api/payments/${provider.id}/webhook?t=${tenant.slug}`,
    credentials: {
      ...(payCfg.credentials[provider.id] ?? {}),
      ...(payCfg.pixKey ? { pixKey: payCfg.pixKey } : {}),
      ...(payCfg.bankInfo ? { bankInfo: payCfg.bankInfo } : {}),
    },
  });
  if (result.providerRef || result.status !== "PENDING") {
    await db
      .update(schema.orders)
      .set({ paymentRef: result.providerRef ?? null, paymentStatus: result.status })
      .where(eq(schema.orders.id, order.id));
  }

  return { orderId: order.id, number: order.number, redirectUrl: result.redirectUrl, instructions: result.instructions };
}

export async function getOrderWithItems(tenantId: string, orderId: string) {
  return db.query.orders.findFirst({
    where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)),
    with: { items: true },
  });
}

export async function setOrderStatus(tenantId: string, orderId: string, status: OrderStatus) {
  const order = await getOrderWithItems(tenantId, orderId);
  if (!order) throw new OrderError("NOT_FOUND", "Pedido não encontrado");
  if (order.status === "CANCELLED") throw new OrderError("STATE", "Pedido cancelado");

  await db.transaction(async (tx) => {
    if (status === "CANCELLED") {
      // devolve o estoque que foi baixado por este pedido
      const moves = await tx.query.stockMovements.findMany({
        where: and(eq(schema.stockMovements.orderId, orderId), eq(schema.stockMovements.reason, "ORDER")),
      });
      for (const m of moves) {
        await tx
          .update(schema.products)
          .set({ stock: sql`${schema.products.stock} + ${-m.delta}` })
          .where(eq(schema.products.id, m.productId));
        await tx.insert(schema.stockMovements).values({
          tenantId,
          productId: m.productId,
          delta: -m.delta,
          reason: "ORDER_CANCEL",
          orderId,
        });
      }
    }
    await tx.update(schema.orders).set({ status, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
  });
}

export async function setPaymentStatus(tenantId: string, orderId: string, status: PaymentStatus, ref?: string) {
  const [o] = await db
    .update(schema.orders)
    .set({ paymentStatus: status, updatedAt: new Date(), ...(ref ? { paymentRef: ref } : {}) })
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
    .returning();
  if (o && status === "PAID") {
    // vincula ao caixa aberto se ainda não estiver
    if (!o.cashSessionId) {
      const s = await db.query.cashSessions.findFirst({
        where: and(eq(schema.cashSessions.tenantId, tenantId), isNull(schema.cashSessions.closedAt)),
        columns: { id: true },
      });
      if (s) await db.update(schema.orders).set({ cashSessionId: s.id }).where(eq(schema.orders.id, o.id));
    }
    await maybeAutoIssueFiscal(tenantId, o.id);
  }
  return o;
}
