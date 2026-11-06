import Link from "next/link";
import { formatMinor } from "@/core/money";
import { getSettings } from "@/services/billing";
import { listServiceInvoices } from "@/services/documents";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ServiceInvoicesPage() {
  const [rows, s] = await Promise.all([listServiceInvoices(), getSettings()]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Notas fiscais e recibos</h1>
        <p className="text-sm text-muted">Guardados por {s.docsRetentionMonths} meses</p>
      </div>
      <div className={`rounded-xl px-4 py-3 text-sm ring-1 ${s.nfseEnabled ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-950 ring-amber-200"}`}>
        {s.nfseEnabled ? (
          <>Emissão de NFS-e <b>ativada</b> ({s.nfseProvider}). Cada pagamento gera uma nota “em emissão”.</>
        ) : (
          <>
            Emissão de NFS-e <b>desligada</b>: cada pagamento gera um <b>recibo</b>. Quando abrir a conta PJ, ative em <Link className="underline" href="/admin/config">Configurações → Nota fiscal de serviço</Link>.
          </>
        )}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr><th className="px-4 py-3">Nº</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Referente a</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Data</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">Nenhum documento ainda.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-mono text-xs">{r.number}</td>
                <td className="px-4 py-3">{r.kind === "NFSE" ? (r.status === "ISSUED" ? "NFS-e" : <span className="text-amber-700" title={r.error ?? ""}>NFS-e em emissão</span>) : "Recibo"}</td>
                <td className="px-4 py-3"><Link className="hover:underline" href={`/admin/clientes/${r.customerId}`}>{r.customer.businessName}</Link></td>
                <td className="px-4 py-3 text-muted">{r.description}</td>
                <td className="px-4 py-3 font-semibold">{formatMinor(r.amountMinor, r.currency)}</td>
                <td className="px-4 py-3">{fmt.format(r.issuedAt ?? r.createdAt)}</td>
                <td className="px-4 py-3 text-right"><a className="underline" href={`/recibo/${r.id}`} target="_blank">Abrir</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
