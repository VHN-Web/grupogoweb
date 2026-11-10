import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Bar, Medal, Ring } from "@/components/affiliates/ui";
import { InstallHint } from "@/components/crm/InstallHint";
import { Journey } from "@/components/crm/Journey";
import { QuickCounters } from "@/components/crm/QuickCounters";
import { CRM_STATUSES, CRM_STATUS_COLOR, CRM_STATUS_LABEL, goalPct } from "@/core/crm";
import { formatMinor } from "@/core/money";
import { dashboard, firstName, fmtBr, requireCrm } from "@/services/crm";
import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { googleCalendarLink } from "@/core/goweb-bot";

export const metadata = { title: "Hoje" };
export const dynamic = "force-dynamic";

const brl = (m: number) => formatMinor(m, "BRL");
const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";

export default async function CrmToday({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const d = await dashboard(me);
  const g = d.cfg.goals;
  const totalOpen = CRM_STATUSES.filter((s) => s !== "LOST").reduce((s, k) => s + (d.funnel[k] ?? 0), 0);
  const maxF = Math.max(1, ...CRM_STATUSES.map((s) => d.funnel[s] ?? 0));
  const now = Date.now();
  // agenda: próximas conversas/demonstrações (marcadas pelos sócios ou pela Geovana no WhatsApp)
  const agenda = await db.query.crmLeads.findMany({
    where: and(eq(schema.crmLeads.status, "DEMO"), isNotNull(schema.crmLeads.demoAt), gte(schema.crmLeads.demoAt, new Date(now - 2 * 3600_000))),
    orderBy: asc(schema.crmLeads.demoAt),
    limit: 8,
  });

  return (
    <div className="space-y-5">
      <InstallHint />
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{sp.err}</p>}

      {agenda.length > 0 && (
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 font-bold"><Icon name="calendar" size={18} /> Agenda de conversas</h2>
          <ul className="divide-y divide-[var(--s-line)] text-sm">
            {agenda.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-32 font-semibold">{fmtBr(l.demoAt!)}</span>
                <Link href={`/crm/leads/${l.id}`} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">{l.name}{l.city ? ` · ${l.city}` : ""}</Link>
                {l.phone && <a className="text-xs font-semibold text-[#25D366]" href={`https://wa.me/${l.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                <a className="text-xs font-semibold text-[#1F7FD8]" href={googleCalendarLink(`GoWeb · conversa com ${l.name}`, l.demoAt!, `${l.phone ?? ""}\nhttps://goweboficial.com/crm/leads/${l.id}`)} target="_blank" rel="noopener noreferrer">+ Google Agenda</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Journey name={me.name} journey={d.journey ? { startedAt: d.journey.startedAt.toISOString(), pauseStartedAt: d.journey.pauseStartedAt?.toISOString() ?? null, pausedSeconds: d.journey.pausedSeconds } : null} />
        <section className="grid grid-cols-2 gap-3">
          {[
            { label: "Contatos hoje", v: d.today.contacts, goal: g.contacts, c: "#3CC46B" },
            { label: "Demos marcadas", v: d.today.demos, goal: g.demos, c: "#F2C14E" },
          ].map((x) => (
            <div key={x.label} className="flex flex-col items-center justify-center rounded-3xl bg-[#0E0E10] p-4 text-center text-[#F4F1EA] ring-1 ring-white/10">
              <Ring pct={goalPct(x.v, x.goal)} color={x.c} size={112}>
                <div>
                  <b className="text-3xl tabular-nums">{x.v}</b>
                  <p className="text-[10px] uppercase tracking-wider text-[#B9B3A7]">de {x.goal}</p>
                </div>
              </Ring>
              <p className="mt-2 text-sm font-semibold">{x.label}</p>
            </div>
          ))}
          <div className="col-span-2 grid grid-cols-3 gap-2 text-center">
            {[
              ["Fechados", d.today.won],
              ["Retornos marcados", d.today.followups],
              ["Leads novos", d.newLeadsToday],
            ].map(([l, v]) => (
              <div key={l as string} className="rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-3">
                <b className="text-xl tabular-nums">{v}</b>
                <p className="text-[11px] text-[var(--s-muted)]">{l}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="font-bold">Registrar contato rápido</h2>
          <span className="text-xs text-[var(--s-muted)]">Contatos pela ficha do lead contam sozinhos</span>
        </div>
        <QuickCounters counts={d.today.byChannel} />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${card} lg:col-span-2`}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Retornos para hoje</h2>
            <Link href="/crm/funil" className="text-sm font-semibold text-[var(--s-good-fg)]">Ver funil →</Link>
          </div>
          {d.followUps.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--s-muted)]">Nenhum retorno pendente. Que tal puxar leads Ouro na aba Leads?</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--s-line)]">
              {d.followUps.map((l) => {
                const late = l.followUpAt!.getTime() < now;
                return (
                  <li key={l.id}>
                    <Link href={`/crm/leads/${l.id}`} className="flex items-center gap-3 py-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CRM_STATUS_COLOR[l.status] }} />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate">{l.name}</b>
                        <span className="text-xs text-[var(--s-muted)]">{CRM_STATUS_LABEL[l.status]} · {l.neighborhood ?? l.city ?? ""}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${late ? "bg-red-500/15 text-red-600 dark:text-red-300" : "bg-[var(--s-soft)]"}`}>{late ? "Atrasado · " : ""}{fmtBr(l.followUpAt!)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={card}>
          <h2 className="font-bold">Demonstrações de hoje</h2>
          {d.demosToday.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--s-muted)]">Nenhuma demo marcada para hoje.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {d.demosToday.map((l) => (
                <li key={l.id}>
                  <Link href={`/crm/leads/${l.id}`} className="flex items-center gap-3 rounded-2xl bg-[var(--s-soft)] p-3">
                    <b className="w-14 shrink-0 text-lg tabular-nums text-[#C99A1E]">{l.demoAt!.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}</b>
                    <span className="min-w-0 truncate font-semibold">{l.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <section className={card}>
          <h2 className="font-bold">Funil</h2>
          <p className="text-xs text-[var(--s-muted)]">{totalOpen} leads ativos</p>
          <ul className="mt-4 space-y-3">
            {CRM_STATUSES.map((s) => (
              <li key={s}>
                <div className="mb-1 flex justify-between text-sm"><span>{CRM_STATUS_LABEL[s]}</span><b className="tabular-nums">{d.funnel[s] ?? 0}</b></div>
                <Bar pct={(d.funnel[s] ?? 0) / maxF} color={CRM_STATUS_COLOR[s]} h={8} />
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-bold">Implantações</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-[var(--s-soft)] p-3"><b className="text-2xl tabular-nums">{d.implementing.length}</b><p className="text-xs text-[var(--s-muted)]">em andamento</p></div>
            <div className="rounded-2xl bg-[var(--s-soft)] p-3"><b className="text-2xl tabular-nums">{d.deliveredMonth}</b><p className="text-xs text-[var(--s-muted)]">entregues no mês</p></div>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {d.implementing.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/admin/clientes/${c.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--s-soft)]">
                  <span className="truncate">{c.businessName}</span>
                  <span className={`shrink-0 text-xs font-bold ${c.days > 5 ? "text-red-600 dark:text-red-300" : "text-[var(--s-muted)]"}`}>{c.days} {c.days === 1 ? "dia" : "dias"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h2 className="font-bold">Faturamento do mês</h2>
          <p className="mt-2 text-3xl font-bold tabular-nums">{brl(d.revenue.setup + d.revenue.subs)}</p>
          <div className="mt-3 space-y-1.5 text-sm">
            <p className="flex justify-between"><span className="text-[var(--s-muted)]">Implantações ({d.revenue.setupCount})</span><b>{brl(d.revenue.setup)}</b></p>
            <p className="flex justify-between"><span className="text-[var(--s-muted)]">Mensalidades ({d.revenue.subsCount})</span><b>{brl(d.revenue.subs)}</b></p>
          </div>
          <div className="mt-4 space-y-2 border-t border-[var(--s-line)] pt-3 text-sm">
            <Link href="/admin/afiliados?aba=pagar" className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-[var(--s-soft)]">
              <span className="flex items-center gap-2"><Icon name="cash" size={16} /> Comissões a pagar</span>
              <b>{d.affiliates.count ? brl(d.affiliates.sum) : "—"}</b>
            </Link>
            <Link href="/admin/suporte" className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-[var(--s-soft)]">
              <span className="flex items-center gap-2"><Icon name="alert" size={16} /> Chamados abertos</span>
              <b className={d.tickets.late ? "text-red-600 dark:text-red-300" : ""}>{d.tickets.open}{d.tickets.late ? ` · ${d.tickets.late} no limite` : ""}</b>
            </Link>
          </div>
        </section>
      </div>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Ranking da semana</h2>
          <Link href="/crm/equipe" className="text-sm font-semibold text-[var(--s-good-fg)]">Métricas →</Link>
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {d.ranking.map((r, i) => (
            <li key={r.id} className={`flex items-center gap-3 rounded-2xl p-3 ${r.id === me.id ? "bg-[var(--s-good-bg)]" : "bg-[var(--s-soft)]"}`}>
              <Medal pos={i + 1} />
              <span className="min-w-0 flex-1 truncate font-semibold">{r.id === me.id ? "Você" : firstName(r.name)}</span>
              <span className="text-xs text-[var(--s-muted)]">{r.contacts} contatos · {r.demos} demos · <b className="text-[var(--s-ink)]">{r.won} fechados</b></span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
