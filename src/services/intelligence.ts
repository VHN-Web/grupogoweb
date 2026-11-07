import "server-only";
// Serviços do GoInteligence (com banco): sugestões, cupons, carrinhos abandonados, agenda e relatório de caixa.
import { and, desc, eq, gt, gte, inArray, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { buildSuggestions, checkCoupon, freeSlots, normalizeCode, parseBookingConfig, waLink, type CouponCheck } from "@/core/intelligence";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { getLabels } from "@/core/types";
import { getRegion, tr, formatPhone } from "@/core/region";
import { sendEmail, sendWhatsApp } from "@/adapters/notify";
import { appUrl, tenantPublicUrl } from "@/lib/urls";
import { summarizeSession } from "./cash";

export const isPro = (t: { tier: string }) => t.tier === "pro";

// ---------------------------------------------------------------- sugestões
export async function tenantSuggestions(tenantId: string, products: { id: string; categoryId: string | null; available: boolean; service: boolean }[]) {
  const cats = await db.query.categories.findMany({ where: eq(schema.categories.tenantId, tenantId) });
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const since = new Date(Date.now() - 120 * 864e5);
  const rows = await db
    .select({ orderId: schema.orderItems.orderId, productId: schema.orderItems.productId })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(eq(schema.orders.tenantId, tenantId), gt(schema.orders.createdAt, since), ne(schema.orders.status, "CANCELLED")))
    .orderBy(desc(schema.orders.createdAt))
    .limit(6000);
  const byOrder = new Map<string, string[]>();
  for (const r of rows) if (r.productId) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r.productId]);
  return buildSuggestions(
    products.map((p) => ({ ...p, categoryName: p.categoryId ? (catName.get(p.categoryId) ?? null) : null })),
    [...byOrder.values()],
  );
}

// ---------------------------------------------------------------- cupons
export async function findCoupon(tenantId: string, code: string) {
  const c = normalizeCode(code);
  if (!c) return null;
  return db.query.coupons.findFirst({ where: and(eq(schema.coupons.tenantId, tenantId), eq(schema.coupons.code, c)) });
}

export async function validateCoupon(tenant: Tenant, code: string, subtotal: number): Promise<CouponCheck & { code?: string }> {
  if (!isPro(tenant)) return { ok: false, reason: "INACTIVE" };
  const c = await findCoupon(tenant.id, code);
  if (!c) return { ok: false, reason: "INACTIVE" };
  return { ...checkCoupon(c, subtotal), code: c.code };
}

export function couponError(reason: string, locale: "es" | "pt", minSubtotal?: string) {
  const T = tr(locale);
  switch (reason) {
    case "EXPIRED":
      return T("Este cupón venció.", "Este cupom expirou.");
    case "EXHAUSTED":
      return T("Este cupón ya se usó el máximo de veces.", "Este cupom já atingiu o limite de usos.");
    case "MIN_SUBTOTAL":
      return T(`Pedido mínimo para este cupón: ${minSubtotal ?? ""}`, `Pedido mínimo para este cupom: ${minSubtotal ?? ""}`);
    default:
      return T("Cupón inválido.", "Cupom inválido.");
  }
}

// ---------------------------------------------------------------- carrinhos abandonados
export const ABANDON_AFTER_MIN = 30;

export async function saveCart(tenant: Tenant, input: { cartId?: string | null; name?: string | null; phone: string; items: { productId: string; quantity: number }[] }) {
  const prods = await db.query.products.findMany({
    where: and(eq(schema.products.tenantId, tenant.id), inArray(schema.products.id, input.items.map((i) => i.productId))),
  });
  const items = input.items
    .map((i) => {
      const p = prods.find((x) => x.id === i.productId);
      return p ? { productId: p.id, name: p.name, quantity: Math.max(1, Math.min(99, Math.floor(i.quantity))), unitPricePyg: p.pricePyg } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return null;
  const subtotalPyg = items.reduce((s, i) => s + i.unitPricePyg * i.quantity, 0);
  if (input.cartId) {
    const existing = await db.query.carts.findFirst({ where: and(eq(schema.carts.id, input.cartId), eq(schema.carts.tenantId, tenant.id)) });
    if (existing && existing.status !== "RECOVERED") {
      await db
        .update(schema.carts)
        .set({ items: JSON.stringify(items), subtotalPyg, customerName: input.name ?? existing.customerName, customerPhone: input.phone, updatedAt: new Date() })
        .where(eq(schema.carts.id, existing.id));
      return existing.id;
    }
  }
  const [c] = await db
    .insert(schema.carts)
    .values({ tenantId: tenant.id, customerName: input.name ?? null, customerPhone: input.phone, items: JSON.stringify(items), subtotalPyg })
    .returning({ id: schema.carts.id });
  return c.id;
}

export async function markCartRecovered(tenantId: string, cartId: string, orderId: string) {
  await db
    .update(schema.carts)
    .set({ status: "RECOVERED", recoveredOrderId: orderId, updatedAt: new Date() })
    .where(and(eq(schema.carts.id, cartId), eq(schema.carts.tenantId, tenantId)));
}

export async function listAbandonedCarts(tenantId: string) {
  const cutoff = new Date(Date.now() - ABANDON_AFTER_MIN * 60000);
  const since = new Date(Date.now() - 14 * 864e5);
  return db.query.carts.findMany({
    where: and(eq(schema.carts.tenantId, tenantId), lt(schema.carts.updatedAt, cutoff), gt(schema.carts.updatedAt, since)),
    orderBy: desc(schema.carts.updatedAt),
    limit: 100,
  });
}

/** Mensagem para o cliente final recuperar o carrinho (com cupom opcional). */
export function recoveryMessage(t: Tenant, cart: { id: string; customerName: string | null }, couponCode?: string | null, couponLabel?: string) {
  const T = tr(getRegion(t.country).locale);
  const link = `${tenantPublicUrl(t)}?carrinho=${cart.id}${couponCode ? `&cupom=${encodeURIComponent(couponCode)}` : ""}`;
  const hi = cart.customerName ? T(`¡Hola ${cart.customerName}! `, `Olá, ${cart.customerName}! `) : T("¡Hola! ", "Olá! ");
  return (
    hi +
    T(`Vimos que dejaste un pedido sin terminar en ${t.name}. `, `Vimos que você deixou um pedido sem finalizar na ${t.name}. `) +
    (couponCode ? T(`Te regalamos el cupón *${couponCode}*${couponLabel ? ` (${couponLabel})` : ""}. `, `Separamos o cupom *${couponCode}*${couponLabel ? ` (${couponLabel})` : ""} para você. `) : "") +
    T(`Terminá tu pedido aquí: ${link}`, `Finalize seu pedido aqui: ${link}`)
  );
}

/**
 * Avisa o lojista (WhatsApp/e-mail configurados em "Relatórios") sobre carrinhos abandonados novos.
 * Chamado ao abrir o painel — sem depender de cron frequente.
 */
export async function notifyOwnerAbandoned(t: Tenant) {
  if (!isPro(t)) return 0;
  const carts = (await listAbandonedCarts(t.id)).filter((c) => c.status === "OPEN" && !c.ownerNotifiedAt);
  if (!carts.length) return 0;
  const T = tr(getRegion(t.country).locale);
  const money = (v: number) => formatMoney(v, t.currency as Currency);
  const text =
    T(`${carts.length} carrito(s) abandonado(s) en ${t.name}:\n`, `${carts.length} carrinho(s) abandonado(s) na ${t.name}:\n`) +
    carts
      .slice(0, 10)
      .map((c) => `• ${c.customerName ?? "—"} (${formatPhone(c.customerPhone)}) — ${money(c.subtotalPyg)}`)
      .join("\n") +
    T(`\n\nEnviá un cupón para recuperarlos: ${appUrl()}/painel/${t.slug}/marketing`, `\n\nEnvie um cupom para recuperá-los: ${appUrl()}/painel/${t.slug}/marketing`);
  const to = t.reportTo || t.whatsapp || t.phone;
  if (to && !t.demo) {
    if (t.reportChannel === "email" && to.includes("@")) await sendEmail(to, T("Carritos abandonados", "Carrinhos abandonados"), text);
    else if (/^\+\d+$/.test(to)) await sendWhatsApp(to, text);
  }
  await db
    .update(schema.carts)
    .set({ ownerNotifiedAt: new Date() })
    .where(inArray(schema.carts.id, carts.map((c) => c.id)));
  return carts.length;
}

// ---------------------------------------------------------------- agenda
export async function slotsFor(t: Tenant, productId: string, date: string) {
  const cfg = parseBookingConfig(t.bookingConfig);
  const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, productId), eq(schema.products.tenantId, t.id)) });
  if (!cfg.enabled || !p?.durationMin || !isPro(t)) return [];
  const region = getRegion(t.country);
  const dayStart = new Date(`${date}T00:00:00Z`);
  const busy = await db.query.appointments.findMany({
    where: and(
      eq(schema.appointments.tenantId, t.id),
      gte(schema.appointments.startsAt, new Date(dayStart.getTime() - 864e5)),
      lt(schema.appointments.startsAt, new Date(dayStart.getTime() + 2 * 864e5)),
      inArray(schema.appointments.status, ["PENDING", "CONFIRMED"]),
    ),
  });
  return freeSlots(cfg, date, p.durationMin, busy, region.timeZone);
}

export function appointmentConfirmMessage(t: Tenant, a: { customerName: string; serviceName: string; startsAt: Date }) {
  const region = getRegion(t.country);
  const T = tr(region.locale);
  const when = new Intl.DateTimeFormat(region.intlLocale, { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: region.timeZone }).format(a.startsAt);
  return T(
    `¡Hola ${a.customerName}! Tu turno en ${t.name} está CONFIRMADO\n${a.serviceName} — ${when}\n${t.address ? `${t.address}\n` : ""}Si no podés venir, avisanos por aquí.`,
    `Olá, ${a.customerName}! Seu horário na ${t.name} está CONFIRMADO\n${a.serviceName} — ${when}\n${t.address ? `${t.address}\n` : ""}Se não puder vir, avise por aqui.`,
  );
}

// ---------------------------------------------------------------- relatório de fechamento de caixa
export async function cashReport(t: Tenant, sessionId: string) {
  const region = getRegion(t.country);
  const T = tr(region.locale);
  const L = getLabels(region.locale);
  const base = t.currency as Currency;
  const money = (v: number) => formatMoney(v, base);
  const session = await db.query.cashSessions.findFirst({ where: and(eq(schema.cashSessions.id, sessionId), eq(schema.cashSessions.tenantId, t.id)) });
  if (!session) return null;
  const s = await summarizeSession(t.id, sessionId, base);
  const orders = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, t.id), eq(schema.orders.cashSessionId, sessionId), ne(schema.orders.status, "CANCELLED")),
    with: { items: true },
  });
  const paid = orders.filter((o) => o.paymentStatus === "PAID");
  const qty = new Map<string, number>();
  for (const o of paid) for (const i of o.items) qty.set(i.name, (qty.get(i.name) ?? 0) + i.quantity);
  const top = [...qty.entries()].sort((a, b) => b[1] - a[1])[0];
  const channels = new Map<string, number>();
  for (const o of paid) channels.set(o.type, (channels.get(o.type) ?? 0) + 1);
  const topChannel = [...channels.entries()].sort((a, b) => b[1] - a[1])[0];
  const avgTicket = paid.length ? Math.round(s.paidTotalPyg / paid.length) : 0;
  const stock = await db.query.products.findMany({
    where: and(eq(schema.products.tenantId, t.id), eq(schema.products.trackStock, true), eq(schema.products.active, true)),
  });
  stock.sort((a, b) => a.stock - b.stock);
  const fmt = new Intl.DateTimeFormat(region.intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: region.timeZone });
  const lines = [
    T(`Cierre de caja — ${t.name}`, `Fechamento de caixa — ${t.name}`),
    `${fmt.format(session.openedAt)} → ${session.closedAt ? fmt.format(session.closedAt) : T("abierta", "aberto")}`,
    "",
    `${T("Total facturado", "Total faturado")}: ${money(s.paidTotalPyg)}`,
    `${T("Pedidos pagados", "Pedidos pagos")}: ${paid.length}`,
    `${T("Ticket promedio", "Ticket médio")}: ${money(avgTicket)}`,
    `${T("Producto más vendido", "Produto mais vendido")}: ${top ? `${top[0]} (${top[1]} un.)` : "—"}`,
    `${T("Canal más usado", "Canal mais usado")}: ${topChannel ? `${L.orderType[topChannel[0] as keyof typeof L.orderType]} (${topChannel[1]})` : "—"}`,
    `${T("Esperado en caja", "Esperado no caixa")}: ${money(s.expectedPygInDrawer)}${session.countedAmountPyg != null ? ` · ${T("contado", "contado")}: ${money(session.countedAmountPyg)}` : ""}`,
    "",
    `${T("Stock actualizado", "Estoque atualizado")}:`,
    ...(stock.length ? stock.slice(0, 15).map((p) => `${p.stock <= 3 ? "(!)" : "•"} ${p.name}: ${p.stock}`) : [T("(sin productos con control de stock)", "(sem produtos com controle de estoque)")]),
  ];
  return {
    text: lines.join("\n"),
    data: { total: s.paidTotalPyg, orders: paid.length, avgTicket, top, topChannel, stock },
  };
}

/** Envia o relatório pelo canal escolhido pelo lojista. */
export async function sendCashReport(t: Tenant, sessionId: string) {
  if (!isPro(t) || t.demo || t.reportChannel === "none" || !t.reportTo) return { status: "SKIPPED" as const };
  const r = await cashReport(t, sessionId);
  if (!r) return { status: "SKIPPED" as const };
  const T = tr(getRegion(t.country).locale);
  const res =
    t.reportChannel === "email" ? await sendEmail(t.reportTo, T(`Cierre de caja — ${t.name}`, `Fechamento de caixa — ${t.name}`), r.text) : await sendWhatsApp(t.reportTo, r.text);
  return { status: res.status, link: t.reportChannel === "whatsapp" ? waLink(t.reportTo, r.text) : null };
}

export { waLink };
