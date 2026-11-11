import { hasModule } from "@/core/modules";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { after } from "next/server";
import { OD_PLATFORM_INFO, isOdPlatform } from "@/core/opendelivery";
import { setupProgress } from "@/core/setup";
import { storeSetup } from "@/services/setup";
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
import { advisoryVisible, currentPlan } from "@/services/advisory";
import { AdvisoryPromo } from "@/components/advisory/AdvisoryPromo";

export const dynamic = "force-dynamic";

const COLUMNS: { es: string; pt: string; statuses: OrderStatus[]; color: string; soft: string }[] = [
  { es: "Nuevos", pt: "Novos", statuses: ["RECEIVED"], color: "#E0891F", soft: "#FDF3E4" },
  { es: "En preparación", pt: "Em preparo", statuses: ["PREPARING"], color: "#1F7FD8", soft: "#E8F1FC" },
  { es: "Listos / en camino", pt: "Prontos / em rota", statuses: ["READY", "OUT_FOR_DELIVERY"], color: "#2FAE5F", soft: "#E6F6EC" },
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
  // Apps de delivery: busca pedidos novos dos apps (no máximo a cada 25 s; o webhook já entrega na hora)
  if (t.country === "BR") after(() => import("@/services/opendelivery").then((od) => od.pollTenantIfDue(t.id)).catch(() => 0));
  const finished = orders.filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED");
  const today = orders.filter((o) => o.status !== "CANCELLED");
  const pro = t.tier === "pro";
  const mkt = pro && hasModule(t, "marketing");
  // GoInteligence: avisa o lojista de carrinhos abandonados e mostra pendências
  if (mkt) await notifyOwnerAbandoned(t).catch(() => 0);
  const [abandoned, pendingAppts] = pro
    ? await Promise.all([
        mkt ? listAbandonedCarts(t.id).then((c) => c.filter((x) => x.status === "OPEN").length) : Promise.resolve(0),
        db.$count(schema.appointments, and(eq(schema.appointments.tenantId, t.id), eq(schema.appointments.status, "PENDING"), gte(schema.appointments.startsAt, new Date()))),
      ])
    : [0, 0];

  // primeiros passos (só Brasil, some quando tudo estiver pronto)
  const steps = t.country === "BR" && !t.demo ? await storeSetup(t) : [];
  const prog = setupProgress(steps);
  // Assessoria GoWeb: chamada no painel enquanto a loja não tem plano (complemento ligado no Admin)
  const showAdvisory = (await advisoryVisible(t).catch(() => false)) && !(await currentPlan(t.id).catch(() => null));
  return (
    <div className="space-y-6">
      <AutoRefresh ms={5000} />
      {steps.length > 0 && prog.next && (
        <details className="card p-4 text-sm" open={prog.done <= 2}>
          <summary className="flex cursor-pointer items-center gap-3">
            <span className="font-semibold">Primeiros passos · {prog.done} de {prog.total}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10"><span className="block h-full rounded-full bg-[#3CC46B]" style={{ width: `${prog.pct}%` }} /></span>
            <span className="text-xs text-muted">Próximo: {prog.next.title}</span>
          </summary>
          <ol className="mt-3 space-y-2">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-2">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? "bg-[#3CC46B] text-white" : "bg-black/10"}`}>{s.done ? "✓" : ""}</span>
                <span className="flex-1">
                  <Link href={s.href} className={`font-semibold ${s.done ? "text-muted line-through" : "underline-offset-2 hover:underline"}`}>{s.title}</Link>
                  {!s.done && <span className="block text-xs text-muted">{s.how}</span>}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {(abandoned > 0 || pendingAppts > 0) && (
        <div className="flex flex-wrap gap-2">
          {pendingAppts > 0 && (
            <Link href={`/painel/${slug}/agenda`} className="rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-900 ring-1 ring-blue-200">
              {pendingAppts} {T("turno(s) para confirmar", "horário(s) para confirmar")}
            </Link>
          )}
          {abandoned > 0 && (
            <Link href={`/painel/${slug}/marketing`} className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
              {abandoned} {T("carrito(s) abandonado(s): enviá un cupón", "carrinho(s) abandonado(s): envie um cupom")}
            </Link>
          )}
        </div>
      )}
      {showAdvisory && <AdvisoryPromo slug={slug} locale={region.locale} country={t.country} />}
      <h1>{T("Pedidos de hoy", "Pedidos de hoje")}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k={T("Pedidos en 24 h", "Pedidos em 24 h")} v={String(today.length)} icon="orders" color="#0F2747" />
        <Stat k={T("Vendido en 24 h", "Vendido em 24 h")} v={fm(today.reduce((s, o) => s + o.totalPyg, 0))} icon="growth" color="#2FAE5F" />
        <Stat k={T("Cobrado", "Recebido")} v={fm(today.filter((o) => o.paymentStatus === "PAID").reduce((s, o) => s + o.totalPyg, 0))} icon="check" color="#1F7FD8" />
        <Stat k={T("Por cobrar", "A receber")} v={fm(today.filter((o) => o.paymentStatus !== "PAID").reduce((s, o) => s + o.totalPyg, 0))} icon="clock" color="#E0891F" />
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
            <section key={T(col.es, col.pt)} className="order-col rounded-3xl p-3" style={{ background: col.soft, ["--c" as string]: col.color }}>
              <h2 className="mb-3 flex items-center gap-2 px-1 text-[15px] font-bold" style={{ color: col.color }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} aria-hidden="true" />
                <span className="flex-1">{T(col.es, col.pt)}</span>
                <span className="grid h-7 min-w-7 place-items-center rounded-full px-2 text-[13px] text-white" style={{ background: col.color }}>{list.length}</span>
              </h2>
              <div className="space-y-3">
                {list.length === 0 && <p className="px-1 py-6 text-center text-sm text-muted">{T("Nada por acá", "Nada por aqui")}</p>}
                {list.map((o) => {
                  const next = nextStatus(o);
                  return (
                    <article key={o.id} className="anim-pop-in card border-l-4 p-3.5" style={{ borderLeftColor: col.color }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/painel/${slug}/pedidos/${o.id}`} className="text-2xl font-black tabular-nums hover:underline">
                            #{o.number}
                          </Link>
                          {o.channel && isOdPlatform(o.channel) && (
                            <span className="mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold text-black" style={{ background: OD_PLATFORM_INFO[o.channel].color }}>
                              {OD_PLATFORM_INFO[o.channel].name}{o.externalDisplayId ? ` #${o.externalDisplayId}` : ""}
                            </span>
                          )}
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
                      {o.cancelRequestedAt && (
                        <Link href={`/painel/${slug}/pedidos/${o.id}`} className="mt-2 block rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                          O cliente pediu para cancelar — responder
                        </Link>
                      )}
                      {o.notes && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{o.notes}</p>}
                      {o.type === "DELIVERY" && o.address && <p className="mt-2 text-xs text-muted">{o.address}</p>}
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
          <h2 className="mb-2 font-bold text-[#3F4654]">{T("Finalizados en 24 h", "Finalizados em 24 h")}</h2>
          <div className="card divide-y divide-line">
            {finished.map((o) => (
              <Link key={o.id} href={`/painel/${slug}/pedidos/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper">
                <b className="w-14 tabular-nums">#{o.number}</b>
                <span className="flex-1 truncate">
                  {o.customerName}
                  {o.channel && isOdPlatform(o.channel) && <span className="ml-2 rounded px-1.5 py-0.5 text-[11px] font-bold text-black" style={{ background: OD_PLATFORM_INFO[o.channel].color }}>{OD_PLATFORM_INFO[o.channel].name}</span>}
                </span>
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

function Stat({ k, v, icon, color }: { k: string; v: string; icon: string; color: string }) {
  return (
    <div className="card flex flex-col items-start gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white" style={{ background: color }}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-muted">{k}</p>
        <p className="truncate text-lg font-extrabold tabular-nums">{v}</p>
      </div>
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
