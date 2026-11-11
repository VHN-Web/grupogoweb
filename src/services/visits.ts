import "server-only";
// Acessos ao site oficial, à página de afiliados e aos links de afiliados (tela CRM → Acessos e widget do app).
import { createHmac } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { brDayKey, deltaPct, deviceOf, isBot, lastDays, VISIT_AREAS, visitArea, visitSeries, visitSource, type DayCount, type VisitArea } from "@/core/visits";
import { appUrl } from "@/lib/urls";

const SECRET = () => process.env.SESSION_SECRET || process.env.AUTH_SECRET || "gw-visits";

export async function recordVisit(i: { path: string; referrer?: string | null; origem?: string | null; utm?: string | null; ua: string | null; ip: string; country?: string | null }) {
  const area = visitArea(i.path);
  if (!area || isBot(i.ua)) return false;
  const day = brDayKey();
  const visitor = createHmac("sha256", SECRET()).update(`${i.ip}|${i.ua}|${day}`).digest("hex").slice(0, 32);
  let ownHost: string | null = null;
  try {
    ownHost = new URL(appUrl()).hostname;
  } catch {}
  await db
    .insert(schema.siteVisits)
    .values({
      day,
      area,
      visitor,
      path: i.path.split(/[?#]/)[0].slice(0, 120) || "/",
      source: visitSource({ origem: i.origem, utm: i.utm, referrer: i.referrer, ownHost }),
      device: deviceOf(i.ua),
      country: i.country?.slice(0, 2) || null,
    })
    .onConflictDoUpdate({
      target: [schema.siteVisits.day, schema.siteVisits.area, schema.siteVisits.visitor],
      set: { views: sql`${schema.siteVisits.views} + 1`, lastAt: new Date() },
    });
  return true;
}

/** Números da tela de acessos (últimos `days` dias). */
export async function visitStats(days = 30) {
  const now = new Date();
  const list = lastDays(days, now);
  const prevStart = lastDays(days * 2, now)[0];
  const today = list[list.length - 1];
  const yesterday = list[list.length - 2] ?? today;
  const since = list[0];

  const [rows, prevRows, sources, pages, devices, online, topLinks] = await Promise.all([
    db
      .select({ day: schema.siteVisits.day, area: schema.siteVisits.area, visitors: sql<number>`count(*)::int`, views: sql<number>`coalesce(sum(${schema.siteVisits.views}),0)::int` })
      .from(schema.siteVisits)
      .where(gte(schema.siteVisits.day, since))
      .groupBy(schema.siteVisits.day, schema.siteVisits.area),
    db
      .select({ area: schema.siteVisits.area, visitors: sql<number>`count(*)::int` })
      .from(schema.siteVisits)
      .where(and(gte(schema.siteVisits.day, prevStart), sql`${schema.siteVisits.day} < ${since}`))
      .groupBy(schema.siteVisits.area),
    db
      .select({ area: schema.siteVisits.area, source: schema.siteVisits.source, n: sql<number>`count(*)::int` })
      .from(schema.siteVisits)
      .where(gte(schema.siteVisits.day, since))
      .groupBy(schema.siteVisits.area, schema.siteVisits.source)
      .orderBy(desc(sql`count(*)`))
      .limit(60),
    db
      .select({ area: schema.siteVisits.area, path: schema.siteVisits.path, n: sql<number>`count(*)::int` })
      .from(schema.siteVisits)
      .where(gte(schema.siteVisits.day, since))
      .groupBy(schema.siteVisits.area, schema.siteVisits.path)
      .orderBy(desc(sql`count(*)`))
      .limit(60),
    db
      .select({ device: schema.siteVisits.device, n: sql<number>`count(*)::int` })
      .from(schema.siteVisits)
      .where(gte(schema.siteVisits.day, since))
      .groupBy(schema.siteVisits.device),
    db
      .select({ area: schema.siteVisits.area, n: sql<number>`count(*)::int` })
      .from(schema.siteVisits)
      .where(gte(schema.siteVisits.lastAt, new Date(now.getTime() - 5 * 60_000)))
      .groupBy(schema.siteVisits.area),
    // cliques nos links dos afiliados (contados desde o início do programa)
    db
      .select({ name: schema.affiliates.name, code: schema.affiliates.code, n: sql<number>`count(*)::int` })
      .from(schema.affiliateClicks)
      .innerJoin(schema.affiliates, eq(schema.affiliates.id, schema.affiliateClicks.affiliateId))
      .where(gte(schema.affiliateClicks.createdAt, new Date(now.getTime() - days * 86400_000)))
      .groupBy(schema.affiliates.name, schema.affiliates.code)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);

  const series = visitSeries(rows as DayCount[], list);
  const pick = (area: VisitArea, d: string) => (rows as DayCount[]).find((r) => r.area === area && r.day === d)?.visitors ?? 0;
  const areas = VISIT_AREAS.map((a) => {
    const prev = prevRows.find((r) => r.area === a.id)?.visitors ?? 0;
    return {
      ...a,
      today: pick(a.id, today),
      yesterday: pick(a.id, yesterday),
      online: online.find((r) => r.area === a.id)?.n ?? 0,
      total: series[a.id].totalVisitors,
      views: series[a.id].totalViews,
      delta: deltaPct(series[a.id].totalVisitors, prev),
      series: series[a.id].visitors,
      sources: sources.filter((s) => s.area === a.id).slice(0, 6),
      pages: pages.filter((p) => p.area === a.id).slice(0, 6),
    };
  });
  return { days: list, areas, devices, topLinks };
}

/** Resumo curto para o widget do app e a notificação de acessos. */
export async function visitsToday() {
  const today = brDayKey();
  const yesterday = brDayKey(new Date(Date.now() - 86400_000));
  const rows = await db
    .select({ day: schema.siteVisits.day, area: schema.siteVisits.area, n: sql<number>`count(*)::int` })
    .from(schema.siteVisits)
    .where(gte(schema.siteVisits.day, yesterday))
    .groupBy(schema.siteVisits.day, schema.siteVisits.area);
  const get = (d: string, a: VisitArea) => rows.find((r) => r.day === d && r.area === a)?.n ?? 0;
  return {
    site: { today: get(today, "site"), yesterday: get(yesterday, "site") },
    afiliados: { today: get(today, "afiliados"), yesterday: get(yesterday, "afiliados") },
    link: { today: get(today, "link"), yesterday: get(yesterday, "link") },
  };
}
