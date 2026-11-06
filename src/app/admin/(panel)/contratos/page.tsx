import Link from "next/link";
import { getSettings } from "@/services/billing";
import { listContracts } from "@/services/documents";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ContractsPage() {
  const [rows, s] = await Promise.all([listContracts(), getSettings()]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Contratos dos clientes</h1>
        <p className="text-sm text-muted">Guardados por {s.docsRetentionMonths} meses · <Link className="underline" href="/admin/config">alterar</Link></p>
      </div>
      <p className="text-sm text-muted">
        Gerados automaticamente quando o cliente paga a implantação, com o texto exato que ele aceitou (data, hora e IP do aceite). O cliente recebe o link por e-mail e também vê no painel dele.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr><th className="px-4 py-3">Nº</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Aceite</th><th className="px-4 py-3">Versão</th><th className="px-4 py-3"></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Nenhum contrato ainda.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-mono text-xs">{c.number}</td>
                <td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/admin/clientes/${c.customerId}`}>{c.customer.businessName}</Link><div className="text-xs text-muted">{c.customer.contactName}</div></td>
                <td className="px-4 py-3">{fmt.format(c.acceptedAt)}{c.acceptedIp ? <div className="text-xs text-muted">IP {c.acceptedIp}</div> : null}</td>
                <td className="px-4 py-3">{c.version}</td>
                <td className="px-4 py-3 text-right"><a className="underline" href={`/contrato/${c.id}`} target="_blank">Abrir / imprimir</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
