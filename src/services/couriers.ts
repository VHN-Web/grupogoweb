import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { courierMessage, courierPayout } from "@/core/couriers";
import { formatMoney } from "@/core/money";
import { formatPhone, getRegion, tr } from "@/core/region";
import type { Currency } from "@/core/types";
import type { Order, OrderItem, Tenant } from "@/db/schema";

export function listCouriers(tenantId: string) {
  return db.query.couriers.findMany({ where: eq(schema.couriers.tenantId, tenantId), orderBy: [desc(schema.couriers.active), schema.couriers.name] });
}

/** Mensagem da entrega para o motoboy (WhatsApp). */
export function deliveryMessage(t: Tenant, o: Order & { items: OrderItem[] }) {
  const T = tr(getRegion(t.country).locale);
  const base = t.currency as Currency;
  const paid = o.paymentStatus === "PAID";
  return courierMessage(
    {
      number: o.number,
      storeName: t.name,
      customerName: o.customerName,
      customerPhone: o.customerPhone ? formatPhone(o.customerPhone) : null,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      items: o.items.map((i) => ({ name: i.name, quantity: i.quantity })),
      total: formatMoney(o.totalPyg, base),
      collect: paid ? null : `${formatMoney(o.payAmountMinor, o.payCurrency as Currency)} (${o.paymentMethod === "CASH" ? T("efectivo", "dinheiro") : o.paymentMethod === "CARD" ? T("tarjeta", "cartão") : o.paymentMethod})`,
      change: !paid && o.changeDuePyg ? formatMoney(o.changeDuePyg, base) : null,
      notes: o.notes,
    },
    T,
  );
}

/** Entregas por motoboy desde `since` (pedidos não cancelados) + quanto pagar a cada um. */
export async function courierReport(tenantId: string, since: Date) {
  const [list, orders] = await Promise.all([
    listCouriers(tenantId),
    db.query.orders.findMany({
      where: and(eq(schema.orders.tenantId, tenantId), isNotNull(schema.orders.courierId), gte(schema.orders.createdAt, since)),
      columns: { id: true, number: true, courierId: true, deliveryFeePyg: true, status: true, createdAt: true, customerName: true },
      orderBy: desc(schema.orders.createdAt),
    }),
  ]);
  return list.map((c) => {
    const mine = orders.filter((o) => o.courierId === c.id && o.status !== "CANCELLED");
    return { courier: c, orders: mine, ...courierPayout(mine.map((o) => ({ deliveryFee: o.deliveryFeePyg })), c.feePerDelivery) };
  });
}
