import { Bar } from "@/components/affiliates/ui";
import { brDayStart, brMonthStart, brWeekStart, fmtDuration, journeySeconds } from "@/core/crm";
import { firstName, fmtBr, requireCrm, teamMetrics } from "@/services/crm";

export const metadata = { title: "Equipe e metas" };
export const dynamic = "force-dynamic";

const PERIODS = { hoje: "Hoje", semana: "Esta semana", mes: "Este mês" } as const;

export default async function Team({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const me = await requireCrm();
  const { p } = await searchParams;
  const period = (p && p in PERIODS ? p : "semana") as keyof typeof PERIODS;
  const from = period === "hoje" ? brDayStart() : period === "mes" ? brMonthStart() : brWeekStart();
  const { rows, journeys } = await teamMetrics(from);
  const names = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  const max = Math.max(1, ...rows.map((r) => r.contacts));
  const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";
  const tot = rows.reduce((a, r) => ({ c: a.c + r.contacts, d: a.d + r.demos, w: a.w + r.won, s: a.s + r.seconds }), { c: 0, d: 0, w: 0, s: 0 });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Equipe e metas</h1>
        <div className="flex overflow-hidden rounded-xl border border-[var(--s-line)] text-sm font-semibold">
          {Object.entries(PERIODS).map(([k, v]) => (
            <a key={k} href={`/crm/equipe?p=${k}`} className={`px-3 py-2 ${period === k ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : ""}`}>{v}</a>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Contatos", tot.c], ["Demos marcadas", tot.d], ["Fechamentos", tot.w], ["Horas de jornada", fmtDuration(tot.s)]].map(([l, v]) => (
          <div key={l as string} className={card}><p className="text-xs text-[var(--s-muted)]">{l}</p><p className="mt-1 text-2xl font-bold tabular-nums">{v}</p></div>
        ))}
      </div>
      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-[var(--s-muted)]">
            <tr className="border-b border-[var(--s-line)]"><th className="py-2">Sócio</th><th className="w-1/3">Contatos</th><th className="text-right">Demos</th><th className="text-right">Fechados</th><th className="text-right">Perdidos</th><th className="text-right">Conversão</th><th className="text-right">Jornada</th><th className="text-right">Leads na carteira</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-[var(--s-line)] last:border-0 ${r.id === me.id ? "bg-[var(--s-good-bg)]" : ""}`}>
                <td className="py-3 pl-2 font-semibold">{r.id === me.id ? `${firstName(r.name)} (você)` : r.name}</td>
                <td className="pr-4"><div className="flex items-center gap-2"><Bar pct={r.contacts / max} h={8} /><b className="w-8 text-right tabular-nums">{r.contacts}</b></div></td>
                <td className="text-right tabular-nums">{r.demos}</td>
                <td className="text-right font-bold tabular-nums">{r.won}</td>
                <td className="text-right tabular-nums">{r.lost}</td>
                <td className="text-right tabular-nums">{r.contacts ? `${(r.conv * 100).toFixed(1)}%` : "—"}</td>
                <td className="text-right tabular-nums">{fmtDuration(r.seconds)}</td>
                <td className="pr-2 text-right tabular-nums">{r.leads}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-[var(--s-muted)]">Conversão = fechamentos ÷ contatos no período.</p>
      </section>
      <section className={card}>
        <h2 className="font-bold">Jornadas</h2>
        <ul className="mt-3 divide-y divide-[var(--s-line)] text-sm">
          {journeys.map((j) => {
            const s = (() => { try { return JSON.parse(j.summary ?? "null"); } catch { return null; } })();
            return (
              <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <b className="w-24">{firstName(names[j.actorId] ?? "—")}</b>
                <span className="text-[var(--s-muted)]">{fmtBr(j.startedAt)}{j.endedAt ? ` → ${j.endedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` : " · em andamento"}</span>
                <span className="ml-auto tabular-nums">{fmtDuration(journeySeconds(j))}{s ? ` · ${s.contacts} contatos · ${s.demos} demos` : ""}</span>
              </li>
            );
          })}
          {journeys.length === 0 && <li className="py-3 text-[var(--s-muted)]">Nenhuma jornada no período.</li>}
        </ul>
      </section>
    </div>
  );
}
