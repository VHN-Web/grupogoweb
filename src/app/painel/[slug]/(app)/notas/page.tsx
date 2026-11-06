import { desc, eq } from "drizzle-orm";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { CURRENCY_SYMBOL } from "@/core/money";
import type { Currency } from "@/core/types";
import { updateFiscalDoc, registerFiscalDoc } from "../actions";

export const dynamic = "force-dynamic";

export default async function FiscalPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ d?: string }> }) {
  const { slug } = await params;
  const { d } = await searchParams;
  const dir = d === "RECEIVED" ? "RECEIVED" : "ISSUED";
  const t = await requireTenantAdmin(slug, "fiscal");
  const { T, fm, fmtDate, region } = panelI18n(t);
  const docs = await db.query.fiscalDocuments.findMany({
    where: eq(schema.fiscalDocuments.tenantId, t.id),
    orderBy: desc(schema.fiscalDocuments.issuedAt),
    limit: 200,
  });
  const list = docs.filter((x) => x.direction === dir && x.status !== "CANCELLED");
  const tot = (k: "totalPyg" | "iva10Pyg" | "iva5Pyg") => list.reduce((s, x) => s + x[k], 0);
  const fmt = { format: (x: Date) => fmtDate(x, { dateStyle: "short" }) };
  const isPY = t.country === "PY";
  const sym = CURRENCY_SYMBOL[t.currency as Currency];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{T("Facturas", "Notas fiscais")}</h1>
        <div className="flex rounded-xl bg-white p-1 ring-1 ring-line">
          <a href="?d=ISSUED" className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${dir === "ISSUED" ? "bg-ink text-white" : "text-muted"}`}>{T("Emitidas (ventas)", "Emitidas (vendas)")}</a>
          <a href="?d=RECEIVED" className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${dir === "RECEIVED" ? "bg-ink text-white" : "text-muted"}`}>{T("Recibidas (compras)", "Recebidas (compras)")}</a>
        </div>
      </div>
      <p className="rounded-xl bg-white px-4 py-3 text-sm text-muted ring-1 ring-line">
        {isPY
          ? "Registro manual de facturas (talonario). La emisión electrónica vía SIFEN está preparada como módulo y se activa en Configuración cuando esté homologada."
          : T("Registro manual de notas.", "Registro manual das notas fiscais (emitidas no seu emissor/contador). A emissão eletrônica NFC-e/NF-e será um módulo de integração.")}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <div className="card px-4 py-3"><p className="text-xs text-muted">Total</p><p className="font-bold">{fm(tot("totalPyg"))}</p></div>
        {isPY && (
          <>
            <div className="card px-4 py-3"><p className="text-xs text-muted">IVA 10%</p><p className="font-bold">{fm(tot("iva10Pyg"))}</p></div>
            <div className="card px-4 py-3"><p className="text-xs text-muted">IVA 5%</p><p className="font-bold">{fm(tot("iva5Pyg"))}</p></div>
          </>
        )}
      </div>

      <details className="card p-4" open={list.length === 0}>
        <summary className="cursor-pointer font-semibold">{dir === "ISSUED" ? T("+ Registrar factura emitida", "+ Registrar nota emitida") : T("+ Registrar factura de compra", "+ Registrar nota de compra")}</summary>
        <form action={registerFiscalDoc.bind(null, slug)} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="direction" value={dir} />
          <input name="docNumber" className="input" placeholder={isPY ? "Nº 001-001-0000123" : "Nº 000123 / série 1"} />
          {isPY ? <input name="timbrado" className="input" placeholder="Timbrado" /> : <input name="timbrado" className="input" placeholder={T("Serie", "Chave de acesso (opcional)")} />}
          <input name="issuedAt" type="date" className="input" />
          <input name="partyRuc" className="input" placeholder={dir === "ISSUED" ? `${region.taxIdLabel} ${T("del cliente", "do cliente")}` : `${region.taxIdLabel} ${T("del proveedor", "do fornecedor")}`} />
          <input name="partyName" className="input" placeholder={T("Razón social", "Razão social")} />
          <MoneyInput name="totalPyg" currency={t.currency as Currency} placeholder={`Total ${sym}`} required />
          {isPY ? (
            <select name="iva" className="input">
              <option value="10">IVA 10% incluido</option>
              <option value="5">IVA 5% incluido</option>
              <option value="EX">Exenta</option>
            </select>
          ) : (
            <input type="hidden" name="iva" value="EX" />
          )}
          <input name="notes" className="input sm:col-span-1" placeholder={T("Notas", "Observações")} />
          <button className="btn-primary">{T("Registrar", "Registrar")}</button>
        </form>
      </details>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 font-medium">{T("Fecha", "Data")}</th>
              <th className="px-4 py-2.5 font-medium">{T("Número", "Número")}</th>
              <th className="px-4 py-2.5 font-medium">{dir === "ISSUED" ? T("Cliente", "Cliente") : T("Proveedor", "Fornecedor")}</th>
              <th className="px-4 py-2.5 font-medium">{T("Origen", "Origem")}</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">{T("Sin facturas registradas", "Nenhuma nota registrada")}</td></tr>
            )}
            {list.map((x) => (
              <tr key={x.id}>
                <td className="px-4 py-2.5">{fmt.format(x.issuedAt)}</td>
                <td className="px-4 py-2.5">
                  <form action={updateFiscalDoc.bind(null, slug, x.id)} className="flex gap-1">
                    <input name="docNumber" defaultValue={x.docNumber ?? ""} className="input w-40 py-1" placeholder={T("Completar Nº", "Preencher Nº")} />
                    <button className="px-2 text-muted hover:text-ink" aria-label="Guardar">✓</button>
                  </form>
                </td>
                <td className="px-4 py-2.5">{x.partyName ?? "—"} {x.partyRuc && <span className="text-muted">· {x.partyRuc}</span>}</td>
                <td className="px-4 py-2.5 text-muted">{x.orderId ? T("Pedido", "Pedido") : T("Manual", "Manual")} · {x.provider}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{fm(x.totalPyg)}</td>
                <td className="px-4 py-2.5 text-right">
                  <form action={updateFiscalDoc.bind(null, slug, x.id)}>
                    <input type="hidden" name="docNumber" value={x.docNumber ?? ""} />
                    <input type="hidden" name="status" value="CANCELLED" />
                    <button className="text-xs text-red-600 hover:underline">{T("Anular", "Cancelar")}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
