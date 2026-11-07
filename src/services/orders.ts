import "server-only";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { randomOrderNumber } from "@/core/codes";
import { quoteDelivery } from "@/core/delivery";
import { changeDue, formatMoney, fromBase, type Rates } from "@/core/money";
import { checkCoupon, effectivePrice } from "@/core/intelligence";
import { couponError, findCoupon, markCartRecovered } from "./intelligence";
import { getRegion, isValidCpf, isValidE164, isValidName, tr } from "@/core/region";
import { parsePaymentConfig } from "@/core/tenant-config";
import { CURRENCIES, ORDER_TYPES, PAYMENT_METHODS, type Currency, type OrderStatus, type PaymentStatus } from "@/core/types";
import { getPaymentProvider } from "@/adapters/payments/registry";
import { getDistanceProvider } from "@/adapters/distance";
import { getExchangeRateProvider } from "@/adapters/exchange-rates";
import { maybeAutoIssueFiscal } from "./fiscal";
import { openCredentials } from "@/lib/security";
import { featureOn, normalizeSource, parseBirthday } from "@/core/growth";
import { hasModule } from "@/core/modules";
import { growthOf, onOrderCompleted, resolveReferral, upsertShopper } from "./growth";

export class OrderError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export const createOrderSchema = z.object({
  slug: z.string(),
  // Nome: só letras (com acentos), espaços, apóstrofo e hífen
  customerName: z.string().trim().min(2).max(60).refine(isValidName, "nombre inválido"),
  // Telefone em formato internacional E.164, com o tamanho exato do país (inclui DDD)
  customerPhone: z.string().trim().max(20).refine(isValidE164, "teléfono inválido").optional().nullable(),
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
  couponCode: z.string().trim().max(30).optional().nullable(),
  cartId: z.string().max(60).optional().nullable(),
  customerDoc: z.string().max(20).optional().nullable(), // CPF opcional (Brasil)
  // Crescimento
  source: z.string().max(40).optional().nullable(),
  refCode: z.string().max(20).optional().nullable(),
  marketingOptIn: z.boolean().optional().nullable(),
  birthday: z.string().max(10).optional().nullable(),
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
    roundStep: tenant.currency === "PYG" ? 500 : 50,
    freeOverPyg: tenant.deliveryFreeOverPyg,
  });
}

export async function createOrder(raw: unknown): Promise<CreateOrderResult> {
  const input = createOrderSchema.parse(raw);
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, input.slug) });
  if (!tenant) throw new OrderError("NOT_FOUND", "Local no encontrado");
  const T = tr(getRegion(tenant.country).locale);
  const base = tenant.currency as Currency;
  if (tenant.suspended) throw new OrderError("SUSPENDED", T("El local no está disponible en este momento", "O estabelecimento não está disponível no momento"));
  if (!tenant.isOpen) throw new OrderError("CLOSED", T("El local está cerrado en este momento", "O estabelecimento está fechado no momento"));

  if (input.type === "DINE_IN" && (!tenant.acceptsDineIn || !hasModule(tenant, "mesas"))) throw new OrderError("TYPE", T("No acepta pedidos en mesa", "Não aceita pedidos na mesa"));
  if (input.type === "PICKUP" && !tenant.acceptsPickup) throw new OrderError("TYPE", T("No acepta retiro en local", "Não aceita retirada no local"));
  if (input.type === "DELIVERY" && (!tenant.acceptsDelivery || !hasModule(tenant, "delivery"))) throw new OrderError("TYPE", T("No hace delivery", "Não faz delivery"));

  // ---- Mesa
  let table: schema.DiningTable | undefined;
  if (input.type === "DINE_IN") {
    if (!input.tableCode) throw new OrderError("TABLE", T("Escaneá el QR de tu mesa", "Escaneie o QR da sua mesa"));
    table = await db.query.diningTables.findFirst({
      where: and(
        eq(schema.diningTables.tenantId, tenant.id),
        eq(schema.diningTables.code, input.tableCode.toUpperCase()),
        eq(schema.diningTables.active, true),
      ),
    });
    if (!table) throw new OrderError("TABLE", T("Mesa no encontrada", "Mesa não encontrada"));
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
    if (!p) throw new OrderError("PRODUCT", T("Un producto ya no está disponible", "Um produto não está mais disponível"));
    qtyByProduct.set(p.id, (qtyByProduct.get(p.id) ?? 0) + i.quantity);
    if (p.durationMin) throw new OrderError("PRODUCT", T(`${p.name} se agenda, no se pide`, `${p.name} é agendado, não pedido`));
    // preço efetivo: oferta relâmpago ativa (GoInteligence) ou preço normal
    const unit = tenant.tier === "pro" && hasModule(tenant, "marketing") ? effectivePrice(p) : p.pricePyg;
    return { product: p, unit, quantity: i.quantity, notes: i.notes ?? null };
  });
  for (const [pid, qty] of qtyByProduct) {
    const p = byId.get(pid)!;
    if (p.trackStock && p.stock < qty) throw new OrderError("STOCK", T(`Sin stock suficiente: ${p.name}`, `Sem estoque suficiente: ${p.name}`));
  }
  const subtotalPyg = lines.reduce((s, l) => s + l.unit * l.quantity, 0);

  // ---- Cupom (GoInteligence) — validado e calculado no servidor
  let discountPyg = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode && tenant.tier === "pro") {
    const c = await findCoupon(tenant.id, input.couponCode);
    const chk = c ? checkCoupon(c, subtotalPyg) : ({ ok: false, reason: "INACTIVE" } as const);
    if (!chk.ok || !c) throw new OrderError("COUPON", couponError(chk.ok ? "INACTIVE" : chk.reason, getRegion(tenant.country).locale, c ? formatMoney(c.minSubtotal, tenant.currency as Currency) : undefined));
    // cupom pessoal (recompensa): só vale para o cliente dono dele
    if (c.shopperId) {
      const owner = await db.query.shoppers.findFirst({ where: eq(schema.shoppers.id, c.shopperId), columns: { phone: true } });
      if (!owner || owner.phone !== input.customerPhone)
        throw new OrderError("COUPON", T("Este cupón es personal: usá el mismo WhatsApp que lo recibió", "Este cupom é pessoal: use o mesmo WhatsApp que recebeu o cupom"));
    }
    discountPyg = chk.discount;
    couponId = c.id;
    couponCode = c.code;
  }

  // ---- Indique e ganhe: desconto na primeira compra de quem foi indicado (não soma com cupom)
  let referrerShopperId: string | null = null;
  if (!couponId && input.refCode) {
    const r = await resolveReferral(tenant, input.refCode, input.customerPhone);
    if (r) {
      discountPyg = Math.floor((subtotalPyg * r.pct) / 100);
      referrerShopperId = r.referrer.id;
    }
  }
  const growth = growthOf(tenant);
  const birthday = featureOn(growth.cfg, "birthday", growth.pro) ? parseBirthday(input.birthday) : null;
  const source = input.type === "DINE_IN" ? "mesa" : referrerShopperId ? "indicacao" : normalizeSource(input.source);

  // ---- Delivery (recalculado no servidor)
  let deliveryFeePyg = 0;
  let distanceKm: number | null = null;
  if (input.type === "DELIVERY") {
    if (!input.address) throw new OrderError("ADDRESS", T("Indicá la dirección de entrega", "Informe o endereço de entrega"));
    if (input.lat == null || input.lng == null) throw new OrderError("ADDRESS", T("Compartí tu ubicación para calcular el delivery", "Compartilhe sua localização para calcular a entrega"));
    const q = await quoteDeliveryForTenant(tenant.slug, input.lat, input.lng, subtotalPyg);
    if (!q.ok) {
      if (q.reason === "OUT_OF_RANGE") throw new OrderError("RANGE", T("Tu dirección está fuera del área de delivery", "Seu endereço está fora da área de entrega"));
      if (q.reason === "NO_STORE_LOCATION") {
        deliveryFeePyg = tenant.deliveryBaseFeePyg; // local sem coordenadas: cobra taxa base
      } else throw new OrderError("ADDRESS", T("No pudimos calcular el delivery", "Não conseguimos calcular a entrega"));
    } else {
      deliveryFeePyg = q.feePyg;
      distanceKm = q.distanceKm;
    }
  }
  const totalPyg = subtotalPyg - discountPyg + deliveryFeePyg;

  // ---- CPF na nota (opcional, só Brasil)
  const docDigits = (input.customerDoc ?? "").replace(/\D/g, "");
  let customerDoc: string | null = null;
  if (docDigits && tenant.country === "BR") {
    if (!isValidCpf(docDigits)) throw new OrderError("DOC", T("CPF inválido", "CPF inválido — confira os números ou deixe em branco"));
    customerDoc = docDigits;
  }

  // ---- Pagamento
  const payCfg = parsePaymentConfig(tenant.paymentConfig);
  const option = payCfg.options.find((o) => o.enabled && o.method === input.paymentMethod);
  if (!option) throw new OrderError("PAYMENT", T("Medio de pago no disponible", "Forma de pagamento indisponível"));
  if (!option.currencies.includes(input.payCurrency)) throw new OrderError("PAYMENT", T("Moneda no aceptada para este medio", "Moeda não aceita para esta forma de pagamento"));
  const provider = getPaymentProvider(option.provider);
  if (!provider.available || (provider.id === "mock_online" && !tenant.demo)) throw new OrderError("PAYMENT", T("Medio de pago no disponible", "Forma de pagamento indisponível"));

  const rates: Rates = await getExchangeRateProvider().getRates(tenant);
  const exchangeRate = input.payCurrency === base ? 1 : rates[input.payCurrency];
  const payAmountMinor = fromBase(totalPyg, base, input.payCurrency, rates);

  let cashTenderedMinor: number | null = null;
  let change: number | null = null;
  if (input.paymentMethod === "CASH" && input.cashTenderedMinor) {
    if (input.cashTenderedMinor < payAmountMinor) throw new OrderError("CASH", T("El monto en efectivo es menor al total", "O valor em dinheiro é menor que o total"));
    cashTenderedMinor = input.cashTenderedMinor;
    change = changeDue(totalPyg, cashTenderedMinor, input.payCurrency, base, rates);
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
    if (!number) throw new OrderError("NUMBER", T("Intentá de nuevo", "Tente novamente"));

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
        customerDoc,
        type: input.type,
        tableId: table?.id ?? null,
        tableLabel: table?.label ?? null,
        address: input.type === "DELIVERY" ? input.address : null,
        lat: input.type === "DELIVERY" ? input.lat : null,
        lng: input.type === "DELIVERY" ? input.lng : null,
        distanceKm,
        notes: input.notes ?? null,
        subtotalPyg,
        discountPyg,
        couponCode,
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
        source,
        referrerShopperId,
      })
      .returning();

    // carteira de clientes: todo pedido com WhatsApp vira (ou atualiza) um cliente da loja
    if (input.customerPhone) {
      const shopper = await upsertShopper(tx, tenant.id, {
        phone: input.customerPhone,
        name: input.customerName,
        optIn: input.marketingOptIn ?? null,
        birthday,
        referredBy: referrerShopperId,
      });
      await tx.update(schema.orders).set({ shopperId: shopper.id }).where(eq(schema.orders.id, o.id));
    }

    await tx.insert(schema.orderItems).values(
      lines.map((l) => ({
        orderId: o.id,
        productId: l.product.id,
        name: l.product.name,
        unitPricePyg: l.unit,
        quantity: l.quantity,
        notes: l.notes,
      })),
    );

    if (couponId) {
      // Atômico: só incrementa se ainda houver usos (evita estourar o limite com pedidos simultâneos)
      const used = await tx
        .update(schema.coupons)
        .set({ uses: sql`${schema.coupons.uses} + 1` })
        .where(and(eq(schema.coupons.id, couponId), sql`(${schema.coupons.maxUses} IS NULL OR ${schema.coupons.maxUses} = 0 OR ${schema.coupons.uses} < ${schema.coupons.maxUses})`))
        .returning({ id: schema.coupons.id });
      if (!used.length) throw new OrderError("COUPON", T("Este cupón ya alcanzó el límite de usos", "Este cupom já atingiu o limite de usos"));
    }

    for (const [pid, qty] of qtyByProduct) {
      const p = byId.get(pid)!;
      if (!p.trackStock) continue;
      // baixa condicional: evita estoque negativo em pedidos simultâneos
      const updated = await tx
        .update(schema.products)
        .set({ stock: sql`${schema.products.stock} - ${qty}` })
        .where(and(eq(schema.products.id, pid), gte(schema.products.stock, qty)))
        .returning({ id: schema.products.id });
      if (updated.length === 0) throw new OrderError("STOCK", T(`Sin stock suficiente: ${p.name}`, `Sem estoque suficiente: ${p.name}`));
      await tx.insert(schema.stockMovements).values({ tenantId: tenant.id, productId: pid, delta: -qty, reason: "ORDER", orderId: o.id });
    }
    return o;
  });

  // ---- Inicia pagamento no adapter (fora da transação: pode chamar API externa)
  const returnUrl = `${appUrl()}/${tenant.slug}/pedido/${order.id}`;
  let result;
  try {
    result = await provider.createPayment({
    tenantId: tenant.id,
    method: input.paymentMethod,
    locale: getRegion(tenant.country).locale,
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
      ...openCredentials(payCfg.credentials[provider.id]),
      ...(payCfg.pixKey ? { pixKey: payCfg.pixKey } : {}),
      ...(payCfg.bankInfo ? { bankInfo: payCfg.bankInfo } : {}),
    },
  });
  } catch (e) {
    // gateway fora/mal configurado: cancela o pedido (devolve o estoque) e avisa o cliente
    console.error("[createPayment]", provider.id, e);
    await setOrderStatus(tenant.id, order.id, "CANCELLED").catch(() => {});
    throw new OrderError(
      "PAYMENT",
      T("No pudimos iniciar el pago online. Elegí otro medio de pago.", "Não conseguimos iniciar o pagamento online. Escolha outra forma de pagamento."),
    );
  }
  if (result.providerRef || result.status !== "PENDING") {
    await db
      .update(schema.orders)
      .set({ paymentRef: result.providerRef ?? null, paymentStatus: result.status })
      .where(eq(schema.orders.id, order.id));
  }

  if (input.cartId) await markCartRecovered(tenant.id, input.cartId, order.id).catch(() => {});

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
  // recompensas (fidelidade, indicação, avaliação) só quando o pedido é concluído
  if (status === "COMPLETED") await onOrderCompleted(tenantId, orderId).catch((e) => console.error("[growth]", e));
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
