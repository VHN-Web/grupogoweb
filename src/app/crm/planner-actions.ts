"use server";
// CRM: agenda, notas e lembretes. Sessão conferida aqui (requireCrm) e dono/compartilhamento no serviço.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { brDateTime } from "@/core/crm";
import { isRepeat, quickWhen } from "@/core/crm-planner";
import { requireCrm } from "@/services/crm";
import { PlannerError, addReminder, createNote, deleteEvent, deleteNote, parseEventForm, reminderAction, saveEvent, setEventDone, toggleNoteCheck, updateNote } from "@/services/crm-planner";

const back = (path: string, kind: "ok" | "err", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(msg)}`);
const msg = (e: unknown) => (e instanceof PlannerError ? e.message : "Não foi possível salvar.");

// ---------------------------------------------------------------- agenda
export async function saveEventAction(id: string | null, f: FormData) {
  const me = await requireCrm();
  let err = "";
  try {
    await saveEvent(me, parseEventForm(f), id ?? undefined);
  } catch (e) {
    err = msg(e);
  }
  if (err) back("/crm/agenda", "err", err);
  revalidatePath("/crm", "layout");
  back(`/crm/agenda?dia=${encodeURIComponent(String(f.get("day") ?? ""))}`, "ok", id ? "Compromisso atualizado." : "Compromisso marcado.");
}

export async function eventDoneAction(id: string, done: boolean) {
  const me = await requireCrm();
  await setEventDone(me, id, done);
  revalidatePath("/crm/agenda");
}

export async function deleteEventAction(id: string) {
  const me = await requireCrm();
  await deleteEvent(me, id);
  back("/crm/agenda", "ok", "Compromisso apagado.");
}

// ---------------------------------------------------------------- notas
export async function newNoteAction(f: FormData) {
  const me = await requireCrm();
  const n = await createNote(me, { title: String(f.get("title") ?? ""), body: String(f.get("body") ?? ""), color: String(f.get("color") ?? "ivory"), shared: f.get("shared") === "1" });
  redirect(`/crm/notas?abrir=${n.id}`);
}

/** Salvamento automático do editor (sem recarregar a página). */
export async function saveNoteAction(id: string, p: { title?: string; body?: string; color?: string; pinned?: boolean; shared?: boolean }) {
  const me = await requireCrm();
  try {
    await updateNote(me, id, p);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: msg(e) };
  }
}

export async function toggleNoteCheckAction(id: string, line: number) {
  const me = await requireCrm();
  await toggleNoteCheck(me, id, line);
  revalidatePath("/crm/notas");
}

export async function deleteNoteAction(id: string) {
  const me = await requireCrm();
  await deleteNote(me, id);
  back("/crm/notas", "ok", "Nota apagada.");
}

// ---------------------------------------------------------------- lembretes
export async function addReminderAction(f: FormData) {
  const me = await requireCrm();
  const quick = String(f.get("quick") ?? "");
  const at = quick && quick !== "custom" ? quickWhen(quick) : brDateTime(String(f.get("day") ?? ""), String(f.get("time") ?? "09:00"));
  const repeat = String(f.get("repeat") ?? "none");
  let err = "";
  try {
    if (!at) throw new PlannerError("Escolha quando avisar.");
    if (at.getTime() < Date.now() - 60_000) throw new PlannerError("Esse horário já passou.");
    await addReminder(me, { text: String(f.get("text") ?? ""), remindAt: at, repeat: isRepeat(repeat) ? repeat : "none", leadId: String(f.get("leadId") ?? "") || null });
  } catch (e) {
    err = msg(e);
  }
  if (err) back("/crm/lembretes", "err", err);
  revalidatePath("/crm", "layout");
  back("/crm/lembretes", "ok", "Lembrete marcado. Eu aviso na hora.");
}

export async function reminderActionAction(id: string, act: "done" | "undo" | "snooze10" | "snooze60" | "tomorrow" | "delete") {
  const me = await requireCrm();
  await reminderAction(me, id, act);
  revalidatePath("/crm", "layout");
}
