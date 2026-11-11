import "server-only";
// =============================================================================
// CRM — agenda, bloco de notas, lembretes e a "ilha ao vivo". Regras puras em core/crm-planner.ts.
// Cada sócio vê o que é dele + o que foi compartilhado com a equipe. Avisos pelo sendPush (central de
// avisos + PWA + app Android), categorias "agenda" e "lembretes" (tocam até no horário de silêncio).
// Disparo: a cada minuto pelo disparador externo (/api/cron/wa-queue), toda vez que o app/CRM busca
// novidades (/api/crm/app) e no cron do CRM — o que vier primeiro.
// =============================================================================
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { brDateTime, brDayStart } from "@/core/crm";
import { eventReminderDue, isEventKind, isNoteColor, isRepeat, liveActivity, nextOccurrence, remindLabel, toggleCheck, type AgendaItem, type EventKind, type Live, type Repeat } from "@/core/crm-planner";
import type { CrmActor } from "@/services/crm";

export class PlannerError extends Error {}

const DAY = 86_400_000;
const mine = (owner: typeof schema.crmEvents.ownerId | typeof schema.crmNotes.ownerId, shared: typeof schema.crmEvents.shared | typeof schema.crmNotes.shared, actorId: string) => or(eq(owner, actorId), eq(shared, true));
const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

// ---------------------------------------------------------------- agenda
export type EventInput = { title: string; day: string; time: string; durationMin: number; kind: EventKind; location?: string | null; notes?: string | null; leadId?: string | null; remindMin: number | null; shared: boolean };

export function parseEventForm(f: FormData): EventInput {
  const kind = String(f.get("kind") ?? "meeting");
  const rm = String(f.get("remindMin") ?? "15");
  return {
    title: clip(f.get("title"), 140),
    day: String(f.get("day") ?? ""),
    time: String(f.get("time") ?? "09:00"),
    durationMin: Math.max(5, Math.min(24 * 60, Math.round(Number(f.get("durationMin")) || 30))),
    kind: isEventKind(kind) ? kind : "meeting",
    location: clip(f.get("location"), 300) || null,
    notes: clip(f.get("notes"), 2000) || null,
    leadId: String(f.get("leadId") ?? "") || null,
    remindMin: rm === "" || rm === "none" ? null : Math.max(0, Math.min(1440, Math.round(Number(rm)) || 0)),
    shared: f.get("shared") === "1",
  };
}

export async function saveEvent(actor: CrmActor, input: EventInput, id?: string) {
  if (!input.title) throw new PlannerError("Dê um nome ao compromisso.");
  const startsAt = brDateTime(input.day, input.time);
  if (!startsAt) throw new PlannerError("Data inválida.");
  const values = { title: input.title, startsAt, durationMin: input.durationMin, kind: input.kind, location: input.location ?? null, notes: input.notes ?? null, leadId: input.leadId ?? null, remindMin: input.remindMin, shared: input.shared, remindedAt: null, updatedAt: new Date() };
  if (id) {
    const [r] = await db.update(schema.crmEvents).set(values).where(and(eq(schema.crmEvents.id, id), eq(schema.crmEvents.ownerId, actor.id))).returning({ id: schema.crmEvents.id });
    if (!r) throw new PlannerError("Só quem criou pode editar este compromisso.");
    return r.id;
  }
  const [r] = await db.insert(schema.crmEvents).values({ ...values, ownerId: actor.id }).returning({ id: schema.crmEvents.id });
  return r.id;
}

export async function deleteEvent(actor: CrmActor, id: string) {
  await db.delete(schema.crmEvents).where(and(eq(schema.crmEvents.id, id), eq(schema.crmEvents.ownerId, actor.id)));
}

export async function setEventDone(actor: CrmActor, id: string, done: boolean) {
  await db.update(schema.crmEvents).set({ doneAt: done ? new Date() : null, updatedAt: new Date() }).where(and(eq(schema.crmEvents.id, id), mine(schema.crmEvents.ownerId, schema.crmEvents.shared, actor.id)));
}

export async function getEvent(actor: CrmActor, id: string) {
  return (await db.query.crmEvents.findFirst({ where: and(eq(schema.crmEvents.id, id), mine(schema.crmEvents.ownerId, schema.crmEvents.shared, actor.id)) })) ?? null;
}

/** Compromissos + demos de leads + retornos marcados, no intervalo. */
export async function agenda(actor: CrmActor, from: Date, to: Date): Promise<AgendaItem[]> {
  const [events, demos, follow] = await Promise.all([
    db.query.crmEvents.findMany({ where: and(mine(schema.crmEvents.ownerId, schema.crmEvents.shared, actor.id), gte(schema.crmEvents.startsAt, new Date(from.getTime() - DAY)), lte(schema.crmEvents.startsAt, to)), orderBy: asc(schema.crmEvents.startsAt), limit: 400 }),
    db.query.crmLeads.findMany({ where: and(isNotNull(schema.crmLeads.demoAt), gte(schema.crmLeads.demoAt, from), lte(schema.crmLeads.demoAt, to), inArray(schema.crmLeads.status, ["DEMO", "PROPOSAL", "CONTACT", "NEW"])), columns: { id: true, name: true, demoAt: true, ownerId: true }, limit: 200 }),
    db.query.crmLeads.findMany({
      where: and(isNotNull(schema.crmLeads.followUpAt), gte(schema.crmLeads.followUpAt, from), lte(schema.crmLeads.followUpAt, to), inArray(schema.crmLeads.status, ["NEW", "CONTACT", "DEMO", "PROPOSAL"]), or(eq(schema.crmLeads.ownerId, actor.id), isNull(schema.crmLeads.ownerId))),
      columns: { id: true, name: true, followUpAt: true },
      limit: 200,
    }),
  ]);
  return [
    ...events
      .filter((e) => e.startsAt.getTime() + e.durationMin * 60_000 >= from.getTime())
      .map<AgendaItem>((e) => ({ id: e.id, source: "event", kind: e.kind as EventKind, title: e.title, startsAt: e.startsAt, durationMin: e.durationMin, leadId: e.leadId, url: `/crm/agenda?ver=${e.id}`, shared: e.shared, done: !!e.doneAt, location: e.location })),
    ...demos.map<AgendaItem>((l) => ({ id: `demo-${l.id}`, source: "leaddemo", kind: "leaddemo", title: `Demo · ${l.name}`, startsAt: l.demoAt!, durationMin: 30, leadId: l.id, url: `/crm/leads/${l.id}`, shared: true, done: false, location: null })),
    ...follow.map<AgendaItem>((l) => ({ id: `ret-${l.id}`, source: "followup", kind: "followup", title: `Retorno · ${l.name}`, startsAt: l.followUpAt!, durationMin: 15, leadId: l.id, url: `/crm/leads/${l.id}`, shared: false, done: false, location: null })),
  ];
}

// ---------------------------------------------------------------- notas
export async function notes(actor: CrmActor, q?: string) {
  const rows = await db.query.crmNotes.findMany({ where: mine(schema.crmNotes.ownerId, schema.crmNotes.shared, actor.id), orderBy: [desc(schema.crmNotes.pinned), desc(schema.crmNotes.updatedAt)], limit: 300 });
  const s = (q ?? "").trim().toLowerCase();
  return s ? rows.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(s)) : rows;
}

async function ownNote(actor: CrmActor, id: string) {
  const n = await db.query.crmNotes.findFirst({ where: and(eq(schema.crmNotes.id, id), mine(schema.crmNotes.ownerId, schema.crmNotes.shared, actor.id)) });
  if (!n) throw new PlannerError("Nota não encontrada.");
  return n;
}

export async function createNote(actor: CrmActor, o: { title?: string; body?: string; color?: string; shared?: boolean; leadId?: string | null }) {
  const [n] = await db
    .insert(schema.crmNotes)
    .values({ ownerId: actor.id, title: clip(o.title, 140), body: clip(o.body, 20000), color: isNoteColor(o.color) ? o.color : "ivory", shared: !!o.shared, leadId: o.leadId ?? null })
    .returning();
  return n;
}

/** Salvar (autosave): quem pode ver uma nota compartilhada também pode editar; só o dono troca o compartilhamento. */
export async function updateNote(actor: CrmActor, id: string, p: { title?: string; body?: string; color?: string; pinned?: boolean; shared?: boolean }) {
  const n = await ownNote(actor, id);
  const set: Partial<typeof schema.crmNotes.$inferInsert> = { updatedAt: new Date() };
  if (p.title !== undefined) set.title = clip(p.title, 140);
  if (p.body !== undefined) set.body = String(p.body).slice(0, 20000);
  if (p.color !== undefined && isNoteColor(p.color)) set.color = p.color;
  if (p.pinned !== undefined) set.pinned = p.pinned;
  if (p.shared !== undefined && n.ownerId === actor.id) set.shared = p.shared;
  await db.update(schema.crmNotes).set(set).where(eq(schema.crmNotes.id, n.id));
}

export async function toggleNoteCheck(actor: CrmActor, id: string, line: number) {
  const n = await ownNote(actor, id);
  await db.update(schema.crmNotes).set({ body: toggleCheck(n.body, line), updatedAt: new Date() }).where(eq(schema.crmNotes.id, n.id));
}

export async function deleteNote(actor: CrmActor, id: string) {
  await db.delete(schema.crmNotes).where(and(eq(schema.crmNotes.id, id), eq(schema.crmNotes.ownerId, actor.id)));
}

// ---------------------------------------------------------------- lembretes
export async function reminders(actor: CrmActor, includeDone = false) {
  return db.query.crmReminders.findMany({
    where: and(eq(schema.crmReminders.ownerId, actor.id), includeDone ? undefined : isNull(schema.crmReminders.doneAt)),
    orderBy: [asc(schema.crmReminders.remindAt)],
    limit: 200,
  });
}

export async function addReminder(actor: CrmActor, o: { text: string; remindAt: Date; repeat: Repeat; leadId?: string | null }) {
  const text = clip(o.text, 300);
  if (!text) throw new PlannerError("Escreva o que é para lembrar.");
  if (Number.isNaN(o.remindAt.getTime())) throw new PlannerError("Horário inválido.");
  await db.insert(schema.crmReminders).values({ ownerId: actor.id, text, remindAt: o.remindAt, repeat: isRepeat(o.repeat) ? o.repeat : "none", leadId: o.leadId ?? null });
}

export async function reminderAction(actor: CrmActor, id: string, act: "done" | "undo" | "snooze10" | "snooze60" | "tomorrow" | "delete") {
  const r = await db.query.crmReminders.findFirst({ where: and(eq(schema.crmReminders.id, id), eq(schema.crmReminders.ownerId, actor.id)) });
  if (!r) throw new PlannerError("Lembrete não encontrado.");
  const now = Date.now();
  if (act === "delete") return void (await db.delete(schema.crmReminders).where(eq(schema.crmReminders.id, r.id)));
  if (act === "undo") return void (await db.update(schema.crmReminders).set({ doneAt: null }).where(eq(schema.crmReminders.id, r.id)));
  if (act === "done") {
    // repetição: "feito" passa para a próxima vez
    const next = nextOccurrence(r.remindAt, r.repeat as Repeat, now);
    await db.update(schema.crmReminders).set(next ? { remindAt: next, firedAt: null } : { doneAt: new Date() }).where(eq(schema.crmReminders.id, r.id));
    return;
  }
  const at = act === "snooze10" ? now + 10 * 60_000 : act === "snooze60" ? now + 60 * 60_000 : brDayStart(new Date(now)).getTime() + DAY + 9 * 3600_000;
  await db.update(schema.crmReminders).set({ remindAt: new Date(at), firedAt: null, doneAt: null }).where(eq(schema.crmReminders.id, r.id));
}

// ---------------------------------------------------------------- disparo dos avisos
/** Avisos da agenda e dos lembretes que chegaram na hora. Seguro para rodar várias vezes (marca antes de avisar). */
export async function fireDue(now = new Date()) {
  const { sendPush } = await import("@/services/push");
  let sent = 0;
  // compromissos: candidatos começando nas próximas 24 h (o aviso pode ser até 1 dia antes)
  const evs = await db.query.crmEvents.findMany({ where: and(isNull(schema.crmEvents.remindedAt), isNull(schema.crmEvents.doneAt), isNotNull(schema.crmEvents.remindMin), gte(schema.crmEvents.startsAt, new Date(now.getTime() - 6 * 3600_000)), lte(schema.crmEvents.startsAt, new Date(now.getTime() + DAY + 60_000))), limit: 100 });
  for (const e of evs) {
    if (!eventReminderDue(e, now.getTime())) continue;
    const [lock] = await db.update(schema.crmEvents).set({ remindedAt: now }).where(and(eq(schema.crmEvents.id, e.id), isNull(schema.crmEvents.remindedAt))).returning({ id: schema.crmEvents.id });
    if (!lock) continue;
    const mins = Math.round((e.startsAt.getTime() - now.getTime()) / 60_000);
    const when = mins <= 0 ? "agora" : mins < 60 ? `em ${mins} min` : `às ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" }).format(e.startsAt)}`;
    await sendPush(e.shared ? "all" : [e.ownerId], { title: `${e.title} · ${when}`, body: [e.location, remindLabel(e.remindMin)].filter(Boolean).join(" · "), url: `/crm/agenda?ver=${e.id}`, category: "agenda", tag: `ev-${e.id}` }).catch(() => null);
    sent++;
  }
  const rs = await db.query.crmReminders.findMany({ where: and(isNull(schema.crmReminders.doneAt), lte(schema.crmReminders.remindAt, now), isNull(schema.crmReminders.firedAt)), limit: 100 });
  for (const r of rs) {
    const [lock] = await db.update(schema.crmReminders).set({ firedAt: now }).where(and(eq(schema.crmReminders.id, r.id), isNull(schema.crmReminders.firedAt))).returning({ id: schema.crmReminders.id });
    if (!lock) continue;
    await sendPush([r.ownerId], { title: "Lembrete", body: r.text, url: r.leadId ? `/crm/leads/${r.leadId}` : "/crm/lembretes", category: "lembretes", tag: `rem-${r.id}` }).catch(() => null);
    // repetição: já agenda a próxima
    const next = nextOccurrence(r.remindAt, r.repeat as Repeat, now.getTime());
    if (next) await db.update(schema.crmReminders).set({ remindAt: next, firedAt: null }).where(eq(schema.crmReminders.id, r.id));
    sent++;
  }
  return { sent };
}

// ---------------------------------------------------------------- ilha ao vivo + painel "Hoje"
export async function liveFor(actor: CrmActor, now = new Date()): Promise<Live | null> {
  const [items, rem, journey] = await Promise.all([
    agenda(actor, new Date(now.getTime() - 6 * 3600_000), new Date(now.getTime() + 2 * 3600_000)),
    db.query.crmReminders.findMany({ where: and(eq(schema.crmReminders.ownerId, actor.id), isNull(schema.crmReminders.doneAt), gte(schema.crmReminders.remindAt, now), lte(schema.crmReminders.remindAt, new Date(now.getTime() + 3600_000))), limit: 10 }),
    db.query.crmJourneys.findFirst({ where: and(eq(schema.crmJourneys.actorId, actor.id), isNull(schema.crmJourneys.endedAt)), orderBy: desc(schema.crmJourneys.startedAt) }),
  ]);
  return liveActivity({ now: now.getTime(), items, reminders: rem.map((r) => ({ id: r.id, text: r.text, remindAt: r.remindAt })), journey: journey ?? null });
}

/** Resumo para o "Hoje" e para os widgets do app Android. */
export async function plannerSummary(actor: CrmActor, now = new Date()) {
  const [items, rem, pinned] = await Promise.all([
    agenda(actor, now, new Date(now.getTime() + 7 * DAY)),
    db.query.crmReminders.findMany({ where: and(eq(schema.crmReminders.ownerId, actor.id), isNull(schema.crmReminders.doneAt)), orderBy: asc(schema.crmReminders.remindAt), limit: 5 }),
    db.query.crmNotes.findFirst({ where: and(mine(schema.crmNotes.ownerId, schema.crmNotes.shared, actor.id), eq(schema.crmNotes.pinned, true)), orderBy: desc(schema.crmNotes.updatedAt) }),
  ]);
  const next = items.filter((i) => !i.done && i.startsAt.getTime() + i.durationMin * 60_000 > now.getTime()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return { next: next.slice(0, 5), reminders: rem, pinned: pinned ?? null };
}

/** Dados extras dos widgets do app Android (agenda, lembretes, nota fixada, funil) e da ilha. */
export async function appExtras(actor: CrmActor, now = new Date()) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const hm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const [sum, live, funnel] = await Promise.all([
    plannerSummary(actor, now),
    liveFor(actor, now),
    db.select({ status: schema.crmLeads.status, n: sql<number>`count(*)::int` }).from(schema.crmLeads).where(inArray(schema.crmLeads.status, ["NEW", "CONTACT", "DEMO", "PROPOSAL", "WON"])).groupBy(schema.crmLeads.status),
  ]);
  const count = (s: string) => Number(funnel.find((f) => f.status === s)?.n ?? 0);
  const today = brDayStart(now).getTime();
  const label = (d: Date) => (d.getTime() >= today && d.getTime() < today + DAY ? `hoje ${hm.format(d)}` : fmt.format(d).replace(",", ""));
  return {
    agenda: sum.next.slice(0, 4).map((i) => ({ title: i.title, when: label(i.startsAt), at: i.startsAt.toISOString(), url: i.url, color: i.kind })),
    reminders: sum.reminders.slice(0, 4).map((r) => ({ id: r.id, text: r.text, when: label(r.remindAt), late: r.remindAt.getTime() < now.getTime() })),
    note: sum.pinned ? { id: sum.pinned.id, title: sum.pinned.title || "Nota fixada", body: sum.pinned.body.slice(0, 400) } : null,
    funnel: { NEW: count("NEW"), CONTACT: count("CONTACT"), DEMO: count("DEMO"), PROPOSAL: count("PROPOSAL"), WON: count("WON") },
    live,
  };
}
