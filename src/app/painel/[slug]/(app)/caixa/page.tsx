import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { formatMinor, formatPyg } from "@/core/money";
import { LABELS, PAYMENT_METHODS } from "@/core/types";
import { getOpenSession, listSessions, summarizeSession } from "@/services/cash";
import { PayBadge } from "@/components/PayBadge";
import { addCashMovement, closeCash, markOrderPaid, openCash } from "../actions";

export const dynamic = "force-dynamic";

export default async function CashPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug);
  const session = await getOpenSession(t.id);
  const history = await listSessions(t.id, 10);

  if (!session) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold">Abrir caja</h1>
          <p className="mt-1 text-sm text-muted">Los pedidos se asocian a la caja abierta para el cierre del día.</p>
          <form action={openCash.bind(null, slug)} className="mt-4 space-y-3">
            <label className="label">Fondo inicial en efectivo (Gs.)</label>
            <input name="openingAmountPyg" className="input" inputMode="numeric" defaultValue="0" />
            <button className="btn-brand w-full">Abrir caja</button>
          </form>
        </div>
        <History items={history} />
      </div>
    );
  }

  const s = await summarizeSession(t.id, session.id);
  const orders = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, t.id), eq(schema.orders.cashSessionId, session.id)),
    orderBy: desc(schema.orders.createdAt),
  });
  const opened = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Asuncion" }).format(session.openedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Caja abierta</h1>
          <p className="text-sm text-muted">Desde {opened} · fondo {formatPyg(session.openingAmountPyg)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat k="Cobrado" v={formatPyg(s.paidTotalPyg)} strong />
        <Stat k="Por cobrar" v={formatPyg(s.pendingTotalPyg)} />
        <Stat k="Pedidos" v={String(s.ordersCount)} />
        <Stat k="Esperado en caja (Gs.)" v={formatPyg(s.expectedPygInDrawer)} strong />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="font-semibold">Por medio de pago</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <li key={m} className="flex justify-between"><span className="text-muted">{LABELS.paymentMethod[m]}</span><b>{formatPyg(s.byMethod[m])}</b></li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Efectivo recibido por moneda</h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            <li className="flex justify-between"><span className="text-muted">Guaraníes</span><b>{formatMinor(s.cashByCurrency.PYG, "PYG")}</b></li>
            <li className="flex justify-between"><span className="text-muted">Dólares</span><b>{formatMinor(s.cashByCurrency.USD, "USD")}</b></li>
            <li className="flex justify-between"><span className="text-muted">Reales</span><b>{formatMinor(s.cashByCurrency.BRL, "BRL")}</b></li>
            <li className="flex justify-between"><span className="text-muted">Vuelto entregado</span><b>-{formatPyg(s.changeGivenPyg)}</b></li>
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">Movimientos</h2>
          <form action={addCashMovement.bind(null, slug)} className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <select name="type" className="input w-auto">
              <option value="OUT">Retiro / gasto</option>
              <option value="IN">Ingreso</option>
            </select>
            <input name="amountPyg" className="input" inputMode="numeric" placeholder="Monto Gs." />
            <input name="description" className="input col-span-2" placeholder="Descripción (ej: hielo, cambio)" />
            <button className="btn-primary col-span-2">Registrar</button>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {session.movements.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate text-muted">{m.description}</span>
                <b className={m.type === "OUT" ? "text-red-600" : "text-emerald-700"}>{m.type === "OUT" ? "-" : "+"}{formatPyg(m.amountPyg)}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">Cerrar caja</h2>
          <p className="mt-1 text-sm text-muted">Contá el efectivo en guaraníes. Esperado: <b className="text-ink">{formatPyg(s.expectedPygInDrawer)}</b></p>
          <form action={closeCash.bind(null, slug, session.id)} className="mt-3 space-y-2">
            <input name="countedAmountPyg" className="input" inputMode="numeric" placeholder="Monto contado (Gs.)" required />
            <textarea name="notes" className="input" placeholder="Observaciones (USD/BRL contados, diferencias…)" />
            <button className="btn-brand w-full">Cerrar caja</button>
          </form>
        </div>
      </div>

      <div className="card divide-y divide-line">
        <h2 className="px-4 py-3 font-semibold">Ventas de esta caja</h2>
        {orders.length === 0 && <p className="px-4 py-4 text-sm text-muted">Sin ventas todavía.</p>}
        {orders.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <Link href={`/painel/${slug}/pedidos/${o.id}`} className="w-14 font-bold tabular-nums hover:underline">#{o.number}</Link>
            <span className="min-w-24 flex-1 truncate">{o.customerName}</span>
            <span className="text-muted">{LABELS.paymentMethod[o.paymentMethod]}{o.payCurrency !== "PYG" && ` (${o.payCurrency})`}</span>
            <PayBadge status={o.status === "CANCELLED" ? "FAILED" : o.paymentStatus} />
            <b className="w-28 text-right">{formatPyg(o.totalPyg)}</b>
            {o.paymentStatus !== "PAID" && o.status !== "CANCELLED" && (
              <form action={markOrderPaid.bind(null, slug, o.id)}><button className="btn-ghost px-2.5 py-1 text-xs">Cobrar</button></form>
            )}
          </div>
        ))}
      </div>
      <History items={history.filter((h) => h.closedAt)} />
    </div>
  );
}

function Stat({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`card px-4 py-3 ${strong ? "ring-1 ring-ink/10" : ""}`}>
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{v}</p>
    </div>
  );
}

function History({ items }: { items: Awaited<ReturnType<typeof listSessions>> }) {
  const closed = items.filter((i) => i.closedAt);
  if (!closed.length) return null;
  const f = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Asuncion" });
  return (
    <div className="card p-4">
      <h2 className="font-semibold">Cierres anteriores</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {closed.map((c) => (
          <li key={c.id} className="flex justify-between gap-2">
            <span className="text-muted">{f.format(c.openedAt)} → {c.closedAt && f.format(c.closedAt)}</span>
            <b>{formatPyg(c.countedAmountPyg ?? 0)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
