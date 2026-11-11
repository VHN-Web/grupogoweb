import "server-only";
// Notificações personalizadas do CRM: preferências por sócio, central de avisos e os dados do app Android (widgets).
import { and, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { brDayStart } from "@/core/crm";
import { DEFAULT_NOTIFY, isCategory, parseNotifyPrefs, shouldPush, type NotifyCategory, type NotifyPrefs } from "@/core/crm-notify";
import { brDayKey } from "@/core/visits";
import { crmConfig, type CrmActor } from "@/services/crm";
import { sendPush } from "@/services/push";
import { visitsToday } from "@/services/visits";

export async function notifyPrefs(actorId: string): Promise<NotifyPrefs> {
  const r = await db.query.crmNotifyPrefs.findFirst({ where: eq(schema.crmNotifyPrefs.actorId, actorId) });
  return r ? parseNotifyPrefs(r.prefs) : DEFAULT_NOTIFY;
}

export async function saveNotifyPrefs(actorId: string, p: NotifyPrefs) {
  const prefs = JSON.stringify(parseNotifyPrefs(JSON.stringify(p)));
  await db
    .insert(schema.crmNotifyPrefs)
    .values({ actorId, prefs })
    .onConflictDoUpdate({ target: schema.crmNotifyPrefs.actorId, set: { prefs, updatedAt: new Date() } });
}

export async function unreadCount(actorId: string) {
  const [r] = await db.select({ n: count() }).from(schema.crmNotifications).where(and(eq(schema.crmNotifications.actorId, actorId), isNull(schema.crmNotifications.readAt)));
  return r?.n ?? 0;
}

export async function inbox(actorId: string, category?: string | null) {
  return db.query.crmNotifications.findMany({
    where: and(eq(schema.crmNotifications.actorId, actorId), isCategory(category) ? eq(schema.crmNotifications.category, category) : undefined),
    orderBy: desc(schema.crmNotifications.createdAt),
    limit: 100,
  });
}

export async function markAllRead(actorId: string) {
  await db.update(schema.crmNotifications).set({ readAt: new Date() }).where(and(eq(schema.crmNotifications.actorId, actorId), isNull(schema.crmNotifications.readAt)));
}

/** Limpa avisos com mais de 90 dias (roda no cron). */
export async function pruneInbox() {
  await db.delete(schema.crmNotifications).where(lt(schema.crmNotifications.createdAt, new Date(Date.now() - 90 * 86400_000)));
}

/** Números do widget "Hoje no CRM" (e do topo do app). */
export async function widgetData(actor: CrmActor) {
  const day = brDayStart();
  const dayEnd = new Date(day.getTime() + 86400_000);
  const cfg = await crmConfig();
  const [followUps, newLeads, contacts, demos, tickets, unread, visits] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.crmLeads)
      .where(
        and(
          isNotNull(schema.crmLeads.followUpAt),
          lte(schema.crmLeads.followUpAt, dayEnd),
          inArray(schema.crmLeads.status, ["NEW", "CONTACT", "DEMO", "PROPOSAL"]),
          or(eq(schema.crmLeads.ownerId, actor.id), isNull(schema.crmLeads.ownerId)),
        ),
      ),
    db.select({ n: count() }).from(schema.crmLeads).where(gte(schema.crmLeads.createdAt, day)),
    db.select({ n: count() }).from(schema.crmActivities).where(and(eq(schema.crmActivities.actorId, actor.id), eq(schema.crmActivities.kind, "contact"), gte(schema.crmActivities.createdAt, day))),
    db.select({ n: count() }).from(schema.crmLeads).where(and(eq(schema.crmLeads.status, "DEMO"), gte(schema.crmLeads.demoAt, day), lt(schema.crmLeads.demoAt, dayEnd))),
    db.select({ n: count() }).from(schema.supportTickets).where(inArray(schema.supportTickets.status, ["OPEN", "IN_PROGRESS"])),
    unreadCount(actor.id),
    visitsToday(),
  ]);
  return {
    name: actor.name.split(" ")[0],
    followUps: followUps[0]?.n ?? 0,
    newLeads: newLeads[0]?.n ?? 0,
    contacts: contacts[0]?.n ?? 0,
    goal: cfg.goals.contacts,
    demos: demos[0]?.n ?? 0,
    tickets: tickets[0]?.n ?? 0,
    unread,
    visits,
    updatedAt: new Date().toISOString(),
  };
}

/** Feed do app Android: avisos novos desde `since` (+ se devem tocar, conforme as preferências). */
export async function appFeed(actor: CrmActor, since: Date | null) {
  const prefs = await notifyPrefs(actor.id);
  const from = since && !Number.isNaN(since.getTime()) ? since : new Date(Date.now() - 30 * 60_000);
  const rows = await db.query.crmNotifications.findMany({
    where: and(eq(schema.crmNotifications.actorId, actor.id), gt(schema.crmNotifications.createdAt, from)),
    orderBy: desc(schema.crmNotifications.createdAt),
    limit: 20,
  });
  const now = new Date();
  return {
    prefs,
    notifications: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      url: r.url ?? "/crm",
      category: r.category ?? "",
      at: r.createdAt.toISOString(),
      ring: shouldPush(prefs, (r.category as NotifyCategory | null) ?? null, now),
    })),
  };
}

/** Resumo de acessos do dia (cron do fim da tarde, 1x por dia). */
export async function notifyVisitsSummary() {
  const brHour = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  if (brHour < 16) return { skipped: true };
  const key = `visits:${brDayKey()}`;
  const claimed = await db.insert(schema.nudgeLog).values({ key }).onConflictDoNothing().returning({ key: schema.nudgeLog.key });
  if (!claimed.length) return { skipped: true };
  const v = await visitsToday();
  const total = v.site.today + v.afiliados.today + v.link.today;
  const arrow = (a: number, b: number) => (a > b ? "▲" : a < b ? "▼" : "=");
  await sendPush("all", {
    title: `${total} ${total === 1 ? "pessoa acessou" : "pessoas acessaram"} hoje`,
    body: `Site ${v.site.today} ${arrow(v.site.today, v.site.yesterday)} · Afiliados ${v.afiliados.today} ${arrow(v.afiliados.today, v.afiliados.yesterday)} · Links ${v.link.today} ${arrow(v.link.today, v.link.yesterday)}`,
    url: "/crm/acessos",
    tag: "acessos",
    category: "acessos",
  });
  return { sent: true, total };
}

