import Link from "next/link";
import { requireCrm } from "@/services/crm";
import { visitStats } from "@/services/visits";
import type { VisitArea } from "@/core/visits";

export const metadata = { title: "Acessos" };
export const dynamic = "force-dynamic";

const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";
const COLOR: Record<VisitArea, string> = { site: "#3CC46B", afiliados: "#1F7FD8", link: "#C9842B" };
const RANGES = [7, 30, 90];
const n = (v: number) => v.toLocaleString("pt-BR");
const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Barras dos visitantes por dia (passe o dedo/mouse para ver o número do dia). */
function Bars({ values, days, color }: { values: number[]; days: string[]; color: string }) {
  const max = Math.max(1, ...values);
  const w = 100 / values.length;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Visitantes por dia">
      {values.map((v, i) => {
        const h = (v / max) * 38;
        return (
          <rect key={days[i]} x={i * w + w * 0.15} y={40 - Math.max(h, v ? 1.2 : 0.4)} width={w * 0.7} height={Math.max(h, v ? 1.2 : 0.4)} rx={0.6} fill={color} opacity={i === values.length - 1 ? 1 : 0.75}>
            <title>{`${dayLabel(days[i])}: ${n(v)} ${v === 1 ? "visitante" : "visitantes"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-[var(--s-muted)]">sem período anterior</span>;
  const up = v >= 0;
  return <span className={`text-xs font-bold ${up ? "text-[var(--s-good-fg)]" : "text-red-500"}`}>{up ? "▲" : "▼"} {Math.abs(v)}% vs. período anterior</span>;
}

export default async function Acessos({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireCrm();
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const s = await visitStats(days);
  const devTotal = s.devices.reduce((a, d) => a + d.n, 0) || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Acessos</h1>
          <p className="text-sm text-[var(--s-muted)]">Pessoas diferentes por dia (sem contar a equipe nem afiliados logados).</p>
        </div>
        <div className="flex gap-1 rounded-2xl bg-[var(--s-soft)] p-1 text-sm font-semibold">
          {RANGES.map((r) => (
            <Link key={r} href={`/crm/acessos?dias=${r}`} className={`rounded-xl px-3 py-1.5 ${r === days ? "bg-[var(--s-card)] shadow-sm" : "text-[var(--s-muted)]"}`}>
              {r} dias
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {s.areas.map((a) => (
          <section key={a.id} className={card}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[a.id] }} />{a.label}</p>
                <p className="text-xs text-[var(--s-muted)]">{a.hint}</p>
              </div>
              {a.online > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--s-good-bg)] px-2 py-1 text-xs font-bold text-[var(--s-good-fg)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> {a.online} agora
                </span>
              )}
            </div>
            <p className="mt-4 text-4xl font-black tabular-nums">{n(a.total)}</p>
            <p className="text-sm text-[var(--s-muted)]">visitantes em {days} dias · {n(a.views)} páginas vistas</p>
            <Delta v={a.delta} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-[var(--s-soft)] p-2"><p className="text-xl font-black tabular-nums">{n(a.today)}</p><p className="text-[11px] text-[var(--s-muted)]">hoje</p></div>
              <div className="rounded-2xl bg-[var(--s-soft)] p-2"><p className="text-xl font-black tabular-nums">{n(a.yesterday)}</p><p className="text-[11px] text-[var(--s-muted)]">ontem</p></div>
            </div>
            <div className="mt-4"><Bars values={a.series} days={s.days} color={COLOR[a.id]} /></div>
            <div className="flex justify-between text-[11px] text-[var(--s-muted)]"><span>{dayLabel(s.days[0])}</span><span>hoje</span></div>

            <h3 className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-[var(--s-muted)]">De onde vieram</h3>
            {a.sources.length === 0 ? <p className="mt-2 text-sm text-[var(--s-muted)]">Ainda sem acessos.</p> : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {a.sources.map((x) => (
                  <li key={x.source} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{x.source}</span>
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--s-soft)]"><span className="block h-full rounded-full" style={{ width: `${Math.round((x.n / Math.max(1, a.total)) * 100)}%`, background: COLOR[a.id] }} /></span>
                    <span className="w-10 text-right tabular-nums">{n(x.n)}</span>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-[var(--s-muted)]">Página de entrada</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {a.pages.map((x) => (
                <li key={x.path} className="flex gap-2"><span className="min-w-0 flex-1 truncate font-mono text-xs">{x.path}</span><span className="tabular-nums">{n(x.n)}</span></li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-bold">Afiliados que mais trouxeram gente</h2>
          <p className="text-sm text-[var(--s-muted)]">Cliques únicos nos links /a/CÓDIGO nos últimos {days} dias.</p>
          {s.topLinks.length === 0 ? <p className="mt-3 text-sm text-[var(--s-muted)]">Nenhum clique ainda.</p> : (
            <ol className="mt-3 space-y-2 text-sm">
              {s.topLinks.map((l, i) => (
                <li key={l.code} className="flex items-center gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--s-soft)] text-xs font-bold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate"><b>{l.name}</b> <span className="text-[var(--s-muted)]">· {l.code}</span></span>
                  <span className="font-bold tabular-nums">{n(l.n)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className={card}>
          <h2 className="font-bold">Aparelho</h2>
          <div className="mt-3 space-y-3">
            {s.devices.length === 0 && <p className="text-sm text-[var(--s-muted)]">Ainda sem acessos.</p>}
            {s.devices.map((d) => (
              <div key={d.device}>
                <div className="flex justify-between text-sm"><span className="capitalize">{d.device}</span><span className="tabular-nums">{Math.round((d.n / devTotal) * 100)}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--s-soft)]"><div className="h-full rounded-full bg-[#3CC46B]" style={{ width: `${(d.n / devTotal) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--s-muted)]">Dica: use <span className="font-mono">?origem=instagram</span> (ou whatsapp, panfleto…) nos links que você divulga para saber de onde cada pessoa veio.</p>
        </section>
      </div>
    </div>
  );
}
