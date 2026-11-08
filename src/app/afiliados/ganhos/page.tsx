import { AffShell } from "@/components/affiliates/AffShell";
import { Stat, TierBadge, card, tierStyle } from "@/components/affiliates/ui";
import { pctLabel } from "@/core/affiliates";
import { formatMinor } from "@/core/money";
import { requireActiveAffiliate } from "@/lib/affiliate-auth";
import { affiliateDashboard } from "@/services/affiliates";

export const metadata = { title: "Ganhos — GoWeb Afiliados", robots: { index: false } };
const brl = (m: number) => formatMinor(m, "BRL");
const ST = { PENDING: ["A receber", "#F2C14E"], PAID: ["Pago", "#3CC46B"], CANCELLED: ["Cancelada", "#E0614A"] } as const;

export default async function Earnings() {
  const a = await requireActiveAffiliate();
  const d = await affiliateDashboard(a.id);
  return (
    <AffShell name={a.name} status={a.status}>
      <h1 className="text-2xl font-bold tracking-tight">Ganhos</h1>
      <p className="text-sm text-[var(--s-muted)]">A comissão aparece aqui no momento em que o cliente paga a implantação. O pagamento é feito por Pix na chave <b>{a.pixKey}</b>.</p>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="cash" label="A receber" value={brl(d.money.pending)} accent="#F2C14E" />
        <Stat icon="check" label="Já recebido" value={brl(d.money.paid)} accent="#3CC46B" />
        <Stat icon="growth" label="Neste mês" value={brl(d.money.month)} accent="#1F7FD8" />
        <Stat icon="team" label="Da rede" value={brl(d.money.network)} accent="#22A8B8" />
      </section>

      <section className={`${card} mt-6 overflow-hidden`}>
        <h2 className="border-b border-[var(--s-line)] px-5 py-4 font-bold">Histórico</h2>
        {d.commissions.length === 0 ? (
          <p className="p-8 text-center text-[var(--s-muted)]">Ainda sem comissões. A primeira venda paga aparece aqui na hora.</p>
        ) : (
          <ul className="divide-y divide-[var(--s-line)]">
            {d.commissions.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{k.customer?.businessName ?? "Cliente"}</p>
                  <p className="text-xs text-[var(--s-muted)]">
                    {k.level === 2 ? "Venda da sua rede" : k.kind === "ANNUAL" ? "1ª anuidade (plano anual)" : `Implantação${k.tierName ? ` · nível ${k.tierName}` : ""}`} · {pctLabel(k.pctBp)} de {brl(k.baseMinor)} · {k.createdAt.toLocaleDateString("pt-BR")}
                    {k.status === "PAID" && k.paidAt ? ` · pago em ${k.paidAt.toLocaleDateString("pt-BR")}` : ""}
                    {k.status === "CANCELLED" && k.cancelReason ? ` · ${k.cancelReason}` : ""}
                  </p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${ST[k.status][1]}22`, color: ST[k.status][1] }}>{ST[k.status][0]}</span>
                <b className={`w-28 text-right tabular-nums ${k.status === "CANCELLED" ? "line-through opacity-50" : ""}`}>{brl(k.amountMinor)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} mt-6 p-6`}>
        <h2 className="font-bold">Tabela de comissões</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {d.cfg.tiers.map((t, i) => (
            <div key={t.name} className={`rounded-2xl border p-4 ${i === d.tier.index ? "border-2" : "border-[var(--s-line)]"}`} style={i === d.tier.index ? { borderColor: tierStyle(i).color } : undefined}>
              <TierBadge index={i} name={t.name} size={40} />
              <p className="mt-2 font-bold" style={{ color: tierStyle(i).color }}>{t.name}{i === d.tier.index ? " · você" : ""}</p>
              <p className="text-2xl font-bold">{pctLabel(t.pctBp)}</p>
              <p className="text-xs text-[var(--s-muted)]">{d.cfg.tiers[i + 1] ? `${t.minSales} a ${d.cfg.tiers[i + 1].minSales - 1} vendas` : `${t.minSales}+ vendas`}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--s-muted)]">Plano anual: + {pctLabel(d.cfg.annualPctBp)} da 1ª anuidade. Rede: {pctLabel(d.cfg.referrerPctBp)} da implantação de cada venda de quem você trouxe.</p>
      </section>
    </AffShell>
  );
}
