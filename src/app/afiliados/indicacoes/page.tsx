import { AffShell, Flash } from "@/components/affiliates/AffShell";
import { LEAD_COLOR, card } from "@/components/affiliates/ui";
import { NameInput } from "@/components/forms/NameInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { Icon } from "@/components/ui/Icon";
import { LEAD_LABELS, LEAD_STATUSES, type LeadStatus } from "@/core/affiliates";
import { requireActiveAffiliate } from "@/lib/affiliate-auth";
import { affiliateDashboard, fmtDateTime } from "@/services/affiliates";
import { addLeadAction, updateLeadAction } from "../actions";

export const metadata = { title: "Indicações — GoWeb Afiliados", robots: { index: false } };

export default async function Leads({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; s?: string; nova?: string }> }) {
  const a = await requireActiveAffiliate();
  const sp = await searchParams;
  const d = await affiliateDashboard(a.id);
  const filter = (LEAD_STATUSES as readonly string[]).includes(sp.s ?? "") ? (sp.s as LeadStatus) : null;
  const leads = filter ? d.leads.filter((l) => l.status === filter) : d.leads;
  const toDay = (x: Date) => new Date(x.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const toTime = (x: Date) => new Date(x.getTime() - 3 * 3600_000).toISOString().slice(11, 16);
  const upcoming = d.leads.filter((l) => l.status === "SCHEDULED" && l.scheduledAt && l.scheduledAt.getTime() > Date.now() - 3600_000).sort((x, y) => x.scheduledAt!.getTime() - y.scheduledAt!.getTime());

  return (
    <AffShell name={a.name} status={a.status}>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indicações e agenda</h1>
          <p className="text-sm text-[var(--s-muted)]">Quem chegou pelo seu link aparece aqui sozinho. Você também pode cadastrar contatos que conseguiu pessoalmente.</p>
        </div>
        <a href="#nova" className="btn-brand"><Icon name="customers" size={16} /> Nova indicação</a>
      </div>

      {upcoming.length > 0 && (
        <section className="mt-6 rounded-3xl bg-[#0E0E10] p-5 text-[#F4F1EA]">
          <h2 className="flex items-center gap-2 font-bold"><Icon name="calendar" size={18} /> Próximas demonstrações</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.slice(0, 6).map((l) => (
              <li key={l.id} className="rounded-2xl bg-white/5 p-3">
                <p className="text-sm font-bold text-[#F2C14E]">{fmtDateTime(l.scheduledAt!)}</p>
                <p className="font-semibold">{l.businessName}</p>
                <p className="text-sm text-[#B9B3A7]">{l.contactName}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="no-scrollbar mt-6 flex gap-2 overflow-x-auto" aria-label="Filtrar">
        <a href="/afiliados/indicacoes" className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${!filter ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : "bg-[var(--s-soft)]"}`}>Todas ({d.leads.length})</a>
        {LEAD_STATUSES.map((s) => {
          const n = d.leads.filter((l) => l.status === s).length;
          return (
            <a key={s} href={`/afiliados/indicacoes?s=${s}`} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${filter === s ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : "bg-[var(--s-soft)]"}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: LEAD_COLOR[s] }} /> {LEAD_LABELS[s].split(" (")[0]} ({n})
            </a>
          );
        })}
      </nav>

      <ul className="mt-4 space-y-3">
        {leads.length === 0 && <li className={`${card} p-8 text-center text-[var(--s-muted)]`}>Nenhuma indicação {filter ? "nesta situação" : "ainda"}. Compartilhe o seu link!</li>}
        {leads.map((l) => (
          <li key={l.id} className={`${card} p-4`}>
            <div className="flex flex-wrap items-start gap-3">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: LEAD_COLOR[l.status] }} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{l.businessName} <span className="font-normal text-[var(--s-muted)]">· {l.contactName}</span></p>
                <p className="text-sm text-[var(--s-muted)]">
                  {LEAD_LABELS[l.status]}{l.scheduledAt ? ` · ${fmtDateTime(l.scheduledAt)}` : ""} · {l.source === "link" ? "pelo link" : "cadastro manual"}{l.city ? ` · ${l.city}` : ""}
                </p>
                {l.note && <p className="mt-1 text-sm">{l.note}</p>}
              </div>
              <a href={`https://wa.me/${l.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="btn-ghost" aria-label={`WhatsApp de ${l.contactName}`}><Icon name="chat" size={16} /></a>
            </div>
            {!["SIGNED", "WON"].includes(l.status) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--s-good-fg)]">Atualizar / agendar</summary>
                <form action={updateLeadAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <input type="hidden" name="id" value={l.id} />
                  <select name="status" defaultValue={l.status} className="input" aria-label="Situação">
                    {(["NEW", "SCHEDULED", "NOT_SCHEDULED", "LOST"] as const).map((s) => <option key={s} value={s}>{LEAD_LABELS[s]}</option>)}
                  </select>
                  <input type="date" name="day" className="input" aria-label="Dia da demonstração" defaultValue={l.scheduledAt ? toDay(l.scheduledAt) : ""} />
                  <input type="time" name="time" className="input" aria-label="Horário" defaultValue={l.scheduledAt ? toTime(l.scheduledAt) : "10:00"} />
                  <button className="btn-primary">Salvar</button>
                  <input name="note" defaultValue={l.note ?? ""} placeholder="Anotação" className="input sm:col-span-4" maxLength={500} />
                </form>
              </details>
            )}
          </li>
        ))}
      </ul>

      <section id="nova" className={`${card} mt-8 p-6`}>
        <h2 className="text-lg font-bold">Cadastrar indicação</h2>
        <p className="text-sm text-[var(--s-muted)]">Se já combinou um horário, preencha o dia — a equipe GoWeb faz a demonstração.</p>
        <form action={addLeadAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="businessName">Nome do negócio</label><input id="businessName" name="businessName" className="input" required maxLength={80} /></div>
          <div><label className="label" htmlFor="contactName">Responsável</label><NameInput id="contactName" name="contactName" required /></div>
          <div><label className="label" htmlFor="whatsapp">WhatsApp</label><PhoneInput id="whatsapp" name="whatsapp" defaultCountry="BR" locale="pt" required /></div>
          <div><label className="label" htmlFor="city">Cidade</label><input id="city" name="city" className="input" maxLength={60} /></div>
          <div><label className="label" htmlFor="day">Dia da demonstração (opcional)</label><input id="day" name="day" type="date" className="input" /></div>
          <div><label className="label" htmlFor="time">Horário (Brasília)</label><input id="time" name="time" type="time" defaultValue="10:00" className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="note">Observações</label><textarea id="note" name="note" rows={2} className="input" maxLength={500} /></div>
          <button className="btn-brand sm:col-span-2">Cadastrar indicação</button>
        </form>
      </section>
    </AffShell>
  );
}
