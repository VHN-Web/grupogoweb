import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatCpf, formatPhone } from "@/core/region";
import { Receipt } from "@/components/Receipt";
import { PrintButton } from "@/components/PrintButton";
import { ThermalPrintButton } from "@/components/ThermalPrint";
import { PayBadge } from "@/components/PayBadge";
import { getOrderWithItems } from "@/services/orders";
import { issueInvoiceForOrder, markOrderPaid, updateOrderStatus } from "../../actions";
import { nextLabel, nextStatus } from "../../order-flow";
import { assignCourier } from "../../courier-actions";
import { OrderTracker } from "@/components/maps/OrderTracker";
import { deliveryMessage, listCouriers } from "@/services/couriers";
import { hasModule } from "@/core/modules";
import { waLink } from "@/core/intelligence";
import { OD_PLATFORM_INFO, isOdPlatform } from "@/core/opendelivery";
import { answerCancelAction } from "../../od-actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug, id } = await params;
  const { err } = await searchParams;
  const t = await requireTenantAdmin(slug, "orders");
  const { T, L, region } = panelI18n(t);
  const o = await getOrderWithItems(t.id, id);
  if (!o) notFound();
  const fiscal = await db.query.fiscalDocuments.findFirst({
    where: and(eq(schema.fiscalDocuments.orderId, o.id), eq(schema.fiscalDocuments.tenantId, t.id)),
  });
  const next = nextStatus(o);
  const app = o.channel && isOdPlatform(o.channel) ? OD_PLATFORM_INFO[o.channel] : null;
  const showCouriers = o.type === "DELIVERY" && hasModule(t, "delivery") && !o.marketplaceDelivery;
  const couriers = showCouriers ? await listCouriers(t.id) : [];
  const courier = couriers.find((c) => c.id === o.courierId);
  const open = o.status !== "COMPLETED" && o.status !== "CANCELLED";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="no-print space-y-4">
        <Link href={`/painel/${slug}`} className="text-sm text-muted">← {T("Pedidos", "Pedidos")}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-black tabular-nums">#{o.number}</h1>
          <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">{L.orderStatus[o.status]}</span>
          <PayBadge status={o.paymentStatus} locale={region.locale} />
          {app && (
            <span className="rounded-full px-2.5 py-1 text-xs font-bold text-black" style={{ background: app.color }}>
              {app.name}{o.externalDisplayId ? ` #${o.externalDisplayId}` : ""}
            </span>
          )}
        </div>
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
        {o.cancelRequestedAt && open && (
          <div className="card border-l-4 border-red-500 p-4 text-sm">
            <p className="font-semibold text-red-700">O cliente pediu para cancelar este pedido pelo {app?.name ?? "app"}.</p>
            <p className="mt-1 text-muted">Se aceitar, o pedido é cancelado aqui e no app (o estoque volta). Se já estiver pronto ou a caminho, recuse.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={answerCancelAction.bind(null, slug, o.id, true)}><button className="btn-brand bg-red-600">Aceitar cancelamento</button></form>
              <form action={answerCancelAction.bind(null, slug, o.id, false)}><button className="btn-ghost">Recusar</button></form>
            </div>
          </div>
        )}
        {app && o.marketplaceDelivery && open && (
          <p className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">A entrega é feita pelo entregador do {app.name}. Quando estiver pronto, marque &quot;Pronto&quot;: o app chama o entregador e avisa aqui quando ele sair e entregar.</p>
        )}
        <div className="card space-y-1 p-4 text-sm">
          <p><span className="text-muted">Cliente:</span> {o.customerName} {o.customerPhone && `· ${formatPhone(o.customerPhone)}`}{o.customerDoc && ` · CPF ${formatCpf(o.customerDoc)}`}</p>
          <p><span className="text-muted">Tipo:</span> {L.orderType[o.type]} {o.tableLabel && `· ${o.tableLabel}`}</p>
          {o.address && <p><span className="text-muted">{T("Dirección:", "Endereço:")}</span> {o.address} {o.distanceKm != null && `(${o.distanceKm} km)`}</p>}
          {o.lat != null && o.lng != null && (
            <a className="text-sm underline" target="_blank" href={`https://www.google.com/maps?q=${o.lat},${o.lng}`}>{T("Abrir en el mapa ↗", "Abrir no mapa ↗")}</a>
          )}
          <p><span className="text-muted">{T("Pago:", "Pagamento:")}</span> {L.paymentMethod[o.paymentMethod]} · {o.paymentProvider} {o.paymentRef && `· ref ${o.paymentRef}`}</p>
        </div>

        {showCouriers && (
          <div className="card p-4 text-sm">
            <h2 className="flex items-center gap-2 font-semibold"><Icon name="bike" size={18} className="text-[var(--section)]" />{T("Repartidor", "Motoboy")}</h2>
            {couriers.length === 0 ? (
              <p className="mt-1 text-muted">{T("Registrá tus repartidores para asignar la entrega.", "Cadastre seus motoboys para atribuir a entrega.")} <Link className="font-semibold underline" href={`/painel/${slug}/motoboys`}>{T("Registrar", "Cadastrar")}</Link></p>
            ) : (
              <>
                <form action={assignCourier.bind(null, slug, o.id)} className="mt-2 flex flex-wrap gap-2">
                  <select name="courierId" defaultValue={o.courierId ?? ""} className="input w-auto min-w-48">
                    <option value="">{T("— sin repartidor —", "— sem motoboy —")}</option>
                    {couriers.filter((c) => c.active || c.id === o.courierId).sort((a, b) => Number(b.online) - Number(a.online)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.online ? " · online" : ""}</option>)}
                  </select>
                  <button className="btn-ghost">{T("Asignar", "Atribuir")}</button>
                </form>
                {courier && o.autoAssigned && <p className="mt-2 text-xs text-muted">{T("Asignado automáticamente (online y más cerca).", "Atribuído automaticamente (online e mais perto).")}</p>}
                {courier && (
                  <a target="_blank" rel="noopener noreferrer" href={waLink(courier.phone, deliveryMessage(t, o))} className="btn-brand mt-3 inline-block">
                    {T(`Enviar ruta a ${courier.name.split(" ")[0]} por WhatsApp`, `Enviar rota para ${courier.name.split(" ")[0]} no WhatsApp`)}
                  </a>
                )}
                {courier && open && (
                  <OrderTracker
                    className="mt-4"
                    orderId={o.id}
                    t={{
                      waiting: T("Esperando repartidor.", "Aguardando motoboy."),
                      preparing: T("{nome} va a retirar el pedido.", "{nome} vai retirar o pedido."),
                      live: T("{nome} en camino", "{nome} a caminho"),
                      eta: T("~{min} min ({km} km)", "~{min} min ({km} km)"),
                      noGps: T("{nome} en camino · sin ubicación reciente (app cerrada)", "{nome} a caminho · sem localização recente (app fechado)"),
                      done: T("Entrega concluida.", "Entrega concluída."),
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}

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
          <ThermalPrintButton url={`/painel/${slug}/imprimir/${o.id}`} label={T("Imprimir en la térmica", "Imprimir na térmica")} />
          <PrintButton label={T("Imprimir (A4)", "Imprimir (A4)")} />
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
              <input name="ruc" className="input" defaultValue={o.customerDoc ?? ""} placeholder={T("RUC del cliente (opcional)", "CPF/CNPJ do cliente (opcional)")} />
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
