import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Icon } from "@/components/ui/Icon";
import { ConfirmSubmit } from "@/components/crm/ConfirmSubmit";
import { ContactButtons } from "@/components/crm/ContactButtons";
import { ScoreBadge, StatusBadge } from "@/components/crm/LeadBadges";
import { ScriptBox } from "@/components/crm/ScriptBox";
import { CHANNEL_LABEL, CRM_STATUSES, CRM_STATUS_COLOR, CRM_STATUS_LABEL, SCORES, SCORE_LABEL, SCRIPT_CHANNELS, SCRIPT_CHANNEL_LABEL, brDayInput, brTimeInput, buildScript, detectLink, type Channel } from "@/core/crm";
import { SOURCE_LABEL, crmConfig, firstName, fmtBr, partners, requireCrm } from "@/services/crm";
import { deleteLeadAction, editLeadAction, followUpAction, noteAction, ownerAction, statusAction } from "../../actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { contact: "Contato", note: "Anotação", status: "Etapa", followup: "Retorno", demo: "Demo", won: "Fechado", lost: "Perdido", system: "Sistema", implant: "Implantação" };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireCrm();
  const { id } = await params;
  const sp = await searchParams;
  const [l, people, cfg] = await Promise.all([db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.id, id) }), partners(), crmConfig()]);
  if (!l) notFound();
  const acts = await db.query.crmActivities.findMany({ where: eq(schema.crmActivities.leadId, l.id), orderBy: desc(schema.crmActivities.createdAt), limit: 100 });
  const who = (aid: string | null) => (aid ? firstName(people.find((p) => p.id === aid)?.name ?? "—") : "—");
  const reasons: string[] = (() => {
    try {
      return JSON.parse(l.scoreNotes ?? "[]");
    } catch {
      return [];
    }
  })();
  const link = detectLink(l.website);
  const tabs = SCRIPT_CHANNELS.map((c) => ({ id: c, label: SCRIPT_CHANNEL_LABEL[c], text: buildScript(c, l, me.name) }));
  const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";
  const today = brDayInput(new Date());

  return (
    <div className="space-y-5">
      <Link href="/crm/leads" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--s-muted)] hover:text-[var(--s-ink)]">← Leads</Link>
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{sp.err}</p>}

      <section className="rounded-[28px] bg-[#0E0E10] p-6 text-[#F4F1EA] ring-1 ring-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <ScoreBadge score={l.score} />
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: CRM_STATUS_COLOR[l.status] }} />
            {CRM_STATUS_LABEL[l.status]}
          </span>
          <span className="text-xs text-[#8a857b]">{l.code} · {SOURCE_LABEL[l.source]}</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{l.name}</h1>
        <p className="mt-1 text-sm text-[#B9B3A7]">{[l.category, l.neighborhood, l.city].filter(Boolean).join(" · ")}</p>
        {l.address && <p className="text-sm text-[#8a857b]">{l.address}</p>}
        <div className="mt-5">
          <ContactButtons leadId={l.id} phone={l.phone} instagram={l.instagram} email={l.email} />
          {!l.phone && !l.instagram && !l.email && <p className="text-sm text-[#B9B3A7]">Sem contato cadastrado — edite os dados abaixo.</p>}
        </div>
        <p className="mt-4 text-xs text-[#8a857b]">Responsável: <b className="text-[#F4F1EA]">{who(l.ownerId)}</b>{l.lastContactAt ? ` · último contato ${fmtBr(l.lastContactAt)}` : " · ainda sem contato"}{l.followUpAt ? ` · retorno ${fmtBr(l.followUpAt)}` : ""}</p>
        {l.customerId && <Link href={`/admin/clientes/${l.customerId}`} className="mt-3 inline-block rounded-xl bg-[#3CC46B] px-3 py-1.5 text-sm font-bold text-[#0E0E10]">Ver cliente no admin →</Link>}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <section className={card}>
            <h2 className="font-bold">Diagnóstico</h2>
            {l.pain && <p className="mt-2"><b className="text-[var(--s-muted)]">Dor: </b>{l.pain}</p>}
            {l.pitch && <p className="mt-1"><b className="text-[var(--s-muted)]">Gancho: </b>{l.pitch}</p>}
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {(reasons.length ? reasons : [link.label]).map((r) => <li key={r} className="rounded-full bg-[var(--s-soft)] px-2.5 py-1 text-xs">{r}</li>)}
              {l.reviews != null && !reasons.some((r) => r.includes("avalia")) && <li className="rounded-full bg-[var(--s-soft)] px-2.5 py-1 text-xs">{l.reviews} avaliações</li>}
            </ul>
            {l.website && <p className="mt-3 truncate text-sm"><a href={/^https?:/.test(l.website) ? l.website : `https://${l.website}`} target="_blank" rel="noopener" className="underline">{l.website}</a></p>}
          </section>

          <section className={card}>
            <h2 className="font-bold">Mensagem pronta</h2>
            <p className="mb-3 text-sm text-[var(--s-muted)]">Personalizada com a dor e o bairro. Edite à vontade antes de enviar.</p>
            <ScriptBox leadId={l.id} tabs={tabs} phone={l.phone} ai={!!cfg.geminiKeySealed} />
            {!cfg.geminiKeySealed && <p className="mt-2 text-xs text-[var(--s-muted)]">Para escrever com IA, cadastre a chave do Gemini em <Link href="/crm/busca" className="underline">Busca</Link>.</p>}
          </section>

          <section className={card}>
            <h2 className="font-bold">Histórico</h2>
            <form action={noteAction.bind(null, l.id)} className="mt-3 space-y-2">
              <textarea name="body" rows={2} className="input text-sm" placeholder="O que foi conversado? Objeções, combinados…" maxLength={2000} />
              <div className="flex flex-wrap gap-2">
                <select name="channel" className="input !w-auto max-w-[220px] py-2 text-sm" aria-label="Tipo">
                  <option value="">Só anotação</option>
                  {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => <option key={c} value={c}>Contato por {CHANNEL_LABEL[c]}</option>)}
                </select>
                <button className="btn-primary py-2">Salvar</button>
              </div>
            </form>
            <ol className="mt-4 space-y-3 border-l-2 border-[var(--s-line)] pl-4">
              {l.notes && (
                <li className="relative text-sm"><span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full bg-[var(--s-line)]" /><p className="text-xs text-[var(--s-muted)]">Observações da planilha</p><p className="whitespace-pre-wrap">{l.notes}</p></li>
              )}
              {acts.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full" style={{ background: a.kind === "won" ? "#3CC46B" : a.kind === "lost" ? "#8a857b" : a.kind === "contact" ? "#1F7FD8" : a.kind === "demo" ? "#F2C14E" : "var(--s-line)" }} />
                  <p className="text-xs text-[var(--s-muted)]">{fmtBr(a.createdAt)} · {who(a.actorId)} · {KIND_LABEL[a.kind]}{a.channel ? ` (${CHANNEL_LABEL[a.channel]})` : ""}</p>
                  {a.body && <p className="whitespace-pre-wrap">{a.body}</p>}
                </li>
              ))}
              {acts.length === 0 && !l.notes && <li className="text-sm text-[var(--s-muted)]">Nada registrado ainda.</li>}
            </ol>
          </section>
        </div>

        <div className="space-y-5">
          <section className={card}>
            <h2 className="font-bold">Etapa do funil</h2>
            <form action={statusAction.bind(null, l.id)} className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {CRM_STATUSES.map((s) => (
                  <label key={s} className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--s-line)] p-2.5 text-sm has-[:checked]:border-[var(--s-good-fg)] has-[:checked]:bg-[var(--s-good-bg)]">
                    <input type="radio" name="status" value={s} defaultChecked={l.status === s} className="sr-only" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CRM_STATUS_COLOR[s] }} /> {CRM_STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
              <div className="rounded-xl bg-[var(--s-soft)] p-3 text-sm">
                <p className="font-semibold">Se for “Demo agendada”: dia e hora</p>
                <div className="mt-2 flex gap-2">
                  <input type="date" name="day" min={today} defaultValue={l.demoAt ? brDayInput(l.demoAt) : ""} className="input py-2" aria-label="Dia da demo" />
                  <input type="time" name="time" defaultValue={l.demoAt ? brTimeInput(l.demoAt) : "10:00"} className="input py-2" aria-label="Hora da demo" />
                </div>
              </div>
              <input name="lostReason" defaultValue={l.lostReason ?? ""} placeholder="Se perdido: motivo (preço, já usa concorrente…)" className="input text-sm" maxLength={300} />
              <button className="btn-brand w-full justify-center">Atualizar etapa</button>
            </form>
          </section>

          <section className={card}>
            <h2 className="font-bold">Próximo retorno</h2>
            <p className="text-sm text-[var(--s-muted)]">{l.followUpAt ? `Marcado para ${fmtBr(l.followUpAt)}` : "Sem retorno marcado."} Você recebe uma notificação no horário.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["1", "Amanhã"],
                ["2", "Em 2 dias"],
                ["7", "Em 1 semana"],
              ].map(([v, t]) => (
                <form key={v} action={followUpAction.bind(null, l.id)}>
                  <input type="hidden" name="preset" value={v} />
                  <button className="btn-ghost py-2 text-sm">{t}</button>
                </form>
              ))}
              {l.followUpAt && (
                <form action={followUpAction.bind(null, l.id)}>
                  <input type="hidden" name="preset" value="clear" />
                  <button className="btn-ghost py-2 text-sm">Remover</button>
                </form>
              )}
            </div>
            <form action={followUpAction.bind(null, l.id)} className="mt-2 flex gap-2">
              <input type="date" name="day" min={today} className="input py-2" aria-label="Dia do retorno" required />
              <input type="time" name="time" defaultValue="09:00" className="input py-2" aria-label="Hora do retorno" />
              <button className="btn-primary py-2">Marcar</button>
            </form>
          </section>

          <section className={card}>
            <h2 className="font-bold">Responsável</h2>
            <form action={ownerAction.bind(null, l.id)} className="mt-3 flex gap-2">
              <select name="owner" defaultValue={l.ownerId ?? ""} className="input py-2" aria-label="Responsável">
                <option value="">Sem dono</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn-primary py-2">Salvar</button>
            </form>
          </section>

          <details className={card}>
            <summary className="cursor-pointer font-bold">Editar dados do lead</summary>
            <form action={editLeadAction.bind(null, l.id)} className="mt-4 grid gap-3">
              {[
                ["name", "Nome", l.name],
                ["category", "Categoria", l.category],
                ["phone", "WhatsApp / telefone", l.phone],
                ["instagram", "Instagram", l.instagram],
                ["email", "E-mail", l.email],
                ["website", "Link da bio / site", l.website],
                ["neighborhood", "Bairro", l.neighborhood],
                ["city", "Cidade - UF", l.city],
                ["address", "Endereço", l.address],
                ["reviews", "Avaliações no Google", l.reviews?.toString() ?? ""],
                ["pain", "Dor identificada", l.pain],
                ["pitch", "Gancho de abordagem", l.pitch],
              ].map(([k, label, v]) => (
                <div key={k}><label className="label" htmlFor={`e-${k}`}>{label}</label><input id={`e-${k}`} name={k!} defaultValue={v ?? ""} className="input" required={k === "name"} /></div>
              ))}
              <div>
                <label className="label" htmlFor="e-score">Score</label>
                <select id="e-score" name="score" defaultValue="" className="input">
                  <option value="">Calcular sozinho</option>
                  {SCORES.map((s) => <option key={s} value={s}>{SCORE_LABEL[s]}</option>)}
                </select>
              </div>
              <button className="btn-brand">Salvar dados</button>
            </form>
            <form action={deleteLeadAction.bind(null, l.id)} className="mt-4 border-t border-[var(--s-line)] pt-4">
              <ConfirmSubmit message="Excluir este lead e todo o histórico?" className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-300"><Icon name="trash" size={16} /> Excluir lead</ConfirmSubmit>
            </form>
          </details>
          <p className="text-center text-xs text-[var(--s-muted)]"><StatusBadge status={l.status} /> · criado em {l.createdAt.toLocaleDateString("pt-BR")}</p>
        </div>
      </div>
    </div>
  );
}
