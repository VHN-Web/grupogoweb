import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatPhone } from "@/core/region";
import { Receipt } from "@/components/Receipt";
import { PrintButton } from "@/components/PrintButton";
import { PayBadge } from "@/components/PayBadge";
import { getOrderWithItems } from "@/services/orders";
import { issueInvoiceForOrder, markOrderPaid, updateOrderStatus } from "../../actions";
import { nextLabel, nextStatus } from "../../order-flow";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const t = await requireTenantAdmin(slug);
  const { T, L, region } = panelI18n(t);
  const o = await getOrderWithItems(t.id, id);
  if (!o) notFound();
  const fiscal = await db.query.fiscalDocuments.findFirst({
    where: and(eq(schema.fiscalDocuments.orderId, o.id), eq(schema.fiscalDocuments.tenantId, t.id)),
  });
  const next = nextStatus(o);
  const open = o.status !== "COMPLETED" && o.status !== "CANCELLED";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="no-print space-y-4">
        <Link href={`/painel/${slug}`} className="text-sm text-muted">← {T("Pedidos", "Pedidos")}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tabular-nums">#{o.number}</h1>
          <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">{L.orderStatus[o.status]}</span>
          <PayBadge status={o.paymentStatus} locale={region.locale} />
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <p><span className="text-muted">Cliente:</span> {o.customerName} {o.customerPhone && `· ${formatPhone(o.customerPhone)}`}</p>
          <p><span className="text-muted">Tipo:</span> {L.orderType[o.type]} {o.tableLabel && `· ${o.tableLabel}`}</p>
          {o.address && <p><span className="text-muted">{T("Dirección:", "Endereço:")}</span> {o.address} {o.distanceKm != null && `(${o.distanceKm} km)`}</p>}
          {o.lat != null && o.lng != null && (
            <a className="text-sm underline" target="_blank" href={`https://www.google.com/maps?q=${o.lat},${o.lng}`}>{T("Abrir en el mapa ↗", "Abrir no mapa ↗")}</a>
          )}
          <p><span className="text-muted">{T("Pago:", "Pagamento:")}</span> {L.paymentMethod[o.paymentMethod]} · {o.paymentProvider} {o.paymentRef && `· ref ${o.paymentRef}`}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {next && (
            <form action={updateOrderStatus.bind(null, slug, o.id, next)}>
              <button className="btn-brand">{nextLabel(next, region.locale)}</button>
            </form>
          )}
          {o.paymentStatus !== "PAID" && o.status !== "CANCELLED" && (
            <form action={markOrderPaid.bind(null, slug, o.id)}>
              <button className="btn-ghost">{T("Marcar cobrado", "Marcar recebido")}</button>
            </form>
          )}
          {open && (
            <form action={updateOrderStatus.bind(null, slug, o.id, "CANCELLED")}>
              <button className="btn-ghost text-red-600">{T("Cancelar (devuelve stock)", "Cancelar (devolve estoque)")}</button>
            </form>
          )}
          <PrintButton label={T("Imprimir ticket", "Imprimir comprovante")} />
        </div>

        <div className="card p-4">
          <h2 className="font-semibold">{T("Factura", "Nota fiscal")}</h2>
          {fiscal ? (
            <p className="mt-1 text-sm text-muted">
              {T("Registrada", "Registrada")} ({fiscal.provider}) · {fiscal.docNumber ?? T("sin número aún", "sem número ainda")} ·{" "}
              <Link className="underline" href={`/painel/${slug}/notas`}>{T("ver en Facturas", "ver em Notas fiscais")}</Link>
            </p>
          ) : (
            <form action={issueInvoiceForOrder.bind(null, slug, o.id)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input name="ruc" className="input" placeholder={T("RUC del cliente (opcional)", "CPF/CNPJ do cliente (opcional)")} />
              <input name="name" className="input" placeholder={T("Razón social", "Razão social")} defaultValue={o.customerName} />
              <button className="btn-primary">{T("Generar factura", "Gerar nota")}</button>
            </form>
          )}
        </div>
      </div>
      <div className="card h-fit overflow-hidden print:border-0">
        <Receipt tenant={t} order={o} />
      </div>
    </div>
  );
}
