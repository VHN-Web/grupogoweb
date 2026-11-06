import Link from "next/link";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatMinor, formatPyg } from "@/core/money";
import { type OrderStatus } from "@/core/types";
import { AutoRefresh } from "@/components/AutoRefresh";
import { listAbandonedCarts, notifyOwnerAbandoned } from "@/services/intelligence";
import { PayBadge } from "@/components/PayBadge";
import { markOrderPaid, updateOrderStatus } from "./actions";
import { nextLabel, nextStatus } from "./order-flow";

export const dynamic = "force-dynamic";

const COLUMNS: { es: string; pt: string; statuses: OrderStatus[] }[] = [
  { es: "Nuevos", pt: "Novos", statuses: ["RECEIVED"] },
  { es: "En preparación", pt: "Em preparo", statuses: ["PREPARING"] },
  { es: "Listos / en camino", pt: "Prontos / em rota", statuses: ["READY", "OUT_FOR_DELIVERY"] },
];

export default async function OrdersBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug, "orders");
  const { T, L, fm, fmtDate, region } = panelI18n(t);
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
  const orders = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, t.id), gte(schema.orders.createdAt, since)),
    with: { items: true },
    orderBy: desc(schema.orders.createdAt),
  });
  const finished = orders.filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED");
  const today = orders.filter((o) => o.status !== "CANCELLED");
  const pro = t.tier === "pro";
  // GoInteligence: avisa o lojista de carrinhos abandonados e mostra pendências
  if (pro) await notifyOwnerAbandoned(t).catch(() => 0);
  const [abandoned, pendingAppts] = pro
    ? await Promise.all([
        listAbandonedCarts(t.id).then((c) => c.filter((x) => x.status === "OPEN").length),
        db.$count(schema.appointments, and(eq(schema.appointments.tenantId, t.id), eq(schema.appointments.status, "PENDING"), gte(schema.appointments.startsAt, new Date()))),
      ])
    : [0, 0];

  return (
    <div className="space-y-6">
      <AutoRefresh ms={5000} />
      {(abandoned > 0 || pendingAppts > 0) && (
        <div className="flex flex-wrap gap-2">
          {pendingAppts > 0 && (
            <Link href={`/painel/${slug}/agenda`} className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-900 ring-1 ring-blue-200">
              📅 {pendingAppts} {T("turno(s) para confirmar", "horário(s) para confirmar")} →
            </Link>
          )}
          {abandoned > 0 && (
            <Link href={`/painel/${slug}/marketing`} className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
              🛒 {abandoned} {T("carrito(s) abandonado(s) — enviá un cupón", "carrinho(s) abandonado(s) — envie um cupom")} →
            </Link>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k={T("Pedidos (24h)", "Pedidos (24h)")} v={String(today.length)} />
        <Stat k={T("Vendido (24h)", "Vendido (24h)")} v={fm(today.reduce((s, o) => s + o.totalPyg, 0))} />
        <Stat k={T("Cobrado", "Recebido")} v={fm(today.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.totalPyg, 0))} />
        <Stat k={T("Por cobrar", "A receber")} v={fm(today.filter((o) => o.paymentStatus !== "PAID").reduce((s, o) => s + o.totalPyg, 0))} />
      </div>

      {!t.isOpen && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {T("El local está cerrado: los clientes ven el menú pero no pueden pedir. Usá el botón de arriba para abrir.", "O estabelecimento está fechado: os clientes veem o cardápio mas não podem pedir. Use o botão acima para abrir.")}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.statuses.includes(o.status)).reverse();
          return (
            <section key={T(col.es, col.pt)} className="rounded-2xl bg-white/60 p-3 ring-1 ring-line">
              <h2 className="mb-3 flex items-center justify-between px-1 text-[13px] font-semibold uppercase tracking-[.12em] text-muted">
                {T(col.es, col.pt)}
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
                            {o.tableLabel ?? L.orderType[o.type]} · {timeAgo(o.createdAt, region.locale)}
                          </p>
                        </div>
                        <PayBadge status={o.paymentStatus} locale={region.locale} />
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
                          {L.paymentMethod[o.paymentMethod]}
                          {o.payCurrency !== "PYG" && ` · ${formatMinor(o.payAmountMinor, o.payCurrency)}`}
                          {o.changeDuePyg ? ` · ${T("vuelto", "troco")} ${fm(o.changeDuePyg)}` : ""}
                        </span>
                        <b className="shrink-0 whitespace-nowrap">{fm(o.totalPyg)}</b>
                      </div>
                      <div className="mt-3 flex gap-2">
                        {o.paymentStatus !== "PAID" && (
                          <form action={markOrderPaid.bind(null, slug, o.id)}>
                            <button className="btn-ghost px-3 py-2 text-xs">{T("Cobrado", "Recebido")}</button>
                          </form>
                        )}
                        {next && (
                          <form action={updateOrderStatus.bind(null, slug, o.id, next)} className="flex-1">
                            <button className="btn-brand w-full py-2 text-xs">{nextLabel(next, region.locale)}</button>
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
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[.12em] text-muted">{T("Finalizados (24h)", "Finalizados (24h)")}</h2>
          <div className="card divide-y divide-line">
            {finished.map((o) => (
              <Link key={o.id} href={`/painel/${slug}/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                <b className="w-14 tabular-nums">#{o.number}</b>
                <span className="flex-1 truncate">{o.customerName}</span>
                <span className={o.status === "CANCELLED" ? "text-red-600" : "text-muted"}>{L.orderStatus[o.status]}</span>
                <PayBadge status={o.paymentStatus} locale={region.locale} />
                <b className="w-28 text-right">{fm(o.totalPyg)}</b>
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

function timeAgo(d: Date, locale: "es" | "pt") {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  const pt = locale === "pt";
  if (m < 1) return pt ? "agora" : "ahora";
  if (m < 60) return pt ? `há ${m} min` : `hace ${m} min`;
  return pt ? `há ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 60)} h`;
}
