import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CURRENCIES, type Currency } from "@/core/types";
import { amountIn, fmtDate } from "@/core/billing";
import { formatMinor } from "@/core/money";
import { getBillingProvider } from "@/adapters/billing/registry";
import { gatewayMap, getSettings } from "@/services/billing";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PayInvoice } from "./PayInvoice";
import { AtlasLogo } from "@/components/brand/AtlasLogo";

export const dynamic = "force-dynamic";

const CUR_LABEL: Record<Currency, string> = { PYG: "Guaraníes", USD: "Dólares", BRL: "Reales" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id), with: { customer: true } });
  if (!inv) notFound();
  const settings = await getSettings();
  const gw = gatewayMap(settings.gatewayByCurrency);
  const options = CURRENCIES.map((c) => {
    const p = getBillingProvider(gw[c]);
    return {
      currency: c,
      label: CUR_LABEL[c],
      amount: formatMinor(amountIn(inv, c), c),
      available: amountIn(inv, c) > 0 && !!p && p.isConfigured() && p.currencies.includes(c),
      via: p?.id === "manual" ? "Transferencia / depósito" : p?.label.split(" (")[0] ?? "",
    };
  });

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      {inv.status === "OPEN" && <AutoRefresh ms={8000} />}
      <AtlasLogo height={22} ink="#0E0E10" />
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Factura de {inv.customer.businessName}</h1>
      <p className="mt-1 text-sm text-muted">{inv.description}</p>

      <div className="card mt-6 space-y-1.5 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted">Vencimiento</span><b>{fmtDate(inv.dueAt)}</b></div>
        <div className="flex justify-between">
          <span className="text-muted">Estado</span>
          <b className={inv.status === "PAID" ? "text-emerald-700" : inv.status === "CANCELLED" ? "text-muted" : ""}>
            {inv.status === "PAID" ? "Pagada ✓" : inv.status === "CANCELLED" ? "Anulada" : "Pendiente"}
          </b>
        </div>
        {inv.status === "PAID" && inv.paidCurrency && inv.paidAmountMinor != null && (
          <div className="flex justify-between"><span className="text-muted">Pagado</span><b>{formatMinor(inv.paidAmountMinor, inv.paidCurrency)}</b></div>
        )}
      </div>

      {inv.status === "OPEN" ? (
        <PayInvoice invoiceId={inv.id} options={options} defaultCurrency={inv.customer.preferredCurrency} />
      ) : inv.status === "PAID" ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">¡Gracias! Pago confirmado.</p>
      ) : null}

      {(settings.supportWhatsapp || settings.supportEmail) && (
        <p className="mt-8 text-center text-xs text-muted">
          ¿Dudas? {settings.supportWhatsapp && <>WhatsApp {settings.supportWhatsapp}</>} {settings.supportEmail && <>· {settings.supportEmail}</>}
        </p>
      )}
    </main>
  );
}
