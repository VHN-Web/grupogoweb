import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LABELS, type OrderStatus } from "@/core/types";
import { parsePaymentConfig } from "@/core/tenant-config";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Receipt } from "@/components/Receipt";
import { PrintButton } from "@/components/PrintButton";
import { getTheme, themeVars } from "@/core/themes";

export const dynamic = "force-dynamic";

const STEPS: Record<string, OrderStatus[]> = {
  DINE_IN: ["RECEIVED", "PREPARING", "READY", "COMPLETED"],
  PICKUP: ["RECEIVED", "PREPARING", "READY", "COMPLETED"],
  DELIVERY: ["RECEIVED", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"],
};

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) notFound();
  const order = await db.query.orders.findFirst({
    where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)),
    with: { items: true },
  });
  if (!order) notFound();

  const steps = STEPS[order.type];
  const current = steps.indexOf(order.status);
  const cancelled = order.status === "CANCELLED";
  const done = order.status === "COMPLETED" || cancelled;
  const pay = parsePaymentConfig(tenant.paymentConfig);

  return (
    <div style={themeVars(tenant.theme, tenant.primaryColor) as React.CSSProperties} className="th min-h-dvh">
    <link rel="stylesheet" href={getTheme(tenant.theme).fonts.google} precedence="default" />
    <div className="mx-auto max-w-xl px-5 py-8">
      {!done && <AutoRefresh ms={6000} />}
      <div className="no-print">
        <Link href={`/${slug}`} className="th-muted text-sm">← {tenant.name}</Link>
        <div className="mt-5 text-center">
          <p className="th-muted text-sm">Tu número de pedido</p>
          <p className="th-h th-accent-text text-6xl font-black tracking-tight tabular-nums">{order.number}</p>
          <p className="th-muted mt-1 text-sm">
            {order.customerName}
            {order.tableLabel && ` · ${order.tableLabel}`}
          </p>
        </div>

        {cancelled ? (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">Pedido cancelado</p>
        ) : (
          <ol className="mt-8 grid grid-cols-4 gap-2">
            {steps.map((s, i) => (
              <li key={s} className="text-center">
                <div className={`h-1.5 rounded-full ${i <= current ? "th-accent" : "th-surface"}`} />
                <p className={`mt-2 text-[11px] font-semibold leading-tight ${i <= current ? "" : "th-muted"}`}>
                  {LABELS.orderStatus[s]}
                </p>
              </li>
            ))}
          </ol>
        )}

        {order.paymentStatus === "PENDING" && !cancelled && (
          <div className="th-surface th-line mt-6 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">Pago pendiente · {LABELS.paymentMethod[order.paymentMethod]}</p>
            <p className="th-muted mt-1">
              {order.paymentMethod === "PIX" && pay.pixKey
                ? `Enviá el Pix a la clave ${pay.pixKey}${pay.pixHolder ? ` (${pay.pixHolder})` : ""} y mostrá el comprobante.`
                : order.paymentMethod === "TRANSFER" && pay.bankInfo
                  ? pay.bankInfo
                  : order.paymentMethod === "CASH"
                    ? "Pagás en efectivo al recibir o en caja."
                    : "Pagás al recibir o en caja."}
            </p>
          </div>
        )}
        {order.paymentStatus === "FAILED" && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">El pago fue rechazado. Avisá al personal o pagá en caja.</p>
        )}
        {order.paymentStatus === "PAID" && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">Pago confirmado ✓</p>
        )}

        <div className="mt-8 mb-3 flex items-center justify-between">
          <h2 className="th-muted text-[13px] font-semibold uppercase tracking-[.12em]">Comprobante</h2>
          <PrintButton label="Imprimir / PDF" className="th-surface th-line rounded-xl border px-4 py-2.5 text-sm font-semibold" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl print:rounded-none">
        <Receipt tenant={tenant} order={order} />
      </div>
    </div>
    </div>
  );
}
