import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canSeeDocument } from "@/lib/doc-access";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { PrintButton } from "@/components/PrintButton";
import { formatMinor } from "@/core/money";
import { getRegion, tr } from "@/core/region";
import { getSettings } from "@/services/billing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recibo — GoWeb", robots: { index: false } };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params;
  const { k } = await searchParams;
  const si = await db.query.serviceInvoices.findFirst({ where: eq(schema.serviceInvoices.id, id), with: { customer: true } });
  if (!si || !(await canSeeDocument(si, k))) notFound();
  const s = await getSettings();
  const region = getRegion(si.customer.country);
  const T = tr(region.locale);
  const when = new Intl.DateTimeFormat(region.intlLocale, { dateStyle: "long", timeZone: region.timeZone }).format(si.issuedAt ?? si.createdAt);
  const isNfse = si.kind === "NFSE";
  return (
    <main className="mx-auto max-w-xl bg-white px-6 py-10 text-black print:px-0 print:py-0" lang={region.locale === "pt" ? "pt-BR" : "es"}>
      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <GoWebLogo height={28} dark={false} />
        <PrintButton className="btn-primary" label={T("Imprimir / guardar PDF", "Imprimir / salvar PDF")} />
      </div>
      {isNfse && si.pdfUrl ? (
        <p>
          <a className="underline" href={si.pdfUrl}>{T("Abrir la nota fiscal (PDF)", "Abrir a nota fiscal (PDF)")}</a>
        </p>
      ) : (
        <div className="rounded-xl border border-gray-300 p-6">
          <h1 className="text-center text-lg font-bold tracking-wide">{isNfse ? T("NOTA FISCAL DE SERVICIO (pendiente)", "NOTA FISCAL DE SERVIÇO (em emissão)") : T("RECIBO DE PAGO", "RECIBO DE PAGAMENTO")}</h1>
          <p className="mt-1 text-center text-sm text-gray-500">Nº {si.number}</p>
          <p className="mt-6 text-[15px] leading-relaxed">
            {T("Recibimos de", "Recebemos de")} <b>{si.takerName}</b>
            {si.takerDoc ? ` (${region.country === "BR" ? "CPF/CNPJ" : "RUC"} ${si.takerDoc})` : ""} {T("el valor de", "a importância de")} <b>{formatMinor(si.amountMinor, si.currency)}</b>,{" "}
            {T("referente a", "referente a")}: {si.description}.
          </p>
          <p className="mt-6 text-sm">{s.legalCity ? `${s.legalCity}, ` : ""}{when}.</p>
          <div className="mt-10 border-t border-gray-400 pt-2 text-center text-sm">
            <b>{s.legalName || s.companyName}</b>
            {s.legalDoc && <div>{region.country === "BR" ? "CPF/CNPJ" : "Doc."} {s.legalDoc}</div>}
            {s.supportEmail && <div className="text-gray-500">{s.supportEmail}</div>}
          </div>
          {!isNfse && (
            <p className="mt-6 text-center text-[11px] text-gray-500">{T("Comprobante de pago. No sustituye a la factura fiscal.", "Comprovante de pagamento. Não substitui a nota fiscal.")}</p>
          )}
        </div>
      )}
    </main>
  );
}
