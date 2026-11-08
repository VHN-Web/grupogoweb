import { AffShell } from "@/components/affiliates/AffShell";
import { ShareLink } from "@/components/affiliates/ShareLink";
import { Stat, card } from "@/components/affiliates/ui";
import { pctLabel } from "@/core/affiliates";
import { formatMinor } from "@/core/money";
import { requireActiveAffiliate } from "@/lib/affiliate-auth";
import { affiliateDashboard, recruitLink } from "@/services/affiliates";

export const metadata = { title: "Minha rede — GoWeb Afiliados", robots: { index: false } };

export default async function Network() {
  const a = await requireActiveAffiliate();
  const d = await affiliateDashboard(a.id);
  const pct = pctLabel(d.cfg.referrerPctBp);
  return (
    <AffShell name={a.name} status={a.status}>
      <h1 className="text-2xl font-bold tracking-tight">Minha rede</h1>
      <p className="text-sm text-[var(--s-muted)]">Traga outros afiliados e ganhe {pct} da implantação de cada venda paga deles — sem tirar nada da comissão de quem vendeu.</p>
      <section className="mt-6 rounded-3xl bg-[#0E0E10] p-6 text-[#F4F1EA]">
        <h2 className="font-bold">Link de convite para afiliados</h2>
        <p className="mb-4 mt-1 text-sm text-[#B9B3A7]">Este link é para pessoas que querem ser afiliadas (não para clientes).</p>
        <ShareLink url={recruitLink(a.code)} message="Estou no programa de afiliados da GoWeb: indico o sistema para comércios e ganho comissão por Pix a cada venda. Cadastre-se pelo meu convite:" />
      </section>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat icon="team" label="Afiliados trazidos" value={d.recruits.length} accent="#22A8B8" />
        <Stat icon="check" label="Ativos" value={d.recruits.filter((r) => r.status === "ACTIVE").length} accent="#3CC46B" />
        <Stat icon="cash" label="Ganho com a rede" value={formatMinor(d.money.network, "BRL")} accent="#F2C14E" />
      </section>
      <section className={`${card} mt-6 overflow-hidden`}>
        <h2 className="border-b border-[var(--s-line)] px-5 py-4 font-bold">Quem você trouxe</h2>
        {d.recruits.length === 0 ? (
          <p className="p-8 text-center text-[var(--s-muted)]">Ninguém ainda. Envie o convite para amigos que conhecem comerciantes.</p>
        ) : (
          <ul className="divide-y divide-[var(--s-line)]">
            {d.recruits.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 font-semibold">{r.name}</span>
                <span className="text-xs text-[var(--s-muted)]">{r.status === "ACTIVE" ? "ativo" : r.status === "PENDING" ? "aguardando a live" : "suspenso"}</span>
                <b className="w-24 text-right tabular-nums">{r.sales} {r.sales === 1 ? "venda" : "vendas"}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AffShell>
  );
}
