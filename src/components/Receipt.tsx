import { formatMoney, MINOR_UNITS } from "@/core/money";
import { getLabels, type Currency } from "@/core/types";
import { formatCpf, formatPhone, getRegion, tr } from "@/core/region";
import type { Order, OrderItem, Tenant } from "@/db/schema";

/** Comprovante (no fiscal) gerado automaticamente para cada pedido. Formato ticket 80mm. */
export function Receipt({ tenant, order }: { tenant: Pick<Tenant, "name" | "ruc" | "address" | "phone" | "country" | "currency">; order: Order & { items: OrderItem[] } }) {
  const region = getRegion(tenant.country);
  const T = tr(region.locale);
  const L = getLabels(region.locale);
  const base = tenant.currency as Currency;
  const m = (v: number) => formatMoney(v, base);
  const date = new Intl.DateTimeFormat(region.intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: region.timeZone }).format(order.createdAt);
  return (
    <div className="mx-auto w-full max-w-[340px] bg-white p-5 font-mono text-[12.5px] leading-relaxed text-black print:max-w-none print:p-0">
      <div className="text-center">
        <p className="text-[15px] font-bold">{tenant.name}</p>
        {tenant.ruc && <p>{region.country === "BR" ? "CNPJ" : "RUC"} {tenant.ruc}</p>}
        {tenant.address && <p>{tenant.address}</p>}
        {tenant.phone && <p>{formatPhone(tenant.phone) || tenant.phone}</p>}
        <p className="mt-2 border-y border-dashed border-black py-1 font-bold">{T("COMPROBANTE DE PEDIDO", "COMPROVANTE DE PEDIDO")} Nº {order.number}</p>
      </div>
      <div className="mt-2 space-y-0.5">
        <p>{T("Fecha", "Data")}: {date}</p>
        <p>Cliente: {order.customerName}</p>
        {order.customerDoc && <p>CPF: {formatCpf(order.customerDoc)}</p>}
        <p>
          Tipo: {L.orderType[order.type]}
          {order.tableLabel ? ` · ${order.tableLabel}` : ""}
        </p>
        {order.address && <p>{T("Dirección", "Endereço")}: {order.address}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {order.items.map((i) => (
        <div key={i.id}>
          <div className="flex justify-between gap-2">
            <span>
              {i.quantity} x {i.name}
            </span>
            <span className="shrink-0">{m(i.unitPricePyg * i.quantity)}</span>
          </div>
          {i.notes && <p className="pl-4 text-[11px]">» {i.notes}</p>}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <Line k="Subtotal" v={m(order.subtotalPyg)} />
      {order.discountPyg > 0 && <Line k={`${T("Descuento", "Desconto")}${order.couponCode ? ` (${order.couponCode})` : ""}`} v={`-${m(order.discountPyg)}`} />}
      {order.deliveryFeePyg > 0 && <Line k={T("Delivery", "Entrega")} v={m(order.deliveryFeePyg)} />}
      <Line k={<b>TOTAL</b>} v={<b>{m(order.totalPyg)}</b>} />
      {order.payCurrency !== base && (
        <Line k={`Total ${order.payCurrency} (1=${m(Math.round(order.exchangeRate * MINOR_UNITS[base]))})`} v={formatMoney(order.payAmountMinor, order.payCurrency)} />
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <Line k={T("Pago", "Pagamento")} v={`${L.paymentMethod[order.paymentMethod]} · ${L.paymentStatus[order.paymentStatus]}`} />
      {order.cashTenderedMinor != null && <Line k={T("Paga con", "Pago com")} v={formatMoney(order.cashTenderedMinor, order.payCurrency)} />}
      {order.changeDuePyg != null && <Line k={T("Vuelto", "Troco")} v={m(order.changeDuePyg)} />}
      {order.notes && <p className="mt-2">Obs: {order.notes}</p>}
      <p className="mt-3 text-center text-[11px]">{T("Documento no válido como factura.", "Documento sem valor fiscal.")}</p>
    </div>
  );
}

function Line({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
