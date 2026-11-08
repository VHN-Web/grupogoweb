import { AffShell } from "@/components/affiliates/AffShell";
import { Medal, card } from "@/components/affiliates/ui";
import { Icon } from "@/components/ui/Icon";
import { requireActiveAffiliate } from "@/lib/affiliate-auth";
import { monthlyRanking } from "@/services/affiliates";

export const metadata = { title: "Ranking — GoWeb Afiliados", robots: { index: false } };

export default async function Ranking() {
  const a = await requireActiveAffiliate();
  const now = new Date();
  const all = await monthlyRanking(100);
  const prev = await monthlyRanking(3, new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const me = all.find((r) => r.affiliateId === a.id);
  const top3 = all.slice(0, 3);
  const month = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const podium = [top3[1], top3[0], top3[2]];
  return (
    <AffShell name={a.name} status={a.status}>
      <h1 className="text-2xl font-bold tracking-tight">Ranking de {month}</h1>
      <p className="text-sm text-[var(--s-muted)]">Conta as vendas pagas no mês (implantações). Prêmios das campanhas são anunciados nas lives.</p>

      <section className="mt-6 rounded-[28px] bg-[#0E0E10] p-6 text-[#F4F1EA] sm:p-8">
        {top3.length === 0 ? (
          <p className="py-6 text-center text-[#B9B3A7]">O pódio está vazio. A primeira venda do mês leva você ao topo!</p>
        ) : (
          <div className="flex items-end justify-center gap-3 sm:gap-6">
            {podium.map((r, i) => {
              if (!r) return <div key={i} className="w-24 sm:w-32" />;
              const h = r.pos === 1 ? 150 : r.pos === 2 ? 110 : 80;
              const c = r.pos === 1 ? "#F2C14E" : r.pos === 2 ? "#AEB8C4" : "#CD8A4A";
              return (
                <div key={r.affiliateId} className="aff-pop w-24 text-center sm:w-32" style={{ animationDelay: `${i * 0.12}s` }}>
                  {r.pos === 1 && <span className="aff-float mx-auto mb-1 block w-fit text-[#F2C14E]"><Icon name="star" size={28} /></span>}
                  <p className="truncate font-bold">{r.affiliateId === a.id ? "Você" : r.name}</p>
                  <p className="text-xs text-[#B9B3A7]">{r.sales} {r.sales === 1 ? "venda" : "vendas"}</p>
                  <div className="mt-2 grid place-items-start rounded-t-2xl pt-3 text-3xl font-black text-[#0E0E10]" style={{ height: h, background: c }}>
                    <span className="w-full text-center">{r.pos}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className={`${card} overflow-hidden`}>
          <h2 className="border-b border-[var(--s-line)] px-5 py-4 font-bold">Classificação</h2>
          <ol className="divide-y divide-[var(--s-line)]">
            {all.slice(0, 20).map((r) => (
              <li key={r.affiliateId} className={`flex items-center gap-3 px-5 py-3 ${r.affiliateId === a.id ? "bg-[var(--s-good-bg)]" : ""}`}>
                <Medal pos={r.pos} />
                <span className="flex-1 truncate font-semibold">{r.affiliateId === a.id ? "Você" : r.name}{r.city ? <span className="font-normal text-[var(--s-muted)]"> · {r.city}</span> : null}</span>
                <b className="tabular-nums">{r.sales}</b>
              </li>
            ))}
            {all.length === 0 && <li className="p-6 text-center text-[var(--s-muted)]">Sem vendas neste mês ainda.</li>}
          </ol>
        </section>
        <div className="space-y-6">
          <section className={`${card} p-6`}>
            <h2 className="font-bold">Sua posição</h2>
            <p className="mt-2 text-4xl font-black">{me ? `${me.pos}º` : "—"}</p>
            <p className="text-sm text-[var(--s-muted)]">{me ? `${me.sales} ${me.sales === 1 ? "venda" : "vendas"} neste mês` : "Faça a sua primeira venda do mês para entrar no ranking."}</p>
            {me && me.pos > 1 && <p className="mt-2 text-sm">Faltam <b>{all[me.pos - 2].sales - me.sales + 1}</b> {all[me.pos - 2].sales - me.sales + 1 === 1 ? "venda" : "vendas"} para passar o {me.pos - 1}º lugar.</p>}
          </section>
          {prev.length > 0 && (
            <section className={`${card} p-6`}>
              <h2 className="font-bold">Campeões do mês passado</h2>
              <ol className="mt-3 space-y-2">
                {prev.map((r) => (
                  <li key={r.affiliateId} className="flex items-center gap-3"><Medal pos={r.pos} /><span className="flex-1 font-semibold">{r.name}</span><span className="text-sm text-[var(--s-muted)]">{r.sales}</span></li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </AffShell>
  );
}
