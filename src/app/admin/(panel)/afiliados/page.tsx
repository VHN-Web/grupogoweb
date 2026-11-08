import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { qrSvg } from "@/lib/qr";
import { openSecret } from "@/lib/secrets";
import { LEAD_LABELS, LEAD_STATUSES, pctLabel, pixPayload, tierFor, type LeadStatus } from "@/core/affiliates";
import { formatMinor } from "@/core/money";
import { CopyLink } from "@/components/storefront/CopyLink";
import { affiliateConfig, affiliateLink, fmtDateTime, monthlyRanking } from "@/services/affiliates";
import {
  activateCohort,
  adminUpdateLead,
  cancelCommissionAction,
  deleteCohort,
  deleteMaterial,
  notifyCohort,
  payAffiliate,
  saveAffiliateConfig,
  saveCohort,
  saveMaterial,
  setAffiliateStatus,
} from "../affiliate-actions";

export const dynamic = "force-dynamic";

const brl = (m: number) => formatMinor(m, "BRL");
const TABS = [
  ["visao", "Visão geral"],
  ["pagar", "Comissões a pagar"],
  ["afiliados", "Afiliados"],
  ["lives", "Lives de boas-vindas"],
  ["agenda", "Indicações e agenda"],
  ["ranking", "Ranking"],
  ["materiais", "Materiais"],
  ["regras", "Regras"],
] as const;
const ST: Record<string, string> = { PENDING: "aguardando live", ACTIVE: "ativo", SUSPENDED: "suspenso" };
const toDay = (x: Date) => new Date(x.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const toTime = (x: Date) => new Date(x.getTime() - 3 * 3600_000).toISOString().slice(11, 16);

export default async function AdminAffiliates({ searchParams }: { searchParams: Promise<{ aba?: string; ok?: string; err?: string; q?: string; s?: string }> }) {
  const [, sp, cfg] = await Promise.all([requirePlatformAdmin(), searchParams, affiliateConfig()]);
  const tab = TABS.some(([k]) => k === sp.aba) ? sp.aba! : "visao";

  const [[counts], [money], [leadCounts]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${schema.affiliates.status} = 'PENDING')::int`,
        active: sql<number>`count(*) filter (where ${schema.affiliates.status} = 'ACTIVE')::int`,
      })
      .from(schema.affiliates),
    db
      .select({
        toPay: sql<number>`coalesce(sum(${schema.affiliateCommissions.amountMinor}) filter (where ${schema.affiliateCommissions.status} = 'PENDING'), 0)::int`,
        paid: sql<number>`coalesce(sum(${schema.affiliateCommissions.amountMinor}) filter (where ${schema.affiliateCommissions.status} = 'PAID'), 0)::int`,
        sales: sql<number>`count(*) filter (where ${schema.affiliateCommissions.level} = 1 and ${schema.affiliateCommissions.kind} = 'SETUP' and ${schema.affiliateCommissions.status} <> 'CANCELLED')::int`,
        revenue: sql<number>`coalesce(sum(${schema.affiliateCommissions.baseMinor}) filter (where ${schema.affiliateCommissions.level} = 1 and ${schema.affiliateCommissions.kind} = 'SETUP' and ${schema.affiliateCommissions.status} <> 'CANCELLED'), 0)::int`,
      })
      .from(schema.affiliateCommissions),
    db
      .select({ total: sql<number>`count(*)::int`, scheduled: sql<number>`count(*) filter (where ${schema.affiliateLeads.status} = 'SCHEDULED')::int`, clicks: sql<number>`(select count(*) from affiliate_clicks)::int` })
      .from(schema.affiliateLeads),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Programa de afiliados</h1>
          <p className="text-sm text-muted">Só Brasil · comissão sobre a implantação paga · página pública: <Link href="/afiliados" className="underline" target="_blank">/afiliados</Link></p>
        </div>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-900">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-100 px-4 py-2.5 text-sm font-semibold text-red-900">{sp.err}</p>}
      <nav className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`?aba=${k}`} className={`shrink-0 ${tab === k ? "btn border border-transparent bg-ink text-white" : "btn-ghost"}`}>
            {l}
            {k === "pagar" && money.toPay > 0 ? ` · ${brl(money.toPay)}` : ""}
            {k === "lives" && counts.pending > 0 ? ` · ${counts.pending} na fila` : ""}
          </Link>
        ))}
      </nav>

      {tab === "visao" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Afiliados ativos" v={String(counts.active)} sub={`${counts.pending} aguardando live · ${counts.total} no total`} />
            <Stat k="Vendas por afiliados" v={String(money.sales)} sub={`${brl(money.revenue)} em implantações`} />
            <Stat k="Comissões a pagar" v={brl(money.toPay)} alert={money.toPay > 0} sub={`${brl(money.paid)} já pagos`} />
            <Stat k="Indicações" v={String(leadCounts.total)} sub={`${leadCounts.scheduled} em agenda · ${leadCounts.clicks} cliques`} />
          </div>
          <div className="card p-5 text-sm">
            <h2 className="font-bold">Como funciona</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>A pessoa se cadastra em /afiliados (CPF, Pix) e entra na fila da próxima live de boas-vindas.</li>
              <li>Em <b>Lives de boas-vindas</b> você cria a data, cadastra o link, avisa a turma e, depois da live, libera quem participou.</li>
              <li>O afiliado divulga o link /a/CÓDIGO ou cadastra contatos. A agenda das demonstrações aparece em <b>Indicações e agenda</b>.</li>
              <li>Quando o cliente indicado paga a implantação, a comissão aparece em <b>Comissões a pagar</b> com o Pix pronto. Você paga e marca como paga.</li>
              <li>No cadastro de clientes manual, defina o afiliado na ficha do cliente (antes do pagamento).</li>
            </ol>
          </div>
        </>
      )}

      {tab === "pagar" && <PayTab />}
      {tab === "afiliados" && <AffiliatesTab q={sp.q} cfg={cfg} />}
      {tab === "lives" && <CohortsTab />}
      {tab === "agenda" && <LeadsTab status={sp.s} />}
      {tab === "ranking" && <RankingTab />}
      {tab === "materiais" && <MaterialsTab />}
      {tab === "regras" && <RulesTab cfg={cfg} />}
    </div>
  );
}

function Stat({ k, v, sub, alert }: { k: string; v: string; sub?: string; alert?: boolean }) {
  return (
    <div className={`card p-4 ${alert ? "border-amber-400" : ""}`}>
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{v}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- pagar
async function PayTab() {
  const s = await db.query.platformSettings.findFirst();
  const pending = await db.query.affiliateCommissions.findMany({
    where: eq(schema.affiliateCommissions.status, "PENDING"),
    orderBy: asc(schema.affiliateCommissions.createdAt),
    with: { affiliate: true, customer: { columns: { businessName: true } } },
  });
  const groups = new Map<string, typeof pending>();
  for (const k of pending) groups.set(k.affiliateId, [...(groups.get(k.affiliateId) ?? []), k]);
  const recent = await db.query.affiliateCommissions.findMany({
    where: sql`${schema.affiliateCommissions.status} <> 'PENDING'`,
    orderBy: desc(schema.affiliateCommissions.createdAt),
    limit: 40,
    with: { affiliate: { columns: { name: true, code: true } }, customer: { columns: { businessName: true } } },
  });
  const cards = await Promise.all(
    [...groups.values()].map(async (list) => {
      const a = list[0].affiliate;
      const total = list.reduce((x, k) => x + k.amountMinor, 0);
      const pix = pixPayload({ key: a.pixKey, name: a.name, city: a.city?.split("/")[0] || "BRASIL", amountMinor: total, txid: `GWAF${list[0].id.replace(/-/g, "").slice(0, 10)}` });
      return { a, list, total, pix, qr: await qrSvg(pix) };
    }),
  );
  return (
    <div className="space-y-4">
      {cards.length === 0 && <p className="card p-8 text-center text-muted">Nenhuma comissão a pagar.</p>}
      {cards.map(({ a, list, total, pix, qr }) => (
        <div key={a.id} className="card p-5">
          <div className="flex flex-wrap gap-5">
            <div className="keep-light h-36 w-36 shrink-0 rounded-xl bg-white p-2 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR Pix" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Pagar para</p>
              <p className="text-lg font-bold">{a.name} <span className="font-mono text-sm font-normal text-muted">{a.code}</span></p>
              <p className="text-sm">Chave Pix ({a.pixKeyType}): <b className="font-mono">{a.pixKey}</b></p>
              <p className="mt-1 text-sm text-muted">CPF do titular: {maskCpf(openSecret(a.cpfSealed))}</p>
              <p className="mt-2 text-2xl font-bold">{brl(total)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyLink text={pix} label="Copiar Pix copia e cola" done="Copiado!" className="btn-ghost" />
                <CopyLink text={a.pixKey} label="Copiar só a chave" done="Copiado!" className="btn-ghost" />
              </div>
            </div>
          </div>
          <form action={payAffiliate} className="mt-4 border-t border-line pt-4">
            <ul className="space-y-1.5 text-sm">
              {list.map((k) => (
                <li key={k.id} className="flex items-center gap-2">
                  <input type="checkbox" name="ids" value={k.id} defaultChecked aria-label="Incluir" />
                  <span className="flex-1">
                    {k.customer?.businessName} — {k.level === 2 ? "rede (afiliado que ele trouxe)" : k.kind === "ANNUAL" ? "1ª anuidade" : `implantação · ${k.tierName}`} · {pctLabel(k.pctBp)} de {brl(k.baseMinor)} · {k.createdAt.toLocaleDateString("pt-BR")}
                  </span>
                  <b className="tabular-nums">{brl(k.amountMinor)}</b>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input name="ref" placeholder="ID do Pix enviado (opcional)" className="input max-w-xs" maxLength={80} />
              <button className="btn-brand">Marcar selecionadas como pagas</button>
            </div>
            <p className="mt-2 text-xs text-muted">O QR/copia e cola já vem com o total de todas as comissões listadas. Se desmarcar alguma, pague pela chave.</p>
          </form>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Cancelar uma comissão (estorno, fraude…)</summary>
            {list.map((k) => (
              <form key={k.id} action={cancelCommissionAction} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={k.id} />
                <span className="self-center">{k.customer?.businessName} · {brl(k.amountMinor)}</span>
                <input name="reason" placeholder="Motivo" className="input max-w-xs" required maxLength={200} />
                <button className="btn-ghost text-red-700">Cancelar</button>
              </form>
            ))}
          </details>
        </div>
      ))}
      {recent.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="border-b border-line px-4 py-3 font-bold">Histórico</h2>
          <table className="w-full min-w-[640px] text-sm">
            <tbody>
              {recent.map((k) => (
                <tr key={k.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{k.affiliate.name}</td>
                  <td>{k.customer?.businessName}</td>
                  <td>{k.status === "PAID" ? `pago ${k.paidAt?.toLocaleDateString("pt-BR")}${k.paidBy ? ` por ${k.paidBy}` : ""}` : `cancelada: ${k.cancelReason ?? ""}`}</td>
                  <td className="pr-4 text-right font-semibold tabular-nums">{brl(k.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!s?.supportEmail && <p className="text-xs text-muted">Dica: cadastre o e-mail de suporte em Configurações para receber o aviso de novas demonstrações.</p>}
    </div>
  );
}

function maskCpf(c: string) {
  return c.length === 11 ? `${c.slice(0, 3)}.***.***-${c.slice(9)}` : "—";
}

// ---------------------------------------------------------------- afiliados
async function AffiliatesTab({ q, cfg }: { q?: string; cfg: Awaited<ReturnType<typeof affiliateConfig>> }) {
  const [all, stats, leads, clicks, cohorts] = await Promise.all([
    db.query.affiliates.findMany({ orderBy: desc(schema.affiliates.createdAt), with: { cohort: true }, limit: 500 }),
    db
      .select({
        id: schema.affiliateCommissions.affiliateId,
        sales: sql<number>`count(*) filter (where ${schema.affiliateCommissions.level} = 1 and ${schema.affiliateCommissions.kind} = 'SETUP' and ${schema.affiliateCommissions.status} <> 'CANCELLED')::int`,
        earned: sql<number>`coalesce(sum(${schema.affiliateCommissions.amountMinor}) filter (where ${schema.affiliateCommissions.status} <> 'CANCELLED'), 0)::int`,
      })
      .from(schema.affiliateCommissions)
      .groupBy(schema.affiliateCommissions.affiliateId),
    db.select({ id: schema.affiliateLeads.affiliateId, n: sql<number>`count(*)::int` }).from(schema.affiliateLeads).groupBy(schema.affiliateLeads.affiliateId),
    db.select({ id: schema.affiliateClicks.affiliateId, n: sql<number>`count(*)::int` }).from(schema.affiliateClicks).groupBy(schema.affiliateClicks.affiliateId),
    db.query.affiliateCohorts.findMany({ orderBy: desc(schema.affiliateCohorts.startsAt), limit: 12 }),
  ]);
  const term = (q ?? "").toLowerCase();
  const list = term ? all.filter((a) => `${a.name} ${a.email} ${a.code} ${a.city ?? ""}`.toLowerCase().includes(term)) : all;
  const byId = new Map(all.map((a) => [a.id, a]));
  return (
    <div className="space-y-3">
      <form className="flex gap-2">
        <input type="hidden" name="aba" value="afiliados" />
        <input name="q" defaultValue={q} placeholder="Buscar por nome, e-mail, código ou cidade" className="input max-w-md" />
        <button className="btn-ghost">Buscar</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line"><th className="px-4 py-2.5">Afiliado</th><th>Situação</th><th>Nível</th><th className="text-right">Cliques</th><th className="text-right">Indicações</th><th className="text-right">Vendas</th><th className="text-right">Comissões</th><th className="px-4">Ações</th></tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const st = stats.find((x) => x.id === a.id);
              const t = tierFor(st?.sales ?? 0, cfg);
              return (
                <tr key={a.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-muted">{a.email} · {a.whatsapp}{a.city ? ` · ${a.city}` : ""}</p>
                    <p className="text-xs text-muted"><span className="font-mono">{a.code}</span>{a.referredById ? ` · trazido por ${byId.get(a.referredById)?.name ?? "—"}` : ""} · desde {a.createdAt.toLocaleDateString("pt-BR")}</p>
                    {a.status === "ACTIVE" && <p className="text-xs"><a href={affiliateLink(a.code)} target="_blank" className="underline">{affiliateLink(a.code).replace(/^https?:\/\//, "")}</a></p>}
                  </td>
                  <td className="py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : a.status === "PENDING" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>{ST[a.status]}</span>
                    {a.status === "PENDING" && <p className="mt-1 text-xs text-muted">{a.cohort ? `live ${a.cohort.startsAt.toLocaleDateString("pt-BR")}` : "sem turma"}</p>}
                  </td>
                  <td className="py-3">{t.tier.name} · {pctLabel(t.tier.pctBp)}</td>
                  <td className="py-3 text-right tabular-nums">{clicks.find((x) => x.id === a.id)?.n ?? 0}</td>
                  <td className="py-3 text-right tabular-nums">{leads.find((x) => x.id === a.id)?.n ?? 0}</td>
                  <td className="py-3 text-right tabular-nums">{st?.sales ?? 0}</td>
                  <td className="py-3 text-right tabular-nums">{brl(st?.earned ?? 0)}</td>
                  <td className="px-4 py-3">
                    <form action={setAffiliateStatus} className="flex flex-wrap gap-1.5">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="tab" value="afiliados" />
                      <select name="status" defaultValue={a.status} className="input w-auto max-w-[190px] py-1.5 text-xs" aria-label="Situação">
                        <option value="PENDING">Aguardando live</option>
                        <option value="ACTIVE">Ativo</option>
                        <option value="SUSPENDED">Suspenso</option>
                      </select>
                      {a.status === "PENDING" && (
                        <select name="cohortId" defaultValue={a.cohortId ?? ""} className="input w-auto max-w-[190px] py-1.5 text-xs" aria-label="Turma">
                          <option value="">Sem turma</option>
                          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.startsAt.toLocaleDateString("pt-BR")}</option>)}
                        </select>
                      )}
                      <button className="btn-ghost py-1.5 text-xs">Salvar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted">Nenhum afiliado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- lives
async function CohortsTab() {
  const cohorts = await db.query.affiliateCohorts.findMany({ orderBy: desc(schema.affiliateCohorts.startsAt), limit: 20, with: { affiliates: { columns: { id: true, name: true, status: true, whatsapp: true, city: true } } } });
  const noCohort = await db.query.affiliates.findMany({ where: sql`${schema.affiliates.status} = 'PENDING' and ${schema.affiliates.cohortId} is null`, columns: { id: true, name: true } });
  return (
    <div className="space-y-4">
      <form action={saveCohort} className="card grid gap-3 p-5 sm:grid-cols-[1.5fr_1fr_1fr_2fr_auto] sm:items-end">
        <div><label className="label">Título</label><input name="title" className="input" placeholder="Live de boas-vindas" /></div>
        <div><label className="label">Dia</label><input name="day" type="date" className="input" required /></div>
        <div><label className="label">Hora (Brasília)</label><input name="time" type="time" defaultValue="19:00" className="input" /></div>
        <div><label className="label">Link da live (pode cadastrar depois)</label><input name="liveUrl" className="input" placeholder="https://meet.google.com/…" /></div>
        <button className="btn-brand">Criar live</button>
      </form>
      {noCohort.length > 0 && <p className="rounded-xl bg-amber-100 px-4 py-2.5 text-sm text-amber-900">{noCohort.length} na fila sem turma: {noCohort.map((a) => a.name.split(" ")[0]).join(", ")}. Ao criar a próxima live, eles entram nela automaticamente.</p>}
      {cohorts.map((c) => {
        const waiting = c.affiliates.filter((a) => a.status === "PENDING");
        const past = c.startsAt.getTime() < Date.now();
        return (
          <div key={c.id} className="card p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1">
                <p className="font-bold">{c.title}</p>
                <p className="text-sm text-muted">{fmtDateTime(c.startsAt)} · {c.affiliates.length} inscritos · {waiting.length} aguardando liberação{past ? " · já aconteceu" : ""}</p>
              </div>
              <form action={notifyCohort}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost text-xs" disabled={!c.liveUrl || waiting.length === 0}>Enviar link para a turma</button></form>
              <form action={deleteCohort}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost text-xs text-red-700">Excluir</button></form>
            </div>
            <form action={saveCohort} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="title" value={c.title} />
              <input name="day" type="date" defaultValue={toDay(c.startsAt)} className="input w-auto max-w-[190px]" aria-label="Dia" />
              <input name="time" type="time" defaultValue={toTime(c.startsAt)} className="input w-auto max-w-[190px]" aria-label="Hora" />
              <input name="liveUrl" defaultValue={c.liveUrl ?? ""} placeholder="Link da live" className="input min-w-[240px] flex-1" aria-label="Link da live" />
              <button className="btn-ghost">Salvar</button>
            </form>
            {waiting.length > 0 && (
              <form action={activateCohort} className="mt-4 rounded-xl bg-paper p-3">
                <p className="mb-2 text-sm font-semibold">Depois da live: marque quem participou e libere o link</p>
                <ul className="grid gap-1 text-sm sm:grid-cols-2">
                  {waiting.map((a) => (
                    <li key={a.id}><label className="flex items-center gap-2"><input type="checkbox" name="ids" value={a.id} defaultChecked /> {a.name}{a.city ? <span className="text-muted"> · {a.city}</span> : null}</label></li>
                  ))}
                </ul>
                <button className="btn-brand mt-3">Liberar selecionados</button>
              </form>
            )}
          </div>
        );
      })}
      {cohorts.length === 0 && <p className="card p-8 text-center text-muted">Nenhuma live cadastrada. Crie a primeira acima — os cadastros na fila entram nela.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- agenda
async function LeadsTab({ status }: { status?: string }) {
  const f = (LEAD_STATUSES as readonly string[]).includes(status ?? "") ? (status as LeadStatus) : null;
  const leads = await db.query.affiliateLeads.findMany({
    where: f ? eq(schema.affiliateLeads.status, f) : undefined,
    orderBy: [sql`case when ${schema.affiliateLeads.status} = 'SCHEDULED' then 0 when ${schema.affiliateLeads.status} = 'NEW' then 1 else 2 end`, asc(schema.affiliateLeads.scheduledAt), desc(schema.affiliateLeads.createdAt)],
    limit: 300,
    with: { affiliate: { columns: { name: true, code: true } } },
  });
  return (
    <div className="space-y-3">
      <nav className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
        <Link href="?aba=agenda" className={`shrink-0 ${!f ? "btn border border-transparent bg-ink text-white" : "btn-ghost"}`}>Todas</Link>
        {LEAD_STATUSES.map((s) => <Link key={s} href={`?aba=agenda&s=${s}`} className={`shrink-0 ${f === s ? "btn border border-transparent bg-ink text-white" : "btn-ghost"}`}>{LEAD_LABELS[s].split(" (")[0]}</Link>)}
      </nav>
      {leads.length === 0 && <p className="card p-8 text-center text-muted">Nenhuma indicação.</p>}
      {leads.map((l) => (
        <div key={l.id} className="card p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{l.businessName} <span className="font-normal text-muted">· {l.contactName} · {l.whatsapp}{l.city ? ` · ${l.city}` : ""}{l.segment ? ` · ${l.segment}` : ""}</span></p>
              <p className="text-sm text-muted">
                {LEAD_LABELS[l.status]}{l.scheduledAt ? ` · ${fmtDateTime(l.scheduledAt)}` : ""} · afiliado {l.affiliate.name} ({l.affiliate.code}) · {l.source === "link" ? "pelo link" : "cadastro manual"} · {l.createdAt.toLocaleDateString("pt-BR")}
              </p>
              {l.note && <p className="mt-1 text-sm">Afiliado: {l.note}</p>}
              {l.customerId && <Link href={`/admin/clientes/${l.customerId}`} className="text-sm underline">Ver cliente</Link>}
            </div>
            <a href={`https://wa.me/${l.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="btn-ghost text-xs">WhatsApp</a>
          </div>
          {!["SIGNED", "WON"].includes(l.status) && (
            <form action={adminUpdateLead} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="id" value={l.id} />
              <select name="status" defaultValue={l.status} className="input w-auto max-w-[190px]" aria-label="Situação">
                {(["NEW", "SCHEDULED", "NOT_SCHEDULED", "LOST"] as const).map((s) => <option key={s} value={s}>{LEAD_LABELS[s]}</option>)}
              </select>
              <input name="day" type="date" defaultValue={l.scheduledAt ? toDay(l.scheduledAt) : ""} className="input w-auto max-w-[190px]" aria-label="Dia" />
              <input name="time" type="time" defaultValue={l.scheduledAt ? toTime(l.scheduledAt) : "10:00"} className="input w-auto max-w-[190px]" aria-label="Hora" />
              <input name="adminNote" defaultValue={l.adminNote ?? ""} placeholder="Nota interna" className="input min-w-[200px] flex-1" aria-label="Nota interna" />
              <button className="btn-ghost">Salvar</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- ranking
async function RankingTab() {
  const now = new Date();
  const months = [0, 1, 2].map((i) => new Date(now.getFullYear(), now.getMonth() - i, 1));
  const lists = await Promise.all(months.map((m) => monthlyRanking(20, m)));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {months.map((m, i) => (
        <div key={i} className="card overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 font-bold capitalize">{m.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
          <ol className="divide-y divide-line text-sm">
            {lists[i].map((r) => (
              <li key={r.affiliateId} className="flex items-center gap-2 px-4 py-2">
                <b className="w-6">{r.pos}º</b>
                <span className="flex-1">{r.fullName} <span className="text-muted">· {r.code}</span></span>
                <span className="tabular-nums">{r.sales} · {brl(r.earned)}</span>
              </li>
            ))}
            {lists[i].length === 0 && <li className="px-4 py-6 text-center text-muted">Sem vendas.</li>}
          </ol>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- materiais
async function MaterialsTab() {
  const list = await db.query.affiliateMaterials.findMany({ orderBy: [desc(schema.affiliateMaterials.pinned), desc(schema.affiliateMaterials.createdAt)] });
  return (
    <div className="space-y-4">
      <form action={saveMaterial} className="card grid gap-3 p-5 sm:grid-cols-2">
        <div>
          <label className="label">Tipo</label>
          <select name="kind" className="input">
            <option value="live">Live (agendada ou gravada)</option>
            <option value="video">Vídeo</option>
            <option value="texto">Texto pronto (WhatsApp/Instagram)</option>
            <option value="arquivo">Arquivo (arte, PDF)</option>
            <option value="link">Link</option>
          </select>
        </div>
        <div><label className="label">Título</label><input name="title" className="input" required maxLength={120} /></div>
        <div className="sm:col-span-2"><label className="label">Descrição</label><input name="description" className="input" maxLength={400} /></div>
        <div className="sm:col-span-2"><label className="label">Link (YouTube, Drive, Meet…)</label><input name="url" className="input" placeholder="https://" /></div>
        <div className="sm:col-span-2"><label className="label">Texto pronto (use {"{link}"} e {"{nome}"} — trocados pelos dados de cada afiliado)</label><textarea name="body" rows={4} className="input" maxLength={3000} /></div>
        <div><label className="label">Data da live (só para lives)</label><input name="day" type="date" className="input" /></div>
        <div><label className="label">Hora (Brasília)</label><input name="time" type="time" defaultValue="19:00" className="input" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pinned" /> Destacar no topo</label>
        <button className="btn-brand sm:justify-self-end">Publicar</button>
      </form>
      <ul className="space-y-2">
        {list.map((m) => (
          <li key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
            <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold">{m.kind}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{m.pinned ? "★ " : ""}{m.title}</p>
              <p className="truncate text-xs text-muted">{m.liveAt ? `${fmtDateTime(m.liveAt)} · ` : ""}{m.url ?? m.description ?? ""}</p>
            </div>
            <form action={deleteMaterial}><input type="hidden" name="id" value={m.id} /><button className="btn-ghost text-xs text-red-700">Remover</button></form>
          </li>
        ))}
        {list.length === 0 && <li className="card p-8 text-center text-muted">Nenhum material publicado.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- regras
function RulesTab({ cfg }: { cfg: Awaited<ReturnType<typeof affiliateConfig>> }) {
  const p = (bp: number) => String(bp / 100).replace(".", ",");
  return (
    <form action={saveAffiliateConfig} className="card max-w-3xl space-y-5 p-5">
      <div>
        <h2 className="font-bold">Níveis (comissão sobre a implantação paga, sem domínio)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {cfg.tiers.map((t, i) => (
            <fieldset key={t.name} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-semibold">{t.name}</legend>
              <label className="label">A partir de (vendas)</label>
              <input name={`min${i}`} type="number" min={0} defaultValue={t.minSales} className="input" readOnly={i === 0} />
              <label className="label mt-2">Comissão (%)</label>
              <input name={`pct${i}`} inputMode="decimal" defaultValue={p(t.pctBp)} className="input" />
            </fieldset>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">Quem indicou o afiliado (%)</label><input name="referrer" inputMode="decimal" defaultValue={p(cfg.referrerPctBp)} className="input" /></div>
        <div><label className="label">Extra na 1ª anuidade (%)</label><input name="annual" inputMode="decimal" defaultValue={p(cfg.annualPctBp)} className="input" /></div>
        <div><label className="label">Validade do link (dias)</label><input name="cookieDays" type="number" min={1} max={365} defaultValue={cfg.cookieDays} className="input" /></div>
      </div>
      <p className="text-sm text-muted">Mudanças valem para as próximas comissões; as já geradas não mudam.</p>
      <button className="btn-brand">Salvar regras</button>
    </form>
  );
}
