import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { brDateTime, brDayInput, brDayStart, brTimeInput } from "@/core/crm";
import { EVENT_KINDS, EVENT_KIND_COLOR, EVENT_KIND_LABEL, REMIND_OPTIONS, dayLabel, groupByDay, remindLabel, weekStrip, type AgendaItem } from "@/core/crm-planner";
import { gcalLink } from "@/core/advisory";
import { requireCrm } from "@/services/crm";
import { agenda, getEvent } from "@/services/crm-planner";
import { deleteEventAction, eventDoneAction, saveEventAction } from "../planner-actions";

export const metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]";
const hm = (d: Date) => brTimeInput(d);
const DURATIONS = [15, 30, 45, 60, 90, 120, 240];

function Item({ it, open }: { it: AgendaItem; open: boolean }) {
  const end = new Date(it.startsAt.getTime() + it.durationMin * 60_000);
  const color = EVENT_KIND_COLOR[it.kind];
  const kindLabel = it.kind === "followup" ? "Retorno" : it.kind === "leaddemo" ? "Demo de lead" : EVENT_KIND_LABEL[it.kind];
  return (
    <li id={it.id} className={`relative flex gap-3 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-3.5 ${open ? "ring-2 ring-[#3CC46B]" : ""} ${it.done ? "opacity-55" : ""}`}>
      <span className="w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <div className="w-14 shrink-0 text-center">
        <p className="text-lg font-black leading-none">{hm(it.startsAt)}</p>
        <p className="mt-1 text-xs text-[var(--s-muted)]">{it.durationMin} min</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-bold leading-snug ${it.done ? "line-through" : ""}`}>{it.title}</p>
        <p className="mt-0.5 text-sm text-[var(--s-muted)]">
          <span style={{ color }} className="font-semibold">{kindLabel}</span>
          {it.location ? ` · ${it.location}` : ""}
          {it.shared && it.source === "event" ? " · equipe" : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {it.source !== "event" && (
            <Link href={it.url} className="rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 font-semibold text-[var(--s-good-fg)]">Abrir lead</Link>
          )}
          {it.leadId && it.source === "event" && (
            <Link href={`/crm/leads/${it.leadId}`} className="rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 font-semibold text-[var(--s-good-fg)]">Lead</Link>
          )}
          <a href={gcalLink({ uid: it.id, start: it.startsAt, minutes: Math.round((end.getTime() - it.startsAt.getTime()) / 60_000), title: it.title, description: it.location ?? "", url: `https://goweboficial.com${it.url}` })} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[var(--s-line)] px-3 py-1.5 font-semibold text-[#1F7FD8]">
            + Google Agenda
          </a>
          {it.source === "event" && (
            <>
              <form action={eventDoneAction.bind(null, it.id, !it.done)}>
                <button className="rounded-full border border-[var(--s-line)] px-3 py-1.5 font-semibold">{it.done ? "Desfazer" : "Feito"}</button>
              </form>
              <Link href={`/crm/agenda?editar=${it.id}#form`} className="rounded-full border border-[var(--s-line)] px-3 py-1.5 font-semibold">Editar</Link>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string; ver?: string; editar?: string; novo?: string; ok?: string; err?: string }> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const now = new Date();
  const today = brDayInput(now);
  const start = brDayStart(now);
  const items = await agenda(me, new Date(start.getTime() - 3600_000), new Date(start.getTime() + 21 * 86_400_000));
  const days = groupByDay(items);
  const strip = weekStrip(now);
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia! : null;
  const editing = sp.editar ? await getEvent(me, sp.editar) : null;
  const canEdit = editing && editing.ownerId === me.id;
  const shown = sel ? days.filter((d) => d.day === sel) : days;
  const formOpen = !!sp.novo || !!canEdit || !!sp.err;
  const defDay = editing ? brDayInput(editing.startsAt) : sel ?? today;
  const defTime = editing ? brTimeInput(editing.startsAt) : brTimeInput(new Date(Math.ceil((now.getTime() + 30 * 60_000) / (30 * 60_000)) * 30 * 60_000));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold tracking-tight">Agenda</h1>
        <Link href="/crm/agenda?novo=1#form" className="inline-flex items-center gap-2 rounded-2xl bg-[#3CC46B] px-4 py-3 text-sm font-extrabold text-[#0E0E10]">
          <Icon name="calendar" size={18} /> Novo
        </Link>
      </div>
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{sp.err}</p>}

      {/* semana */}
      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Dias da semana">
        <Link href="/crm/agenda" className={`flex min-w-[64px] flex-col items-center rounded-2xl px-3 py-2.5 text-sm font-bold ${!sel ? "bg-[#0E0E10] text-white dark:bg-white dark:text-[#0E0E10]" : "border border-[var(--s-line)] bg-[var(--s-card)]"}`}>
          <span className="text-xs font-semibold opacity-70">tudo</span>
          <Icon name="calendar" size={20} />
        </Link>
        {strip.map((d) => {
          const n = days.find((x) => x.day === d.day)?.items.length ?? 0;
          const on = sel === d.day;
          return (
            <Link key={d.day} href={`/crm/agenda?dia=${d.day}`} aria-current={on ? "date" : undefined} className={`relative flex min-w-[64px] flex-col items-center rounded-2xl px-3 py-2.5 ${on ? "bg-[#0E0E10] text-white dark:bg-white dark:text-[#0E0E10]" : "border border-[var(--s-line)] bg-[var(--s-card)]"}`}>
              <span className="text-xs font-semibold uppercase opacity-70">{d.day === today ? "hoje" : d.wd}</span>
              <span className="text-xl font-black leading-tight">{d.n}</span>
              {n > 0 && <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-[#3CC46B] px-1 text-[11px] font-black text-[#0E0E10]">{n}</span>}
            </Link>
          );
        })}
      </nav>

      {/* formulário */}
      <details id="form" open={formOpen} className={`${card} p-5`}>
        <summary className="cursor-pointer text-base font-bold">{canEdit ? "Editar compromisso" : "Marcar compromisso"}</summary>
        <form action={saveEventAction.bind(null, canEdit ? editing!.id : null)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm font-semibold">
            O quê
            <input name="title" required defaultValue={canEdit ? editing!.title : ""} placeholder="Ex.: Reunião com a Pizzaria Bella" className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Dia
            <input name="day" type="date" required defaultValue={defDay} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Hora
            <input name="time" type="time" required defaultValue={defTime} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Duração
            <select name="durationMin" defaultValue={String(canEdit ? editing!.durationMin : 30)} className="input mt-1">
              {DURATIONS.map((m) => (
                <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Tipo
            <select name="kind" defaultValue={canEdit ? editing!.kind : "meeting"} className="input mt-1">
              {EVENT_KINDS.map((k) => (
                <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Avisar
            <select name="remindMin" defaultValue={canEdit ? (editing!.remindMin == null ? "none" : String(editing!.remindMin)) : "15"} className="input mt-1">
              {REMIND_OPTIONS.map((m) => (
                <option key={String(m)} value={m == null ? "none" : m}>{remindLabel(m)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            Onde / link
            <input name="location" defaultValue={canEdit ? editing!.location ?? "" : ""} placeholder="Endereço ou link do Meet" className="input mt-1" />
          </label>
          <label className="sm:col-span-2 text-sm font-semibold">
            Observações
            <textarea name="notes" rows={3} defaultValue={canEdit ? editing!.notes ?? "" : ""} className="input mt-1" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" name="shared" value="1" defaultChecked={canEdit ? editing!.shared : false} />
            Mostrar para toda a equipe (todos recebem o aviso)
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SubmitButton className="rounded-2xl bg-[#3CC46B] px-5 py-3 font-extrabold text-[#0E0E10]" pending="Salvando…">{canEdit ? "Salvar" : "Marcar"}</SubmitButton>
            {canEdit && (
              <button formAction={deleteEventAction.bind(null, editing!.id)} formNoValidate className="rounded-2xl border border-red-400/50 px-4 py-3 font-semibold text-red-600">Apagar</button>
            )}
          </div>
        </form>
      </details>

      {/* lista */}
      {shown.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="text-lg font-bold">{sel ? "Nada marcado neste dia." : "Agenda livre nas próximas 3 semanas."}</p>
          <p className="mt-1 text-sm text-[var(--s-muted)]">Compromissos, demos dos leads e retornos aparecem aqui juntos.</p>
        </div>
      ) : (
        shown.map((d) => (
          <section key={d.day}>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-[var(--s-muted)]">{dayLabel(d.day, now)}</h2>
            <ul className="space-y-2">
              {d.items.map((it) => (
                <Item key={it.id} it={it} open={sp.ver === it.id} />
              ))}
            </ul>
          </section>
        ))
      )}
      {editing && !canEdit && <p className="text-sm text-[var(--s-muted)]">Só quem criou pode editar esse compromisso.</p>}
      <p className="text-center text-xs text-[var(--s-muted)]">{`Hoje é ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" }).format(brDateTime(today, "12:00") ?? now)}`}</p>
    </div>
  );
}
