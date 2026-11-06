import { formatMinor, formatPyg } from "@/core/money";
import { LABELS } from "@/core/types";
import type { Order, OrderItem, Tenant } from "@/db/schema";

/** Comprovante (no fiscal) gerado automaticamente para cada pedido. Formato ticket 80mm. */
export function Receipt({ tenant, order }: { tenant: Pick<Tenant, "name" | "ruc" | "address" | "phone">; order: Order & { items: OrderItem[] } }) {
  const date = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "short", timeZone: "America/Asuncion" }).format(order.createdAt);
  return (
    <div className="mx-auto w-full max-w-[340px] bg-white p-5 font-mono text-[12.5px] leading-relaxed text-black print:max-w-none print:p-0">
      <div className="text-center">
        <p className="text-[15px] font-bold">{tenant.name}</p>
        {tenant.ruc && <p>RUC {tenant.ruc}</p>}
        {tenant.address && <p>{tenant.address}</p>}
        {tenant.phone && <p>{tenant.phone}</p>}
        <p className="mt-2 border-y border-dashed border-black py-1 font-bold">COMPROBANTE DE PEDIDO Nº {order.number}</p>
      </div>
      <div className="mt-2 space-y-0.5">
        <p>Fecha: {date}</p>
        <p>Cliente: {order.customerName}</p>
        <p>
          Tipo: {LABELS.orderType[order.type]}
          {order.tableLabel ? ` · ${order.tableLabel}` : ""}
        </p>
        {order.address && <p>Dirección: {order.address}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {order.items.map((i) => (
        <div key={i.id}>
          <div className="flex justify-between gap-2">
            <span>
              {i.quantity} x {i.name}
            </span>
            <span className="shrink-0">{formatPyg(i.unitPricePyg * i.quantity)}</span>
          </div>
          {i.notes && <p className="pl-4 text-[11px]">» {i.notes}</p>}
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-black" />
      <Line k="Subtotal" v={formatPyg(order.subtotalPyg)} />
      {order.deliveryFeePyg > 0 && <Line k="Delivery" v={formatPyg(order.deliveryFeePyg)} />}
      <Line k={<b>TOTAL</b>} v={<b>{formatPyg(order.totalPyg)}</b>} />
      {order.payCurrency !== "PYG" && (
        <Line k={`Total ${order.payCurrency} (1=${formatPyg(order.exchangeRate)})`} v={formatMinor(order.payAmountMinor, order.payCurrency)} />
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <Line k="Pago" v={`${LABELS.paymentMethod[order.paymentMethod]} · ${LABELS.paymentStatus[order.paymentStatus]}`} />
      {order.cashTenderedMinor != null && <Line k="Paga con" v={formatMinor(order.cashTenderedMinor, order.payCurrency)} />}
      {order.changeDuePyg != null && <Line k="Vuelto" v={formatPyg(order.changeDuePyg)} />}
      {order.notes && <p className="mt-2">Obs: {order.notes}</p>}
      <p className="mt-3 text-center text-[11px]">Documento no válido como factura.</p>
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
