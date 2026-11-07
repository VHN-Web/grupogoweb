import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Currency } from "@/core/types";
import { amountIn, fmtDate } from "@/core/billing";
import { formatMinor } from "@/core/money";
import { getBillingProvider } from "@/adapters/billing/registry";
import { gatewayMap, getSettings } from "@/services/billing";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PayInvoice } from "./PayInvoice";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { getRegion, tr } from "@/core/region";
import { contractSummary, previewContract } from "@/services/documents";
import { ContractBody } from "@/components/ContractBody";
import { AcceptStep } from "./AcceptStep";

export const dynamic = "force-dynamic";

const CUR_LABEL: Record<Currency, [string, string]> = { PYG: ["Guaraníes", "Guaranis"], USD: ["Dólares", "Dólares"], BRL: ["Reales", "Reais"] };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, id), with: { customer: { with: { plan: true } } } });
  if (!inv) notFound();
  const settings = await getSettings();
  const locale = getRegion(inv.customer.country).locale;
  const T = tr(locale);
  // Cada país vê só as suas moedas: Brasil = R$; Paraguai = Gs. e US$
  const order: Currency[] = locale === "pt" ? ["BRL"] : ["PYG", "USD"];
  const gw = gatewayMap(settings.gatewayByCurrency);
  const options = order.map((c) => {
    const p = getBillingProvider(gw[c]);
    return {
      currency: c,
      label: T(CUR_LABEL[c][0], CUR_LABEL[c][1]),
      amount: formatMinor(amountIn(inv, c), c),
      available: amountIn(inv, c) > 0 && !!p && p.isConfigured() && p.currencies.includes(c),
      via: p?.id === "manual" ? T("Transferencia / depósito", "Transferência / depósito") : p?.label.split(" (")[0] ?? "",
    };
  });

  const sum = contractSummary(inv.customer, inv.customer.plan, settings);
  const m = (v: number) => formatMinor(v, sum.currency);
  const per = sum.interval === "YEARLY" ? T("Anualidad", "Anuidade") : T("Mensualidad", "Mensalidade");
  const isSetup = inv.kind === "SETUP";
  const contract = isSetup ? previewContract(inv.customer, inv.customer.plan, settings) : null;
  const Summary = () => (
    <section className="card mt-4 space-y-3 p-4 text-sm">
      <h2 className="font-semibold">{T("Resumen de lo que estás contratando", "Resumo do que você está contratando")}</h2>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3"><span className="text-muted">{T("Plan", "Plano")}</span><b className="text-right">{sum.planName}</b></div>
        {isSetup && (
          <div className="flex justify-between gap-3"><span className="text-muted">{T("Implementación (pago único, ahora)", "Implantação (pagamento único, agora)")}</span><b>{m(sum.setupMinor)}</b></div>
        )}
        {isSetup && sum.domainMinor > 0 && (
          <div className="flex justify-between gap-3"><span className="text-muted">{T("Dominio propio (1er año)", "Domínio próprio (1º ano)")}</span><b>{m(sum.domainMinor)}</b></div>
        )}
        <div className="flex justify-between gap-3">
          <span className="text-muted">{per} {isSetup ? T("(desde la entrega del sistema)", "(a partir da entrega do sistema)") : ""}</span>
          <b>{m(sum.recurringMinor)}</b>
        </div>
        {isSetup && (
          <div className="flex justify-between gap-3 border-t border-line pt-1.5"><span className="font-semibold">{T("Total a pagar hoy", "Total a pagar hoje")}</span><b className="text-base">{m(amountIn(inv, sum.currency))}</b></div>
        )}
      </div>
      {isSetup && (
        <div>
          <p className="font-medium">{T("Servicios incluidos", "Serviços incluídos")}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            <li>{T("Implementación: configuramos tu sitio, cargamos tu menú/catálogo, logo, colores, mesas con QR y medios de pago.", "Implantação: configuramos seu site, cadastramos seu cardápio/catálogo, logo, cores, mesas com QR e formas de pagamento.")}</li>
            {sum.features.map((f) => <li key={f}>{f}</li>)}
            {sum.wantsDomain && <li>{T("Dominio propio", "Domínio próprio")}{sum.domainName ? ` (${sum.domainName})` : ""}{sum.domainIncluded ? T(" — incluido", " — incluso") : ""}</li>}
          </ul>
        </div>
      )}
      {isSetup && (
        <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-950 ring-1 ring-amber-200">
          <li>✓ {T("Sin permanencia mínima: cancelás cuando quieras.", "Sem fidelidade: cancele quando quiser.")}</li>
          <li>✓ {T("Arrepentimiento en hasta 7 días: no se cobra ninguna mensualidad.", "Arrependimento em até 7 dias: nenhuma mensalidade é cobrada.")}</li>
          <li><b>{T("La implementación no es reembolsable", "A implantação não é reembolsável")}</b>{T(" — es un servicio personalizado que empieza apenas pagás.", " — é um serviço personalizado que começa assim que você paga.")}</li>
        </ul>
      )}
      {contract && (
        <details className="rounded-xl ring-1 ring-line">
          <summary className="cursor-pointer px-3 py-2.5 font-medium">{T("Leer el contrato completo", "Ler o contrato completo")}</summary>
          <div className="max-h-[50vh] overflow-y-auto border-t border-line px-3 pb-3">
            <h3 className="pt-3 text-[15px] font-bold">{contract.title}</h3>
            <ContractBody body={contract.body} />
          </div>
        </details>
      )}
    </section>
  );

  return (
    <main className="mx-auto max-w-md px-5 py-10" lang={locale === "pt" ? "pt-BR" : "es"}>
      {inv.status === "OPEN" && <AutoRefresh ms={8000} />}
      <GoWebLogo height={30} dark={false} />
      <h1 className="mt-2 text-2xl font-bold tracking-tight">{T("Factura de", "Fatura de")} {inv.customer.businessName}</h1>
      <p className="mt-1 text-sm text-muted">{inv.description}</p>

      <div className="card mt-6 space-y-1.5 p-4 text-sm">
        <div className="flex justify-between"><span className="text-muted">{T("Vencimiento", "Vencimento")}</span><b>{fmtDate(inv.dueAt)}</b></div>
        <div className="flex justify-between">
          <span className="text-muted">{T("Estado", "Status")}</span>
          <b className={inv.status === "PAID" ? "text-emerald-700" : inv.status === "CANCELLED" ? "text-muted" : ""}>
            {inv.status === "PAID" ? T("Pagada ✓", "Paga ✓") : inv.status === "CANCELLED" ? T("Anulada", "Cancelada") : T("Pendiente", "Pendente")}
          </b>
        </div>
        {inv.status === "PAID" && inv.paidCurrency && inv.paidAmountMinor != null && (
          <div className="flex justify-between"><span className="text-muted">{T("Pagado", "Pago")}</span><b>{formatMinor(inv.paidAmountMinor, inv.paidCurrency)}</b></div>
        )}
      </div>

      {inv.status === "OPEN" && <Summary />}

      {inv.status === "OPEN" ? (
        <AcceptStep invoiceId={inv.id} accepted={inv.kind !== "SETUP" || !!inv.acceptedAt} locale={locale}>
          <PayInvoice invoiceId={inv.id} options={options} defaultCurrency={inv.customer.preferredCurrency} locale={locale} />
        </AcceptStep>
      ) : inv.status === "PAID" ? (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">{T("¡Gracias! Pago confirmado.", "Obrigado! Pagamento confirmado.")}</p>
      ) : null}

      {(settings.supportWhatsapp || settings.supportEmail) && (
        <p className="mt-8 text-center text-xs text-muted">
          {T("¿Dudas?", "Dúvidas?")} {settings.supportWhatsapp && <>WhatsApp {settings.supportWhatsapp}</>} {settings.supportEmail && <>· {settings.supportEmail}</>}
        </p>
      )}
    </main>
  );
}
