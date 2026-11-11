import "server-only";
// CRM de prospecção dos sócios (app /crm). Regras puras em core/crm.ts.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import {
  CRM_STATUS_LABEL,
  brDayStart,
  brMonthStart,
  brWeekStart,
  cleanInstagram,
  csvToRecords,
  dedupeKey,
  journeySeconds,
  leadCode,
  normalizeBrPhone,
  parseCrmConfig,
  scoreFromText,
  scoreLead,
  statusFromText,
  type Channel,
  type CrmConfig,
  type CrmStatus,
  type Score,
} from "@/core/crm";
import { getPlatformAdmin } from "@/lib/auth";
import { sealSecret } from "@/lib/secrets";
import initialLeads from "@/data/crm-initial-leads.json";
import { sendPush } from "./push";

export class CrmError extends Error {}

// ---------------------------------------------------------------- quem está usando
export type CrmActor = { id: string; name: string };

export async function requireCrm(): Promise<CrmActor> {
  const a = await getPlatformAdmin();
  if (!a) redirect("/admin/login?next=/crm");
  return { id: a.id ?? "platform", name: a.id ? a.name : "Lázaro" };
}

/** Sócios (todos os admins da plataforma). "platform" = login com a senha-mestra. */
export async function partners(): Promise<CrmActor[]> {
  const admins = await db.query.platformAdmins.findMany({ where: eq(schema.platformAdmins.active, true), columns: { id: true, name: true }, orderBy: asc(schema.platformAdmins.name) });
  return [{ id: "platform", name: "Lázaro" }, ...admins];
}
export const firstName = (n: string) => n.split(" ")[0];

// ---------------------------------------------------------------- configuração
export async function crmConfig() {
  const s = await db.query.platformSettings.findFirst();
  return parseCrmConfig(s?.crmConfig);
}
export async function saveCrmConfig(patch: Partial<CrmConfig> & { geminiKey?: string | null }) {
  const cur = await crmConfig();
  const { geminiKey, ...rest } = patch;
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<CrmConfig>;
  const next: CrmConfig = { ...cur, ...clean };
  if (geminiKey !== undefined) next.geminiKeySealed = geminiKey ? sealSecret(geminiKey.trim()) : null;
  const json = JSON.stringify(parseCrmConfig(JSON.stringify(next)));
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", crmConfig: json })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { crmConfig: json, updatedAt: new Date() } });
}

// ---------------------------------------------------------------- leads
export type LeadInput = {
  name: string;
  category?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  instagram?: string | null;
  email?: string | null;
  website?: string | null;
  rating?: number | null; // 4.8
  reviews?: number | null;
  pain?: string | null;
  pitch?: string | null;
  score?: Score | null; // se vier da planilha
  status?: CrmStatus;
  notes?: string | null;
  ownerId?: string | null;
  followUpAt?: Date | null;
  affiliateLeadId?: string | null;
};

async function nextCodeNumber() {
  const [r] = await db.select({ n: sql<number>`coalesce(max(nullif(regexp_replace(${schema.crmLeads.code}, '\\D', '', 'g'), '')::int), 0)::int` }).from(schema.crmLeads);
  return (r?.n ?? 0) + 1;
}

const clip = (s: string | null | undefined, n: number) => (s ? s.trim().slice(0, n) || null : null);

/** Cria (ou completa, se já existir) um lead. Retorna { lead, created }. */
export async function upsertLead(i: LeadInput, source: schema.CrmLead["source"], actorId?: string) {
  const name = i.name?.trim();
  if (!name) throw new CrmError("Informe o nome do negócio.");
  const phone = normalizeBrPhone(i.phone);
  const instagram = cleanInstagram(i.instagram);
  const key = dedupeKey({ phone, instagram, name, city: i.city, neighborhood: i.neighborhood });
  const sc = scoreLead({ website: i.website, reviews: i.reviews, phone, instagram });
  const existing = await db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.dedupeKey, key) });
  if (existing) {
    // completa campos vazios sem mexer no andamento (status/responsável)
    const fill: Partial<schema.CrmLead> = {};
    const maybe = <K extends keyof schema.CrmLead>(k: K, v: schema.CrmLead[K] | null | undefined) => {
      if ((existing[k] === null || existing[k] === "") && v !== null && v !== undefined && v !== "") fill[k] = v;
    };
    maybe("category", clip(i.category, 80));
    maybe("neighborhood", clip(i.neighborhood, 80));
    maybe("city", clip(i.city, 80));
    maybe("address", clip(i.address, 200));
    maybe("instagram", instagram);
    maybe("email", clip(i.email, 120));
    maybe("website", clip(i.website, 300));
    maybe("pain", clip(i.pain, 600));
    maybe("pitch", clip(i.pitch, 600));
    maybe("reviews", i.reviews ?? null);
    maybe("affiliateLeadId", i.affiliateLeadId ?? null);
    if (Object.keys(fill).length) await db.update(schema.crmLeads).set({ ...fill, updatedAt: new Date() }).where(eq(schema.crmLeads.id, existing.id));
    return { lead: existing, created: false };
  }
  let lead: schema.CrmLead | undefined;
  for (let t = 0; t < 5 && !lead; t++) {
    [lead] = await db
      .insert(schema.crmLeads)
      .values({
        code: leadCode(await nextCodeNumber()),
        name: name.slice(0, 120),
        category: clip(i.category, 80),
        neighborhood: clip(i.neighborhood, 80),
        city: clip(i.city, 80),
        address: clip(i.address, 200),
        phone,
        instagram,
        email: clip(i.email, 120)?.toLowerCase() ?? null,
        website: clip(i.website, 300),
        rating: i.rating ? Math.round(i.rating * 10) : null,
        reviews: i.reviews ?? null,
        pain: clip(i.pain, 600),
        pitch: clip(i.pitch, 600),
        score: i.score ?? sc.score,
        scoreNotes: JSON.stringify(sc.reasons),
        linkKind: sc.linkKind,
        competitor: sc.competitor ?? null,
        status: i.status ?? "NEW",
        ownerId: i.ownerId ?? null,
        source,
        dedupeKey: key,
        followUpAt: i.followUpAt ?? null,
        notes: clip(i.notes, 2000),
        affiliateLeadId: i.affiliateLeadId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!lead) {
      const again = await db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.dedupeKey, key) });
      if (again) return { lead: again, created: false };
    }
  }
  if (!lead) throw new CrmError("Não foi possível salvar o lead.");
  if (actorId) await activity(lead.id, actorId, "system", null, `Lead criado (${SOURCE_LABEL[source]})`);
  return { lead, created: true };
}

export const SOURCE_LABEL: Record<schema.CrmLead["source"], string> = { hunter: "busca automática", import: "planilha", manual: "cadastro manual", affiliate: "afiliado", site: "site", whatsapp: "WhatsApp (Geovana)" };

/** Importa linhas (planilha/CSV). Não sobrescreve andamento de quem já existe. */
export async function importRecords(rows: Record<string, string>[], source: "import" | "manual" = "import") {
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    if (!r.name?.trim()) continue;
    const city = r.city || (/cabedelo/i.test(`${r.neighborhood} ${r.address}`) ? "Cabedelo - PB" : null);
    const { created } = await upsertLead(
      {
        name: r.name,
        category: r.category,
        neighborhood: r.neighborhood,
        city,
        address: r.address,
        phone: r.phone,
        instagram: r.instagram,
        email: r.email,
        website: r.website,
        reviews: r.reviews ? Number(r.reviews.replace(/\D/g, "")) || null : null,
        pain: r.pain,
        pitch: r.pitch,
        score: scoreFromText(r.score),
        status: statusFromText(r.status),
        notes: r.notes,
      },
      source,
    );
    if (created) added++;
    else updated++;
  }
  return { added, updated };
}

/** Na primeira abertura do CRM, traz os leads que já estavam no Lead Hunter. */
export async function ensureSeeded() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.crmLeads);
  if ((r?.n ?? 0) > 0) return false;
  await importRecords(
    (initialLeads as Record<string, string>[]).map((l) => ({ ...l, city: /cabedelo/i.test(`${l.neighborhood} ${l.address}`) ? "Cabedelo - PB" : "João Pessoa - PB" })),
    "import",
  );
  return true;
}

/** Puxa a planilha do Google (aba "Leads CRM") — precisa estar compartilhada como "qualquer pessoa com o link". */
export async function syncSheet() {
  const cfg = await crmConfig();
  if (!cfg.sheetId) throw new CrmError("Cadastre o ID da planilha em Configurações.");
  const url = `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("Leads CRM")}`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) throw new CrmError("Não consegui abrir a planilha. Confira se ela está compartilhada como “qualquer pessoa com o link pode ver”.");
  const text = await res.text();
  if (text.trim().startsWith("<")) throw new CrmError("A planilha não está pública. Compartilhe como “qualquer pessoa com o link pode ver”.");
  return importRecords(csvToRecords(text), "import");
}

// ---------------------------------------------------------------- atividades e andamento
export async function activity(leadId: string | null, actorId: string, kind: schema.CrmActivity["kind"], channel: Channel | null, body?: string | null) {
  await db.insert(schema.crmActivities).values({ leadId, actorId, kind, channel, body: body?.slice(0, 2000) ?? null });
}

async function leadOr404(id: string) {
  const l = await db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.id, id) });
  if (!l) throw new CrmError("Lead não encontrado.");
  return l;
}

/** Registra um contato (conta na meta). Sem lead = contador rápido. */
export async function logContact(actor: CrmActor, leadId: string | null, channel: Channel, note?: string | null) {
  const now = new Date();
  if (leadId) {
    const l = await leadOr404(leadId);
    await db
      .update(schema.crmLeads)
      .set({ lastContactAt: now, contactAt: l.contactAt ?? now, status: l.status === "NEW" ? "CONTACT" : l.status, ownerId: l.ownerId ?? actor.id, updatedAt: now })
      .where(eq(schema.crmLeads.id, l.id));
  }
  await activity(leadId, actor.id, "contact", channel, note);
}

export async function undoQuickContact(actor: CrmActor, channel: Channel) {
  const last = await db.query.crmActivities.findFirst({
    where: and(eq(schema.crmActivities.actorId, actor.id), eq(schema.crmActivities.kind, "contact"), eq(schema.crmActivities.channel, channel), isNull(schema.crmActivities.leadId), gte(schema.crmActivities.createdAt, brDayStart())),
    orderBy: desc(schema.crmActivities.createdAt),
  });
  if (last) await db.delete(schema.crmActivities).where(eq(schema.crmActivities.id, last.id));
}

export async function setStatus(actor: CrmActor, leadId: string, status: CrmStatus, extra: { lostReason?: string | null; demoAt?: Date | null } = {}) {
  const l = await leadOr404(leadId);
  const set: Partial<schema.CrmLead> = { status, updatedAt: new Date(), ownerId: l.ownerId ?? actor.id };
  if (status === "LOST") set.lostReason = extra.lostReason?.slice(0, 300) || l.lostReason;
  if (status === "DEMO" && extra.demoAt) {
    set.demoAt = extra.demoAt;
    set.followUpAt = extra.demoAt;
    set.followUpNotifiedAt = null;
  }
  if (status === "WON" || status === "LOST") set.followUpAt = null;
  await db.update(schema.crmLeads).set(set).where(eq(schema.crmLeads.id, l.id));
  if (l.status !== status) {
    const kind = status === "WON" ? "won" : status === "LOST" ? "lost" : status === "DEMO" ? "demo" : "status";
    await activity(l.id, actor.id, kind, null, `${CRM_STATUS_LABEL[l.status]} → ${CRM_STATUS_LABEL[status]}${status === "LOST" && extra.lostReason ? ` · ${extra.lostReason}` : ""}${status === "DEMO" && extra.demoAt ? ` · ${fmtBr(extra.demoAt)}` : ""}`);
  }
}

export async function setFollowUp(actor: CrmActor, leadId: string, at: Date | null) {
  const l = await leadOr404(leadId);
  await db.update(schema.crmLeads).set({ followUpAt: at, followUpNotifiedAt: null, ownerId: l.ownerId ?? actor.id, updatedAt: new Date() }).where(eq(schema.crmLeads.id, l.id));
  await activity(l.id, actor.id, "followup", null, at ? `Retorno marcado para ${fmtBr(at)}` : "Retorno removido");
}

export async function addNote(actor: CrmActor, leadId: string, body: string) {
  if (!body.trim()) throw new CrmError("Escreva a anotação.");
  await leadOr404(leadId);
  await activity(leadId, actor.id, "note", null, body.trim());
  await db.update(schema.crmLeads).set({ updatedAt: new Date() }).where(eq(schema.crmLeads.id, leadId));
}

export async function setOwner(actor: CrmActor, leadId: string, ownerId: string | null) {
  const l = await leadOr404(leadId);
  await db.update(schema.crmLeads).set({ ownerId, updatedAt: new Date() }).where(eq(schema.crmLeads.id, l.id));
  const who = ownerId ? (await partners()).find((p) => p.id === ownerId)?.name ?? "—" : "ninguém";
  await activity(l.id, actor.id, "system", null, `Responsável: ${who}`);
  if (ownerId && ownerId !== actor.id) await sendPush([ownerId], { title: "Lead para você", body: `${firstName(actor.name)} passou ${l.name} para você.`, url: `/crm/leads/${l.id}`, tag: `lead-${l.id}`, category: "leads" });
}

export async function updateLeadFields(leadId: string, i: LeadInput) {
  const l = await leadOr404(leadId);
  const phone = normalizeBrPhone(i.phone);
  const instagram = cleanInstagram(i.instagram);
  const sc = scoreLead({ website: i.website, reviews: i.reviews, phone, instagram });
  await db
    .update(schema.crmLeads)
    .set({
      name: i.name.trim().slice(0, 120) || l.name,
      category: clip(i.category, 80),
      neighborhood: clip(i.neighborhood, 80),
      city: clip(i.city, 80),
      address: clip(i.address, 200),
      phone,
      instagram,
      email: clip(i.email, 120)?.toLowerCase() ?? null,
      website: clip(i.website, 300),
      reviews: i.reviews ?? null,
      pain: clip(i.pain, 600),
      pitch: clip(i.pitch, 600),
      score: i.score ?? sc.score,
      scoreNotes: JSON.stringify(sc.reasons),
      linkKind: sc.linkKind,
      competitor: sc.competitor ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.crmLeads.id, l.id));
}

export async function deleteLead(leadId: string) {
  await db.delete(schema.crmLeads).where(eq(schema.crmLeads.id, leadId));
}

export function fmtBr(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------- jornada
export async function currentJourney(actorId: string) {
  return db.query.crmJourneys.findFirst({ where: and(eq(schema.crmJourneys.actorId, actorId), isNull(schema.crmJourneys.endedAt)), orderBy: desc(schema.crmJourneys.startedAt) });
}

export async function startJourney(actor: CrmActor) {
  const cur = await currentJourney(actor.id);
  if (cur) return cur;
  const [j] = await db.insert(schema.crmJourneys).values({ actorId: actor.id }).returning();
  return j;
}

export async function togglePause(actor: CrmActor) {
  const j = await currentJourney(actor.id);
  if (!j) throw new CrmError("Inicie a jornada primeiro.");
  if (j.pauseStartedAt) {
    const add = Math.floor((Date.now() - j.pauseStartedAt.getTime()) / 1000);
    await db.update(schema.crmJourneys).set({ pauseStartedAt: null, pausedSeconds: j.pausedSeconds + add }).where(eq(schema.crmJourneys.id, j.id));
  } else await db.update(schema.crmJourneys).set({ pauseStartedAt: new Date() }).where(eq(schema.crmJourneys.id, j.id));
}

export async function endJourney(actor: CrmActor) {
  const j = await currentJourney(actor.id);
  if (!j) return null;
  const now = new Date();
  const paused = j.pauseStartedAt ? j.pausedSeconds + Math.floor((now.getTime() - j.pauseStartedAt.getTime()) / 1000) : j.pausedSeconds;
  const acts = await db.query.crmActivities.findMany({ where: and(eq(schema.crmActivities.actorId, actor.id), gte(schema.crmActivities.createdAt, j.startedAt)) });
  const summary = {
    seconds: journeySeconds({ startedAt: j.startedAt, endedAt: now, pauseStartedAt: null, pausedSeconds: paused }),
    contacts: acts.filter((a) => a.kind === "contact").length,
    demos: acts.filter((a) => a.kind === "demo").length,
    won: acts.filter((a) => a.kind === "won").length,
    followups: acts.filter((a) => a.kind === "followup").length,
  };
  await db.update(schema.crmJourneys).set({ endedAt: now, pauseStartedAt: null, pausedSeconds: paused, summary: JSON.stringify(summary) }).where(eq(schema.crmJourneys.id, j.id));
  return summary;
}

// ---------------------------------------------------------------- painel "Hoje"
export async function dashboard(actor: CrmActor) {
  const now = new Date();
  const day = brDayStart(now);
  const week = brWeekStart(now);
  const month = brMonthStart(now);
  const dayEnd = new Date(day.getTime() + 86400_000);
  const cfg = await crmConfig();

  const [journey, myActsToday, teamActsWeek, funnel, followUps, demosToday, implementing, deliveredMonth, paidMonth, newLeadsToday, affPending, tickets, people] = await Promise.all([
    currentJourney(actor.id),
    db.query.crmActivities.findMany({ where: and(eq(schema.crmActivities.actorId, actor.id), gte(schema.crmActivities.createdAt, day)) }),
    db
      .select({ actorId: schema.crmActivities.actorId, kind: schema.crmActivities.kind, n: sql<number>`count(*)::int` })
      .from(schema.crmActivities)
      .where(gte(schema.crmActivities.createdAt, week))
      .groupBy(schema.crmActivities.actorId, schema.crmActivities.kind),
    db.select({ status: schema.crmLeads.status, n: sql<number>`count(*)::int` }).from(schema.crmLeads).groupBy(schema.crmLeads.status),
    db.query.crmLeads.findMany({
      where: and(isNotNull(schema.crmLeads.followUpAt), lte(schema.crmLeads.followUpAt, dayEnd), inArray(schema.crmLeads.status, ["NEW", "CONTACT", "DEMO", "PROPOSAL"]), or(eq(schema.crmLeads.ownerId, actor.id), isNull(schema.crmLeads.ownerId))),
      orderBy: asc(schema.crmLeads.followUpAt),
      limit: 30,
    }),
    db.query.crmLeads.findMany({ where: and(eq(schema.crmLeads.status, "DEMO"), gte(schema.crmLeads.demoAt, day), lt(schema.crmLeads.demoAt, dayEnd)), orderBy: asc(schema.crmLeads.demoAt) }),
    db.query.customers.findMany({ where: eq(schema.customers.status, "IMPLEMENTING"), columns: { id: true, businessName: true, createdAt: true }, with: { plan: { columns: { name: true } } }, orderBy: asc(schema.customers.createdAt) }),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.customers).where(gte(schema.customers.deliveredAt, month)),
    db
      .select({ kind: schema.invoices.kind, n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.invoices.amountBrlMinor}), 0)::int` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.status, "PAID"), gte(schema.invoices.paidAt, month)))
      .groupBy(schema.invoices.kind),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.crmLeads).where(gte(schema.crmLeads.createdAt, day)),
    db.select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.affiliateCommissions.amountMinor}), 0)::int` }).from(schema.affiliateCommissions).where(eq(schema.affiliateCommissions.status, "PENDING")),
    db.query.supportTickets.findMany({ where: inArray(schema.supportTickets.status, ["OPEN", "IN_PROGRESS"]), columns: { id: true, protocol: true, subject: true, firstResponseAt: true, firstResponseDueAt: true, resolutionDueAt: true }, orderBy: asc(schema.supportTickets.firstResponseDueAt), limit: 20 }),
    partners(),
  ]);

  const count = (k: schema.CrmActivity["kind"]) => myActsToday.filter((a) => a.kind === k).length;
  const byChannel = Object.fromEntries((["whatsapp", "call", "instagram", "visit", "email"] as Channel[]).map((c) => [c, myActsToday.filter((a) => a.kind === "contact" && a.channel === c).length])) as Record<Channel, number>;
  const ranking = people
    .map((p) => {
      const g = (k: string) => teamActsWeek.filter((r) => r.actorId === p.id && r.kind === k).reduce((s, r) => s + r.n, 0);
      return { ...p, contacts: g("contact"), demos: g("demo"), won: g("won") };
    })
    .sort((a, b) => b.won - a.won || b.demos - a.demos || b.contacts - a.contacts);
  const f = Object.fromEntries(funnel.map((r) => [r.status, r.n])) as Partial<Record<CrmStatus, number>>;
  const setup = paidMonth.find((r) => r.kind === "SETUP");
  const subs = paidMonth.find((r) => r.kind === "SUBSCRIPTION");
  const ticketsLate = tickets.filter((t) => (!t.firstResponseAt && t.firstResponseDueAt < new Date(now.getTime() + 2 * 3600_000)) || t.resolutionDueAt < now);

  return {
    cfg,
    journey,
    today: { contacts: count("contact"), demos: count("demo"), won: count("won"), followups: count("followup"), byChannel },
    funnel: f,
    followUps,
    demosToday,
    implementing: implementing.map((c) => ({ ...c, days: Math.floor((now.getTime() - c.createdAt.getTime()) / 86400_000) })),
    deliveredMonth: deliveredMonth[0]?.n ?? 0,
    revenue: { setupCount: setup?.n ?? 0, setup: setup?.sum ?? 0, subs: subs?.sum ?? 0, subsCount: subs?.n ?? 0 },
    newLeadsToday: newLeadsToday[0]?.n ?? 0,
    affiliates: { count: affPending[0]?.n ?? 0, sum: affPending[0]?.sum ?? 0 },
    tickets: { open: tickets.length, late: ticketsLate.length },
    ranking,
  };
}

// ---------------------------------------------------------------- métricas da equipe
export async function teamMetrics(from: Date) {
  const [people, acts, journeys, owned] = await Promise.all([
    partners(),
    db.select({ actorId: schema.crmActivities.actorId, kind: schema.crmActivities.kind, n: sql<number>`count(*)::int` }).from(schema.crmActivities).where(gte(schema.crmActivities.createdAt, from)).groupBy(schema.crmActivities.actorId, schema.crmActivities.kind),
    db.query.crmJourneys.findMany({ where: gte(schema.crmJourneys.startedAt, from), orderBy: desc(schema.crmJourneys.startedAt) }),
    db.select({ ownerId: schema.crmLeads.ownerId, status: schema.crmLeads.status, n: sql<number>`count(*)::int` }).from(schema.crmLeads).groupBy(schema.crmLeads.ownerId, schema.crmLeads.status),
  ]);
  const rows = people.map((p) => {
    const g = (k: string) => acts.filter((r) => r.actorId === p.id && r.kind === k).reduce((s, r) => s + r.n, 0);
    const js = journeys.filter((j) => j.actorId === p.id);
    const seconds = js.reduce((s, j) => s + journeySeconds(j), 0);
    const leads = owned.filter((o) => o.ownerId === p.id).reduce((s, o) => s + o.n, 0);
    const contacts = g("contact");
    const demos = g("demo");
    const won = g("won");
    return { ...p, contacts, demos, won, lost: g("lost"), notes: g("note"), seconds, journeys: js.length, leads, conv: contacts ? won / contacts : 0, demoRate: contacts ? demos / contacts : 0 };
  });
  return { rows, journeys: journeys.slice(0, 30) };
}

// ---------------------------------------------------------------- integração com o resto do sistema
/** Indicação de afiliado / pedido de demonstração do site vira lead no CRM. */
export async function onAffiliateLead(l: { id: string; businessName: string; contactName: string; whatsapp: string; email: string | null; city: string | null; segment: string | null; note: string | null; scheduledAt: Date | null }, affiliateName: string) {
  try {
    const { lead, created } = await upsertLead(
      { name: l.businessName, category: l.segment, city: l.city, phone: l.whatsapp, email: l.email, notes: `Contato: ${l.contactName}. Indicado pelo afiliado ${affiliateName}.${l.note ? ` Obs.: ${l.note}` : ""}`, affiliateLeadId: l.id, status: l.scheduledAt ? "DEMO" : "NEW", followUpAt: l.scheduledAt },
      "affiliate",
    );
    if (created && l.scheduledAt) await db.update(schema.crmLeads).set({ demoAt: l.scheduledAt }).where(eq(schema.crmLeads.id, lead.id));
    await sendPush("all", {
      title: l.scheduledAt ? "Demonstração pedida" : "Nova indicação de afiliado",
      body: `${l.businessName} (${firstName(affiliateName)})${l.scheduledAt ? ` · ${fmtBr(l.scheduledAt)}` : ""}`,
      url: `/crm/leads/${lead.id}`,
      tag: `lead-${lead.id}`,
      category: l.scheduledAt ? "demos" : "afiliados",
    });
  } catch (e) {
    console.error("[crm]", e);
  }
}

async function leadForCustomer(c: { id: string; whatsapp: string | null; email: string }) {
  const phone = normalizeBrPhone(c.whatsapp);
  return db.query.crmLeads.findFirst({
    where: or(eq(schema.crmLeads.customerId, c.id), phone ? eq(schema.crmLeads.phone, phone) : sql`false`, eq(schema.crmLeads.email, c.email.toLowerCase())),
  });
}

/** Cliente contratou pelo site → lead vai para "Proposta" (aguardando pagamento). */
export async function onCustomerCreated(c: typeof schema.customers.$inferSelect) {
  try {
    const l = await leadForCustomer(c);
    if (l && l.status !== "WON") {
      await db.update(schema.crmLeads).set({ customerId: c.id, status: "PROPOSAL", followUpAt: new Date(Date.now() + 86400_000), followUpNotifiedAt: null, updatedAt: new Date() }).where(eq(schema.crmLeads.id, l.id));
      await activity(l.id, l.ownerId ?? "platform", "system", null, "Contratou pelo site — aguardando o pagamento da implantação");
    }
    await sendPush("all", { title: "Novo contrato no site", body: `${c.businessName} contratou — aguardando o pagamento da implantação.`, url: l ? `/crm/leads/${l.id}` : "/crm", tag: `cust-${c.id}`, category: "vendas" });
  } catch (e) {
    console.error("[crm]", e);
  }
}

/** Implantação paga → lead "Fechado" + aviso para todos. */
export async function onSetupPaid(customerId: string) {
  try {
    const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
    if (!c) return;
    const l = await leadForCustomer(c);
    if (l && l.status !== "WON") {
      await db.update(schema.crmLeads).set({ customerId: c.id, status: "WON", followUpAt: null, updatedAt: new Date() }).where(eq(schema.crmLeads.id, l.id));
      await activity(l.id, l.ownerId ?? "platform", "won", null, "Implantação paga — cliente fechado");
    }
    await sendPush("all", { title: "Implantação paga!", body: `${c.businessName} pagou a implantação. Hora de montar o sistema.`, url: "/crm", tag: `paid-${c.id}`, category: "vendas" });
  } catch (e) {
    console.error("[crm]", e);
  }
}

// ---------------------------------------------------------------- lembretes (cron)
/** Avisa cada sócio dos retornos que venceram e ainda não foram avisados. */
export async function notifyDueFollowUps() {
  const now = new Date();
  const due = await db.query.crmLeads.findMany({
    where: and(isNotNull(schema.crmLeads.followUpAt), lte(schema.crmLeads.followUpAt, new Date(now.getTime() + 3600_000)), isNull(schema.crmLeads.followUpNotifiedAt), inArray(schema.crmLeads.status, ["NEW", "CONTACT", "DEMO", "PROPOSAL"])),
    limit: 200,
  });
  const byOwner = new Map<string, schema.CrmLead[]>();
  for (const l of due) byOwner.set(l.ownerId ?? "all", [...(byOwner.get(l.ownerId ?? "all") ?? []), l]);
  for (const [owner, list] of byOwner) {
    const first = list[0];
    await sendPush(owner === "all" ? "all" : [owner], {
      title: list.length === 1 ? `Retorno: ${first.name}` : `${list.length} retornos para fazer`,
      body: list.length === 1 ? `${CRM_STATUS_LABEL[first.status]} · ${fmtBr(first.followUpAt!)}` : list.slice(0, 3).map((l) => l.name).join(", ") + (list.length > 3 ? "…" : ""),
      url: list.length === 1 ? `/crm/leads/${first.id}` : "/crm",
      tag: "followups",
      category: "retornos",
    });
  }
  if (due.length) await db.update(schema.crmLeads).set({ followUpNotifiedAt: now }).where(inArray(schema.crmLeads.id, due.map((l) => l.id)));
  return due.length;
}

export async function leadsForList(filter: { q?: string; status?: string; score?: string; owner?: string; city?: string; category?: string; source?: string }) {
  const conds = [];
  if (filter.status && filter.status !== "ALL") conds.push(eq(schema.crmLeads.status, filter.status as CrmStatus));
  else if (!filter.status) conds.push(ne(schema.crmLeads.status, "LOST"));
  if (filter.score) conds.push(eq(schema.crmLeads.score, filter.score as Score));
  if (filter.owner === "none") conds.push(isNull(schema.crmLeads.ownerId));
  else if (filter.owner) conds.push(eq(schema.crmLeads.ownerId, filter.owner));
  if (filter.city) conds.push(eq(schema.crmLeads.city, filter.city));
  if (filter.category) conds.push(eq(schema.crmLeads.category, filter.category));
  if (filter.source) conds.push(eq(schema.crmLeads.source, filter.source as schema.CrmLead["source"]));
  if (filter.q) {
    const like = `%${filter.q.toLowerCase()}%`;
    conds.push(sql`lower(${schema.crmLeads.name} || ' ' || coalesce(${schema.crmLeads.neighborhood}, '') || ' ' || coalesce(${schema.crmLeads.category}, '') || ' ' || coalesce(${schema.crmLeads.instagram}, '') || ' ' || coalesce(${schema.crmLeads.phone}, '') || ' ' || ${schema.crmLeads.code}) like ${like}`);
  }
  return db.query.crmLeads.findMany({
    where: conds.length ? and(...conds) : undefined,
    orderBy: [sql`case ${schema.crmLeads.score} when 'OURO' then 0 when 'PRATA' then 1 when 'BRONZE' then 2 else 3 end`, desc(schema.crmLeads.updatedAt)],
    limit: 500,
  });
}
