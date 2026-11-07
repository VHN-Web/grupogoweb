import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatMinor } from "@/core/money";
import { PAYMENT_METHODS, CURRENCIES } from "@/core/types";
import { CURRENCY_SYMBOL } from "@/core/money";
import { MoneyInput } from "@/components/forms/MoneyInput";
import type { Currency } from "@/core/types";
import { getOpenSession, listSessions, summarizeSession } from "@/services/cash";
import { PayBadge } from "@/components/PayBadge";
import { addCashMovement, closeCash, markOrderPaid, openCash } from "../actions";

export const dynamic = "force-dynamic";

export default async function CashPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug, "cash");
  const { T, L, fm, fmtDate, region } = panelI18n(t);
  const sym = CURRENCY_SYMBOL[t.currency as keyof typeof CURRENCY_SYMBOL];
  const cur = t.currency as Currency;
  const session = await getOpenSession(t.id);
  const history = await listSessions(t.id, 10);

  if (!session) {
    return (
      <div className="max-w-md space-y-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold">{T("Abrir caja", "Abrir caixa")}</h1>
          <p className="mt-1 text-sm text-muted">{T("Los pedidos se asocian a la caja abierta para el cierre del día.", "Os pedidos ficam ligados ao caixa aberto para o fechamento do dia.")}</p>
          <form action={openCash.bind(null, slug)} className="mt-4 space-y-3">
            <label className="label">{T("Fondo inicial en efectivo", "Fundo de troco inicial")} ({sym})</label>
            <MoneyInput name="openingAmountPyg" currency={cur} defaultMinor={0} />
            <button className="btn-brand w-full">{T("Abrir caja", "Abrir caixa")}</button>
          </form>
        </div>
        <History items={history} T={T} fm={fm} fmtDate={fmtDate} reportBase={`/painel/${slug}/caixa/relatorio`} />
      </div>
    );
  }

  const s = await summarizeSession(t.id, session.id, t.currency);
  const orders = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, t.id), eq(schema.orders.cashSessionId, session.id)),
    orderBy: desc(schema.orders.createdAt),
  });
  const opened = fmtDate(session.openedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{T("Caja abierta", "Caixa aberto")}</h1>
          <p className="text-sm text-muted">{T("Desde", "Desde")} {opened} · {T("fondo", "fundo")} {fm(session.openingAmountPyg)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat k={T("Cobrado", "Recebido")} v={fm(s.paidTotalPyg)} strong />
        <Stat k={T("Por cobrar", "A receber")} v={fm(s.pendingTotalPyg)} />
        <Stat k={T("Pedidos", "Pedidos")} v={String(s.ordersCount)} />
        <Stat k={`${T("Esperado en caja", "Esperado no caixa")} (${sym})`} v={fm(s.expectedPygInDrawer)} strong />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4">
          <h2 className="font-semibold">{T("Por medio de pago", "Por forma de pagamento")}</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <li key={m} className="flex justify-between"><span className="text-muted">{L.paymentMethod[m]}</span><b>{fm(s.byMethod[m])}</b></li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">{T("Efectivo recibido por moneda", "Dinheiro recebido por moeda")}</h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            {[t.currency, ...CURRENCIES.filter((c) => c !== t.currency && s.cashByCurrency[c] > 0)].map((c) => (
              <li key={c} className="flex justify-between"><span className="text-muted">{CUR_NAME[c as keyof typeof CUR_NAME][region.locale]}</span><b>{formatMinor(s.cashByCurrency[c as keyof typeof s.cashByCurrency], c as keyof typeof CUR_NAME)}</b></li>
            ))}
            <li className="flex justify-between"><span className="text-muted">{T("Vuelto entregado", "Troco entregue")}</span><b>-{fm(s.changeGivenPyg)}</b></li>
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">{T("Movimientos", "Movimentações")}</h2>
          <form action={addCashMovement.bind(null, slug)} className="mt-3 grid grid-cols-[auto_1fr] gap-2">
            <select name="type" className="input w-auto">
              <option value="OUT">{T("Retiro / gasto", "Sangria / despesa")}</option>
              <option value="IN">{T("Ingreso", "Suprimento")}</option>
            </select>
            <MoneyInput name="amountPyg" currency={cur} placeholder={`${T("Monto", "Valor")} ${sym}`} required />
            <input name="description" className="input col-span-2" placeholder={T("Descripción (ej: hielo, cambio)", "Descrição (ex: gelo, troco)")} />
            <button className="btn-primary col-span-2">{T("Registrar", "Registrar")}</button>
          </form>
          <ul className="mt-3 space-y-1 text-sm">
            {session.movements.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate text-muted">{m.description}</span>
                <b className={m.type === "OUT" ? "text-red-600" : "text-emerald-700"}>{m.type === "OUT" ? "-" : "+"}{fm(m.amountPyg)}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">{T("Cerrar caja", "Fechar caixa")}</h2>
          <p className="mt-1 text-sm text-muted">{T("Contá el efectivo en", "Conte o dinheiro em")} {sym}. {T("Esperado", "Esperado")}: <b className="text-ink">{fm(s.expectedPygInDrawer)}</b></p>
          <form action={closeCash.bind(null, slug, session.id)} className="mt-3 space-y-2">
            <MoneyInput name="countedAmountPyg" currency={cur} placeholder={`${T("Monto contado", "Valor contado")} (${sym})`} required />
            <textarea name="notes" className="input" placeholder={T("Observaciones (otras monedas contadas, diferencias…)", "Observações (outras moedas, diferenças…)")} />
            <button className="btn-brand w-full">{T("Cerrar caja", "Fechar caixa")}</button>
          </form>
        </div>
      </div>

      <div className="card divide-y divide-line">
        <h2 className="px-4 py-3 font-semibold">{T("Ventas de esta caja", "Vendas deste caixa")}</h2>
        {orders.length === 0 && <p className="px-4 py-4 text-sm text-muted">{T("Sin ventas todavía.", "Nenhuma venda ainda.")}</p>}
        {orders.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <Link href={`/painel/${slug}/pedidos/${o.id}`} className="w-14 font-bold tabular-nums hover:underline">#{o.number}</Link>
            <span className="min-w-24 flex-1 truncate">{o.customerName}</span>
            <span className="text-muted">{L.paymentMethod[o.paymentMethod]}{o.payCurrency !== t.currency && ` (${o.payCurrency})`}</span>
            <PayBadge status={o.status === "CANCELLED" ? "FAILED" : o.paymentStatus} locale={region.locale} />
            <b className="w-28 text-right">{fm(o.totalPyg)}</b>
            {o.paymentStatus !== "PAID" && o.status !== "CANCELLED" && (
              <form action={markOrderPaid.bind(null, slug, o.id)}><button className="btn-ghost px-2.5 py-1 text-xs">{T("Cobrar", "Receber")}</button></form>
            )}
          </div>
        ))}
      </div>
      <History items={history.filter((h) => h.closedAt)} T={T} fm={fm} fmtDate={fmtDate} reportBase={`/painel/${slug}/caixa/relatorio`} />
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

const CUR_NAME = {
  PYG: { es: "Guaraníes", pt: "Guaranis" },
  USD: { es: "Dólares", pt: "Dólares" },
  BRL: { es: "Reales", pt: "Reais" },
} as const;

function History({
  items,
  T,
  fm,
  fmtDate,
  reportBase,
}: {
  reportBase: string;
  items: Awaited<ReturnType<typeof listSessions>>;
  T: (es: string, pt: string) => string;
  fm: (v: number) => string;
  fmtDate: (d: Date) => string;
}) {
  const closed = items.filter((i) => i.closedAt);
  if (!closed.length) return null;
  const f = { format: fmtDate };
  return (
    <div className="card p-4">
      <h2 className="font-semibold">{T("Cierres anteriores", "Fechamentos anteriores")}</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {closed.map((c) => (
          <li key={c.id} className="flex justify-between gap-2">
            <span className="text-muted">{f.format(c.openedAt)} → {c.closedAt && f.format(c.closedAt)}</span>
            <span className="flex items-center gap-3">
              <a href={`${reportBase}/${c.id}`} className="text-xs underline">{T("Informe", "Relatório")}</a>
              <b>{fm(c.countedAmountPyg ?? 0)}</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
