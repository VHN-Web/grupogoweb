import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canSeeDocument } from "@/lib/doc-access";
import { ContractBody } from "@/components/ContractBody";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { PrintButton } from "@/components/PrintButton";
import { getRegion, tr } from "@/core/region";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contrato — GoWeb", robots: { index: false } };

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string }> }) {
  const { id } = await params;
  const { k } = await searchParams;
  const ct = await db.query.contracts.findFirst({ where: eq(schema.contracts.id, id), with: { customer: true } });
  if (!ct || !(await canSeeDocument(ct, k))) notFound();
  const locale = getRegion(ct.customer.country).locale;
  const T = tr(locale);
  return (
    <main className="mx-auto max-w-2xl bg-white px-6 py-10 text-black print:px-0 print:py-0" lang={locale === "pt" ? "pt-BR" : "es"}>
      <div className="no-print mb-6 flex items-center justify-between gap-3">
        <GoWebLogo height={28} dark={false} />
        <PrintButton className="btn-primary" label={T("Imprimir / guardar PDF", "Imprimir / salvar PDF")} />
      </div>
      <h1 className="text-xl font-bold">{ct.title}</h1>
      <ContractBody body={ct.body} className="mt-4" />
      <p className="mt-8 border-t pt-3 text-xs text-gray-500">
        {T("Documento generado electrónicamente", "Documento gerado eletronicamente")} · {ct.number} · {T("versión", "versão")} {ct.version}
      </p>
    </main>
  );
}
