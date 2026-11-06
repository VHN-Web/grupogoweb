import "server-only";
import { and, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Currency, PaymentMethod } from "@/core/types";

export async function getOpenSession(tenantId: string) {
  return db.query.cashSessions.findFirst({
    where: and(eq(schema.cashSessions.tenantId, tenantId), isNull(schema.cashSessions.closedAt)),
    with: { movements: true },
  });
}

export async function openSession(tenantId: string, openingAmountPyg: number) {
  const existing = await getOpenSession(tenantId);
  if (existing) return existing;
  const [s] = await db.insert(schema.cashSessions).values({ tenantId, openingAmountPyg }).returning();
  // Pedidos feitos com o caixa fechado (últimas 24h) entram nesta sessão
  await db
    .update(schema.orders)
    .set({ cashSessionId: s.id })
    .where(
      and(
        eq(schema.orders.tenantId, tenantId),
        isNull(schema.orders.cashSessionId),
        ne(schema.orders.status, "CANCELLED"),
        gte(schema.orders.createdAt, new Date(Date.now() - 864e5)),
      ),
    );
  return s;
}

export async function closeSession(tenantId: string, sessionId: string, countedAmountPyg: number, notes?: string) {
  await db
    .update(schema.cashSessions)
    .set({ closedAt: new Date(), countedAmountPyg, notes: notes ?? null })
    .where(and(eq(schema.cashSessions.id, sessionId), eq(schema.cashSessions.tenantId, tenantId)));
}

export async function addMovement(tenantId: string, type: "IN" | "OUT", amountPyg: number, description: string) {
  const s = await getOpenSession(tenantId);
  if (!s) throw new Error("Abra o caixa primeiro");
  await db.insert(schema.cashMovements).values({ sessionId: s.id, type, amountPyg, description });
}

export type CashSummary = {
  ordersCount: number;
  paidTotalPyg: number;
  pendingTotalPyg: number;
  byMethod: Record<PaymentMethod, number>;
  /** Dinheiro físico recebido por moeda (unidade menor) — p/ conferir gaveta */
  cashByCurrency: Record<Currency, number>;
  changeGivenPyg: number;
  movementsInPyg: number;
  movementsOutPyg: number;
  /** Guaraníes esperados na gaveta (abertura + vendas em Gs. em dinheiro - troco + suprimentos - sangrias) */
  expectedPygInDrawer: number;
};

export async function summarizeSession(tenantId: string, sessionId: string, baseCurrency: string = "PYG"): Promise<CashSummary> {
  const session = await db.query.cashSessions.findFirst({
    where: and(eq(schema.cashSessions.id, sessionId), eq(schema.cashSessions.tenantId, tenantId)),
    with: { movements: true },
  });
  if (!session) throw new Error("Sessão não encontrada");
  const orders = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.cashSessionId, sessionId)),
  });

  const s: CashSummary = {
    ordersCount: 0,
    paidTotalPyg: 0,
    pendingTotalPyg: 0,
    byMethod: { CASH: 0, CARD: 0, PIX: 0, TRANSFER: 0 },
    cashByCurrency: { PYG: 0, USD: 0, BRL: 0 },
    changeGivenPyg: 0,
    movementsInPyg: 0,
    movementsOutPyg: 0,
    expectedPygInDrawer: session.openingAmountPyg,
  };
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    s.ordersCount++;
    if (o.paymentStatus !== "PAID") {
      s.pendingTotalPyg += o.totalPyg;
      continue;
    }
    s.paidTotalPyg += o.totalPyg;
    s.byMethod[o.paymentMethod] += o.totalPyg;
    if (o.paymentMethod === "CASH") {
      const received = o.cashTenderedMinor ?? o.payAmountMinor;
      s.cashByCurrency[o.payCurrency] += received;
      const change = o.changeDuePyg ?? 0;
      s.changeGivenPyg += change;
      if (o.payCurrency === baseCurrency) s.expectedPygInDrawer += received;
      s.expectedPygInDrawer -= change;
    }
  }
  for (const m of session.movements) {
    if (m.type === "IN") s.movementsInPyg += m.amountPyg;
    else s.movementsOutPyg += m.amountPyg;
  }
  s.expectedPygInDrawer += s.movementsInPyg - s.movementsOutPyg;
  return s;
}

export async function listSessions(tenantId: string, limit = 20) {
  return db.query.cashSessions.findMany({
    where: eq(schema.cashSessions.tenantId, tenantId),
    orderBy: desc(schema.cashSessions.openedAt),
    limit,
  });
}
