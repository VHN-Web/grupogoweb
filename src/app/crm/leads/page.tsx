import Link from "next/link";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { Icon } from "@/components/ui/Icon";
import { ContactButtons } from "@/components/crm/ContactButtons";
import { ScoreBadge, StatusBadge } from "@/components/crm/LeadBadges";
import { CRM_STATUSES, CRM_STATUS_LABEL, SCORES, SCORE_LABEL } from "@/core/crm";
import { SOURCE_LABEL, firstName, fmtBr, leadsForList, partners, requireCrm } from "@/services/crm";
import { importCsvAction, newLeadAction, syncSheetAction } from "../actions";

export const metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

type SP = { q?: string; s?: string; score?: string; dono?: string; cidade?: string; cat?: string; fonte?: string; ver?: string; ok?: string; err?: string; novo?: string };

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const [leads, people, cities, cats] = await Promise.all([
    leadsForList({ q: sp.q, status: sp.s, score: sp.score, owner: sp.dono === "eu" ? me.id : sp.dono, city: sp.cidade, category: sp.cat, source: sp.fonte }),
    partners(),
    db.selectDistinct({ v: schema.crmLeads.city }).from(schema.crmLeads).where(sql`${schema.crmLeads.city} is not null`).orderBy(schema.crmLeads.city),
    db.selectDistinct({ v: schema.crmLeads.category }).from(schema.crmLeads).where(sql`${schema.crmLeads.category} is not null`).orderBy(schema.crmLeads.category),
  ]);
  const who = (id: string | null) => (id ? firstName(people.find((p) => p.id === id)?.name ?? "—") : "Sem dono");
  const table = sp.ver === "tabela";
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ok: undefined, err: undefined, novo: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/crm/leads${p.size ? `?${p}` : ""}`;
  };
  const sel = "input !w-[calc(50%-4px)] py-2 text-sm md:!w-auto md:max-w-[180px]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-[var(--s-muted)]">{leads.length} {leads.length === 1 ? "lead" : "leads"} {sp.s === "ALL" ? "" : "ativos"} nesta lista</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#novo" className="btn-brand"><Icon name="customers" size={16} /> Novo lead</a>
          <details className="relative">
            <summary className="btn-ghost cursor-pointer list-none">Importar / exportar</summary>
            <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-4 shadow-xl">
              <form action={syncSheetAction}><button className="btn-ghost w-full justify-center">Sincronizar planilha do Google</button></form>
              <form action={importCsvAction} className="space-y-2">
                <input type="file" name="file" accept=".csv,text/csv" className="block w-full text-xs" required />
                <button className="btn-ghost w-full justify-center">Importar CSV</button>
              </form>
              <a href="/crm/exportar" className="btn-ghost w-full justify-center"><Icon name="download" size={16} /> Exportar CSV</a>
            </div>
          </details>
        </div>
      </div>
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{sp.err}</p>}

      <form className="flex flex-wrap gap-2 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-3">
        <div className="relative w-full md:w-auto md:min-w-[200px] md:flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--s-muted)]"><Icon name="search" size={16} /></span>
          <input name="q" defaultValue={sp.q} placeholder="Buscar nome, bairro, telefone, @…" className="input py-2 !pl-9 text-sm" />
        </div>
        <select name="s" defaultValue={sp.s ?? ""} className={sel} aria-label="Etapa">
          <option value="">Ativos</option>
          <option value="ALL">Todos</option>
          {CRM_STATUSES.map((s) => <option key={s} value={s}>{CRM_STATUS_LABEL[s]}</option>)}
        </select>
        <select name="score" defaultValue={sp.score ?? ""} className={sel} aria-label="Score">
          <option value="">Todo score</option>
          {SCORES.map((s) => <option key={s} value={s}>{SCORE_LABEL[s]}</option>)}
        </select>
        <select name="cidade" defaultValue={sp.cidade ?? ""} className={sel} aria-label="Cidade">
          <option value="">Toda cidade</option>
          {cities.map((c) => <option key={c.v!} value={c.v!}>{c.v}</option>)}
        </select>
        <select name="cat" defaultValue={sp.cat ?? ""} className={sel} aria-label="Categoria">
          <option value="">Toda categoria</option>
          {cats.map((c) => <option key={c.v!} value={c.v!}>{c.v}</option>)}
        </select>
        <select name="dono" defaultValue={sp.dono ?? ""} className={sel} aria-label="Responsável">
          <option value="">Todos os sócios</option>
          <option value="eu">Meus leads</option>
          <option value="none">Sem dono</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="fonte" defaultValue={sp.fonte ?? ""} className={sel} aria-label="Origem">
          <option value="">Toda origem</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {table && <input type="hidden" name="ver" value="tabela" />}
        <button className="btn-primary py-2">Filtrar</button>
        <div className="ml-auto flex overflow-hidden rounded-xl border border-[var(--s-line)] text-sm font-semibold">
          <Link href={qs({ ver: undefined })} className={`px-3 py-2 ${!table ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : ""}`}>Cards</Link>
          <Link href={qs({ ver: "tabela" })} className={`px-3 py-2 ${table ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : ""}`}>Tabela</Link>
        </div>
      </form>

      {leads.length === 0 && <p className="rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-10 text-center text-[var(--s-muted)]">Nenhum lead com esses filtros.</p>}

      {table ? (
        <div className="overflow-x-auto rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs text-[var(--s-muted)]">
              <tr className="border-b border-[var(--s-line)]"><th className="px-4 py-3">Lead</th><th>Categoria</th><th>Local</th><th>Score</th><th>Etapa</th><th>Responsável</th><th>Retorno</th><th>Contato</th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-[var(--s-line)] last:border-0 hover:bg-[var(--s-soft)]">
                  <td className="px-4 py-2.5"><Link href={`/crm/leads/${l.id}`} className="font-semibold hover:underline">{l.name}</Link><p className="text-xs text-[var(--s-muted)]">{l.code}</p></td>
                  <td>{l.category}</td>
                  <td>{[l.neighborhood, l.city].filter(Boolean).join(" · ")}</td>
                  <td><ScoreBadge score={l.score} /></td>
                  <td><StatusBadge status={l.status} /></td>
                  <td>{who(l.ownerId)}</td>
                  <td className="text-xs">{l.followUpAt ? fmtBr(l.followUpAt) : "—"}</td>
                  <td className="py-2"><ContactButtons leadId={l.id} phone={l.phone} instagram={null} email={null} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leads.map((l) => (
            <li key={l.id} className="lift flex flex-col rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-4">
              <Link href={`/crm/leads/${l.id}`} className="block">
                <div className="flex flex-wrap items-center gap-1.5"><ScoreBadge score={l.score} /><StatusBadge status={l.status} />{l.source === "hunter" && <span className="rounded-full bg-[#1F7FD8]/15 px-2 py-0.5 text-[11px] font-bold text-[#1F7FD8]">busca IA</span>}{l.source === "affiliate" && <span className="rounded-full bg-[#A970FF]/15 px-2 py-0.5 text-[11px] font-bold text-[#8B4FE0]">afiliado</span>}</div>
                <p className="mt-2 text-lg font-bold leading-tight">{l.name}</p>
                <p className="text-xs text-[var(--s-muted)]">{[l.category, l.neighborhood, l.city].filter(Boolean).join(" · ")}</p>
                {l.pain && <p className="mt-2 line-clamp-2 text-sm">{l.pain}</p>}
              </Link>
              <div className="mt-auto pt-3">
                <p className="mb-2 text-xs text-[var(--s-muted)]">{who(l.ownerId)}{l.followUpAt ? ` · retorno ${fmtBr(l.followUpAt)}` : ""}</p>
                <ContactButtons leadId={l.id} phone={l.phone} instagram={l.instagram} email={null} size="sm" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section id="novo" className="scroll-mt-20 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5">
        <h2 className="text-lg font-bold">Cadastrar lead</h2>
        <p className="text-sm text-[var(--s-muted)]">O score é calculado sozinho pelo link da bio e pelas avaliações.</p>
        <form action={newLeadAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label" htmlFor="n-name">Nome do negócio *</label><input id="n-name" name="name" className="input" required maxLength={120} /></div>
          <div><label className="label" htmlFor="n-cat">Categoria</label><input id="n-cat" name="category" className="input" list="cats" maxLength={80} /><datalist id="cats">{cats.map((c) => <option key={c.v!} value={c.v!} />)}</datalist></div>
          <div><label className="label" htmlFor="n-phone">WhatsApp / telefone</label><input id="n-phone" name="phone" className="input" inputMode="tel" placeholder="81 99999-0000" /></div>
          <div><label className="label" htmlFor="n-nb">Bairro</label><input id="n-nb" name="neighborhood" className="input" maxLength={80} /></div>
          <div><label className="label" htmlFor="n-city">Cidade - UF</label><input id="n-city" name="city" className="input" list="cities" placeholder="Recife - PE" maxLength={80} /><datalist id="cities">{cities.map((c) => <option key={c.v!} value={c.v!} />)}</datalist></div>
          <div><label className="label" htmlFor="n-ig">Instagram</label><input id="n-ig" name="instagram" className="input" placeholder="@perfil" /></div>
          <div><label className="label" htmlFor="n-web">Link da bio / site</label><input id="n-web" name="website" className="input" placeholder="wa.me/…, linktr.ee/…, ifood…" /></div>
          <div><label className="label" htmlFor="n-rev">Avaliações no Google</label><input id="n-rev" name="reviews" className="input" inputMode="numeric" /></div>
          <div><label className="label" htmlFor="n-mail">E-mail</label><input id="n-mail" name="email" type="email" className="input" /></div>
          <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor="n-pain">Dor identificada</label><input id="n-pain" name="pain" className="input" maxLength={600} placeholder="Ex.: anota pedidos no papel e perde vendas no pico" /></div>
          <button className="btn-brand sm:col-span-2 lg:col-span-3">Cadastrar lead</button>
        </form>
      </section>
    </div>
  );
}
