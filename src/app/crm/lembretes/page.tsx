import { Icon } from "@/components/ui/Icon";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { brDayInput } from "@/core/crm";
import { REPEATS, REPEAT_LABEL, type Repeat } from "@/core/crm-planner";
import { requireCrm } from "@/services/crm";
import { reminders } from "@/services/crm-planner";
import { addReminderAction, reminderActionAction } from "../planner-actions";

export const metadata = { title: "Lembretes" };
export const dynamic = "force-dynamic";

const QUICK = [
  ["15m", "Em 15 min"],
  ["1h", "Em 1 hora"],
  ["3h", "Em 3 horas"],
  ["tonight", "Hoje 19h"],
  ["tomorrow9", "Amanhã 9h"],
  ["monday9", "Segunda 9h"],
  ["custom", "Escolher…"],
] as const;

const when = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function LembretesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; feitos?: string }> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const showDone = sp.feitos === "1";
  const list = await reminders(me, showDone);
  const now = Date.now();
  const late = list.filter((r) => !r.doneAt && r.remindAt.getTime() <= now);
  const next = list.filter((r) => !r.doneAt && r.remindAt.getTime() > now);
  const done = list.filter((r) => r.doneAt);

  const Row = ({ r }: { r: (typeof list)[number] }) => (
    <li className={`rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-4 ${r.doneAt ? "opacity-55" : ""}`}>
      <div className="flex items-start gap-3">
        <form action={reminderActionAction.bind(null, r.id, r.doneAt ? "undo" : "done")}>
          <button className={`mt-0.5 grid h-8 w-8 place-items-center rounded-full border-2 ${r.doneAt ? "border-[#3CC46B] bg-[#3CC46B] text-[#0E0E10]" : "border-[var(--s-line)]"}`} aria-label={r.doneAt ? "Desfazer" : "Marcar como feito"}>
            {r.doneAt && <Icon name="check" size={16} />}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <p className={`text-[17px] font-semibold leading-snug ${r.doneAt ? "line-through" : ""}`}>{r.text}</p>
          <p className={`mt-0.5 text-sm ${!r.doneAt && r.remindAt.getTime() <= now ? "font-bold text-red-600 dark:text-red-300" : "text-[var(--s-muted)]"}`}>
            {when(r.remindAt)}
            {r.repeat !== "none" ? ` · ${REPEAT_LABEL[r.repeat as Repeat]}` : ""}
          </p>
        </div>
      </div>
      {!r.doneAt && (
        <div className="mt-3 flex flex-wrap gap-2 pl-11 text-sm">
          <form action={reminderActionAction.bind(null, r.id, "snooze10")}><button className="rounded-full border border-[var(--s-line)] px-3 py-1.5 font-semibold">+10 min</button></form>
          <form action={reminderActionAction.bind(null, r.id, "snooze60")}><button className="rounded-full border border-[var(--s-line)] px-3 py-1.5 font-semibold">+1 h</button></form>
          <form action={reminderActionAction.bind(null, r.id, "tomorrow")}><button className="rounded-full border border-[var(--s-line)] px-3 py-1.5 font-semibold">Amanhã 9h</button></form>
          <form action={reminderActionAction.bind(null, r.id, "delete")}><button className="rounded-full px-3 py-1.5 font-semibold text-red-600">Apagar</button></form>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Lembretes</h1>
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{sp.err}</p>}

      <form action={addReminderAction} className="space-y-3 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5">
        <input name="text" required maxLength={300} placeholder="Lembrar de… (ex.: mandar proposta para a Pizzaria Bella)" className="input text-lg" />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Quando</legend>
          <div className="flex flex-wrap gap-2">
            {QUICK.map(([k, label], i) => (
              <label key={k} className="cursor-pointer">
                <input type="radio" name="quick" value={k} defaultChecked={i === 1} className="peer sr-only" />
                <span className="inline-block rounded-full border border-[var(--s-line)] px-3.5 py-2 text-sm font-semibold peer-checked:border-[#3CC46B] peer-checked:bg-[#3CC46B] peer-checked:text-[#0E0E10]">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">
            Dia (se escolher)
            <input type="date" name="day" defaultValue={brDayInput(new Date())} className="input mt-1" />
          </label>
          <label className="text-sm font-semibold">
            Hora
            <input type="time" name="time" defaultValue="09:00" className="input mt-1" />
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Repetir
          <select name="repeat" defaultValue="none" className="input mt-1">
            {REPEATS.map((r) => (
              <option key={r} value={r}>{REPEAT_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <SubmitButton className="w-full rounded-2xl bg-[#3CC46B] px-5 py-3.5 font-extrabold text-[#0E0E10]" pending="Marcando…">
          Lembrar
        </SubmitButton>
        <p className="text-xs text-[var(--s-muted)]">O aviso chega no celular (app e PWA) e aparece na ilha do CRM. Lembretes tocam mesmo no horário de silêncio.</p>
      </form>

      {late.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-red-600 dark:text-red-300">Atrasados</h2>
          <ul className="space-y-2">{late.map((r) => <Row key={r.id} r={r} />)}</ul>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-[var(--s-muted)]">Próximos</h2>
        {next.length ? <ul className="space-y-2">{next.map((r) => <Row key={r.id} r={r} />)}</ul> : <p className="text-sm text-[var(--s-muted)]">Nenhum lembrete pela frente.</p>}
      </section>
      {showDone && done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-[var(--s-muted)]">Feitos</h2>
          <ul className="space-y-2">{done.map((r) => <Row key={r.id} r={r} />)}</ul>
        </section>
      )}
      <a href={showDone ? "/crm/lembretes" : "/crm/lembretes?feitos=1"} className="block text-center text-sm font-semibold underline">{showDone ? "Esconder os feitos" : "Ver os feitos"}</a>
    </div>
  );
}
