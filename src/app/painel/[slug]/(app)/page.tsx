import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { formatMinor, formatPyg } from "@/core/money";
import { LABELS, type OrderStatus } from "@/core/types";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PayBadge } from "@/components/PayBadge";
import { markOrderPaid, updateOrderStatus } from "./actions";
import { NEXT_LABEL, nextStatus } from "./order-flow";

export const dynamic = "force-dynamic";

const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: "Nuevos", statuses: ["RECEIVED"] },
  { title: "En preparación", statuses: ["PREPARING"] },
  { title: "Listos / en camino", statuses: ["READY", "OUT_FOR_DELIVERY"] },
];

export default async function OrdersBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
  const orders = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, t.id), gte(schema.orders.createdAt, since)),
    with: { items: true },
    orderBy: desc(schema.orders.createdAt),
  });
  const finished = orders.filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED");
  const today = orders.filter((o) => o.status !== "CANCELLED");

  return (
    <div className="space-y-6">
      <AutoRefresh ms={5000} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Pedidos (24h)" v={String(today.length)} />
        <Stat k="Vendido (24h)" v={formatPyg(today.reduce((s, o) => s + o.totalPyg, 0))} />
        <Stat k="Cobrado" v={formatPyg(today.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.totalPyg, 0))} />
        <Stat k="Por cobrar" v={formatPyg(today.filter((o) => o.paymentStatus !== "PAID").reduce((s, o) => s + o.totalPyg, 0))} />
      </div>

      {!t.isOpen && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El local está <b>cerrado</b>: los clientes ven el menú pero no pueden pedir. Usá el botón de arriba para abrir.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.statuses.includes(o.status)).reverse();
          return (
            <section key={col.title} className="rounded-2xl bg-white/60 p-3 ring-1 ring-line">
              <h2 className="mb-3 flex items-center justify-between px-1 text-[13px] font-semibold uppercase tracking-[.12em] text-muted">
                {col.title}
                <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-white">{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted">—</p>}
                {list.map((o) => {
                  const next = nextStatus(o);
                  return (
                    <article key={o.id} className="card p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/painel/${slug}/pedidos/${o.id}`} className="text-2xl font-black tabular-nums hover:underline">
                            #{o.number}
                          </Link>
                          <p className="text-sm font-semibold">{o.customerName}</p>
                          <p className="text-xs text-muted">
                            {o.tableLabel ?? LABELS.orderType[o.type]} · {timeAgo(o.createdAt)}
                          </p>
                        </div>
                        <PayBadge status={o.paymentStatus} />
                      </div>
                      <ul className="mt-2.5 space-y-0.5 border-t border-line pt-2.5 text-sm">
                        {o.items.map((i) => (
                          <li key={i.id}>
                            <b>{i.quantity}×</b> {i.name}
                            {i.notes && <span className="text-muted"> — {i.notes}</span>}
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{o.notes}</p>}
                      {o.type === "DELIVERY" && o.address && <p className="mt-2 text-xs text-muted">📍 {o.address}</p>}
                      <div className="mt-2.5 flex items-start justify-between gap-3 text-sm">
                        <span className="text-muted">
                          {LABELS.paymentMethod[o.paymentMethod]}
                          {o.payCurrency !== "PYG" && ` · ${formatMinor(o.payAmountMinor, o.payCurrency)}`}
                          {o.changeDuePyg ? ` · vuelto ${formatPyg(o.changeDuePyg)}` : ""}
                        </span>
                        <b className="shrink-0 whitespace-nowrap">{formatPyg(o.totalPyg)}</b>
                      </div>
                      <div className="mt-3 flex gap-2">
                        {o.paymentStatus !== "PAID" && (
                          <form action={markOrderPaid.bind(null, slug, o.id)}>
                            <button className="btn-ghost px-3 py-2 text-xs">Cobrado</button>
                          </form>
                        )}
                        {next && (
                          <form action={updateOrderStatus.bind(null, slug, o.id, next)} className="flex-1">
                            <button className="btn-brand w-full py-2 text-xs">{NEXT_LABEL[next]}</button>
                          </form>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {finished.length > 0 && (
        <section>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[.12em] text-muted">Finalizados (24h)</h2>
          <div className="card divide-y divide-line">
            {finished.map((o) => (
              <Link key={o.id} href={`/painel/${slug}/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                <b className="w-14 tabular-nums">#{o.number}</b>
                <span className="flex-1 truncate">{o.customerName}</span>
                <span className={o.status === "CANCELLED" ? "text-red-600" : "text-muted"}>{LABELS.orderStatus[o.status]}</span>
                <PayBadge status={o.paymentStatus} />
                <b className="w-28 text-right">{formatPyg(o.totalPyg)}</b>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{v}</p>
    </div>
  );
}

function timeAgo(d: Date) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}
