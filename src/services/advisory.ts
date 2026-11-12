import "server-only";
// =============================================================================
// Assessoria GoWeb — casos de uso. Regras puras em core/advisory.ts.
// Isolamento: toda consulta filtra pelo tenantId. Disponibilidade conferida no servidor em toda tela/ação.
// Comercial: o pedido de contratação vira lead no CRM; um sócio ativa o plano depois de cobrar pelo fluxo atual.
// Nada aqui altera planos, módulos, faturas ou assinaturas.
// =============================================================================
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AdvisoryPlan, AdvisoryPost, Tenant } from "@/db/schema";
import {
  ACTION_LABELS,
  DEFAULT_ADVISORY,
  OBJECTIVE_LABELS,
  THEME_LABELS,
  adResult,
  adTasks,
  advisoryAvailable,
  autoApproveDue,
  buildIcs,
  buildPlan,
  canAutoPublish,
  contentSlots,
  diagnose,
  estimate,
  fallbackCaption,
  gcalLink,
  goalsFor,
  igCaption,
  insights,
  isDuration,
  localDate,
  localSlot,
  parseAdvisory,
  parseObjectives,
  per30,
  snapTotal,
  splitInvestment,
  zonedToUtc,
  type Action,
  type AdTask,
  type AdvisoryConfig,
  type CalEvent,
  type Diagnosis,
  type MonthPlan,
  type Objective,
  type Period,
  type SelfReport,
  type StoreMetrics,
  type Theme,
} from "@/core/advisory";
import { getRegion, tr } from "@/core/region";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { tenantPublicUrl, appUrl } from "@/lib/urls";
import { audit } from "@/lib/security";
import { isSandbox } from "@/lib/sandbox";

export class AdvisoryError extends Error {}

const DAY = 86_400_000;
const L = (t: { country: string }) => tr(getRegion(t.country).locale);

// ---------------------------------------------------------------- configuração
export async function advisoryConfig(): Promise<AdvisoryConfig> {
  const s = await db.query.platformSettings.findFirst({ columns: { advisoryConfig: true } });
  return parseAdvisory(s?.advisoryConfig);
}

export async function saveAdvisoryConfig(next: AdvisoryConfig) {
  const parsed = parseAdvisory(JSON.stringify(next));
  // moeda sem preço fica gravada como null (não volta para o padrão na próxima leitura)
  const json = JSON.stringify({ ...parsed, pricing: { BRL: parsed.pricing.BRL ?? null, PYG: parsed.pricing.PYG ?? null } });
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", advisoryConfig: json })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { advisoryConfig: json, updatedAt: new Date() } });
}

/** Complemento disponível para a loja? Lança erro no idioma da loja. */
export async function assertAdvisory(t: Tenant) {
  const cfg = await advisoryConfig();
  const a = advisoryAvailable(cfg, t);
  if (!a.ok) throw new AdvisoryError(a.reason === "off" ? L(t)("La Asesoría GoWeb todavía no está disponible.", "A Assessoria GoWeb ainda não está disponível.") : L(t)("La Asesoría GoWeb todavía no está disponible en tu país.", "A Assessoria GoWeb ainda não está disponível no seu país."));
  return { cfg, pricing: a.pricing };
}

export async function advisoryVisible(t: Tenant) {
  return advisoryAvailable(await advisoryConfig(), t).ok;
}

// ---------------------------------------------------------------- números da loja
const notCancelled = (tenantId: string) => and(eq(schema.orders.tenantId, tenantId), ne(schema.orders.status, "CANCELLED"));

/** Métricas dos últimos `days` dias (ou do intervalo [from, to)). */
export async function storeMetrics(t: Tenant, from: Date, to: Date): Promise<StoreMetrics> {
  const tz = getRegion(t.country).timeZone;
  const where = and(notCancelled(t.id), gte(schema.orders.createdAt, from), lt(schema.orders.createdAt, to));
  const [orders, items, optIn] = await Promise.all([
    db.select({ id: schema.orders.id, at: schema.orders.createdAt, total: schema.orders.totalPyg, shopperId: schema.orders.shopperId, source: schema.orders.source }).from(schema.orders).where(where),
    db
      .select({ productId: schema.orderItems.productId, name: schema.orderItems.name, qty: sql<number>`sum(${schema.orderItems.quantity})::int` })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .where(where)
      .groupBy(schema.orderItems.productId, schema.orderItems.name),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.shoppers).where(and(eq(schema.shoppers.tenantId, t.id), eq(schema.shoppers.marketingOptIn, true))),
  ]);
  const bySlot = new Array(7 * 24).fill(0) as number[];
  const bySource: Record<string, number> = {};
  const perShopper = new Map<string, number>();
  for (const o of orders) {
    const s = localSlot(o.at, tz);
    bySlot[s.dow * 24 + s.hour]++;
    const src = o.source ?? "direto";
    bySource[src] = (bySource[src] ?? 0) + 1;
    if (o.shopperId) perShopper.set(o.shopperId, (perShopper.get(o.shopperId) ?? 0) + 1);
  }
  // cliente novo = primeiro pedido da vida dentro da janela
  let newCustomers = 0;
  const ids = [...perShopper.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const old = await db
      .selectDistinct({ id: schema.orders.shopperId })
      .from(schema.orders)
      .where(and(notCancelled(t.id), lt(schema.orders.createdAt, from), inArray(schema.orders.shopperId, chunk)));
    newCustomers += chunk.length - old.length;
  }
  const totalItems = items.reduce((a, x) => a + Number(x.qty), 0);
  const top = items
    .filter((x) => x.productId)
    .sort((a, b) => Number(b.qty) - Number(a.qty))
    .slice(0, 5)
    .map((x) => ({ id: x.productId!, name: x.name, qty: Number(x.qty) }));
  return {
    days: Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY)),
    orders: orders.length,
    revenue: orders.reduce((a, o) => a + o.total, 0),
    itemsPerOrder: orders.length ? totalItems / orders.length : 0,
    customers: perShopper.size,
    newCustomers,
    repeatCustomers: [...perShopper.values()].filter((n) => n >= 2).length,
    bySlot,
    bySource,
    topProducts: top,
    optInCustomers: Number(optIn[0]?.n ?? 0),
  };
}

function periodOf(m: StoreMetrics, weak: { dow: number; hour: number }[]): Period {
  const weakOrders = weak.reduce((a, s) => a + (m.bySlot[s.dow * 24 + s.hour] ?? 0), 0);
  return { orders: m.orders, revenue: m.revenue, ticket: m.orders ? Math.round(m.revenue / m.orders) : 0, repeatRate: m.customers ? m.repeatCustomers / m.customers : 0, newCustomers: m.newCustomers, weakOrders };
}

// ---------------------------------------------------------------- simulação (prévia) e pedido
export type SimInput = { objectives: Objective[]; total: number; months: number; report: SelfReport };

export function parseSimInput(f: FormData | Record<string, unknown>): SimInput {
  const g = (k: string) => (f instanceof FormData ? f.get(k) : (f as Record<string, unknown>)[k]);
  const n = (k: string) => {
    const v = g(k);
    if (v === null || v === undefined || v === "") return null;
    const x = Number(String(v).replace(",", "."));
    return Number.isFinite(x) && x >= 0 ? x : null;
  };
  const months = Number(g("months"));
  return {
    objectives: parseObjectives(f instanceof FormData ? f.getAll("objectives").map(String) : g("objectives")),
    total: Math.round(Number(g("total")) || 0),
    months: isDuration(months) ? months : 3,
    report: {
      hasInstagram: g("hasInstagram") === "1" || g("hasInstagram") === true,
      followers: n("followers"),
      postsPerWeek: n("postsPerWeek"),
      hasGoogleProfile: g("hasGoogleProfile") === "1" || g("hasGoogleProfile") === true,
      googleRating: (() => {
        const r = n("googleRating");
        return r != null && r <= 5 ? r : null;
      })(),
      googleReviews: n("googleReviews"),
      profitPerOrderPct: (() => {
        const p = n("profitPct");
        return p != null && p > 0 && p <= 100 ? p / 100 : null;
      })(),
    },
  };
}

/** Tudo o que a prévia mostra, recalculado no servidor. */
export async function simulate(t: Tenant, input: SimInput, metrics?: StoreMetrics) {
  const { pricing } = await assertAdvisory(t);
  const now = new Date();
  const m = metrics ?? (await storeMetrics(t, new Date(now.getTime() - 90 * DAY), now));
  const diagnosis = diagnose(m, input.report);
  const split = splitInvestment(snapTotal(input.total || pricing.minimum, pricing), input.months, pricing);
  const objectives: Objective[] = input.objectives.length ? input.objectives : ["revenue"];
  return {
    pricing,
    metrics: m,
    diagnosis,
    split,
    objectives,
    goals: goalsFor(diagnosis, objectives, split, input.report),
    estimate: estimate(diagnosis, objectives, split),
    plan: buildPlan({ objectives, months: input.months, split, diagnosis }),
  };
}

export async function currentPlan(tenantId: string) {
  return (
    (await db.query.advisoryPlans.findFirst({
      where: and(eq(schema.advisoryPlans.tenantId, tenantId), inArray(schema.advisoryPlans.status, ["requested", "active", "paused"])),
      orderBy: desc(schema.advisoryPlans.createdAt),
    })) ?? null
  );
}

/** "Quero contratar": guarda o plano (recalculado aqui), cria/atualiza o lead no CRM e avisa os sócios. */
export async function requestPlan(t: Tenant, input: SimInput, actor: string) {
  if (t.demo) throw new AdvisoryError(L(t)("Las tiendas de demostración no contratan.", "Lojas de demonstração não contratam."));
  const sim = await simulate(t, input);
  const cur = await currentPlan(t.id);
  if (cur && cur.status !== "requested") throw new AdvisoryError(L(t)("Ya tenés una asesoría en curso.", "Você já tem uma assessoria em andamento."));
  const values = {
    tenantId: t.id,
    status: "requested" as const,
    currency: t.currency,
    objectives: JSON.stringify(sim.objectives),
    selfReport: JSON.stringify(input.report),
    monthlyTotal: sim.split.total,
    months: input.months,
    fee: sim.split.fee,
    ads: sim.split.ads,
    diagnosis: JSON.stringify(sim.diagnosis),
    plan: JSON.stringify(sim.plan),
    requestedAt: new Date(),
    updatedAt: new Date(),
  };
  const [plan] = cur
    ? await db.update(schema.advisoryPlans).set(values).where(and(eq(schema.advisoryPlans.id, cur.id), eq(schema.advisoryPlans.tenantId, t.id))).returning()
    : await db.insert(schema.advisoryPlans).values(values).returning();
  const money = (v: number) => formatMoney(v, t.currency as Currency);
  const summary = `Assessoria GoWeb: ${money(sim.split.total)}/mês por ${input.months} meses (assessoria ${money(sim.split.fee)}, anúncios sugeridos ${money(sim.split.ads)}). Objetivos: ${sim.objectives.map((o) => OBJECTIVE_LABELS[o].pt).join(", ")}. Nota do diagnóstico: ${sim.diagnosis.score}/100.`;
  let leadId: string | null = null;
  try {
    const { upsertLead, activity } = await import("@/services/crm");
    const { lead } = await upsertLead({ name: t.name, phone: t.whatsapp ?? t.phone, address: t.address, notes: summary }, "site");
    leadId = lead.id;
    await activity(lead.id, "platform", "system", null, `Pedido de Assessoria GoWeb (loja ${t.slug}). ${summary}`);
  } catch (e) {
    console.error("[assessoria] lead", e instanceof Error ? e.message : e);
  }
  if (leadId) await db.update(schema.advisoryPlans).set({ leadId }).where(eq(schema.advisoryPlans.id, plan.id));
  const { sendPush } = await import("@/services/push");
  await sendPush("all", { title: `Assessoria: ${t.name} quer contratar`, body: `${money(sim.split.total)}/mês · ${input.months} meses`, url: "/admin/assessoria", category: "vendas" }).catch(() => null);
  await audit(t.id, actor, "assessoria.pedido", summary);
  return plan;
}

export async function cancelRequest(t: Tenant, actor: string) {
  const cur = await currentPlan(t.id);
  if (!cur || cur.status !== "requested") return;
  await db.update(schema.advisoryPlans).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(schema.advisoryPlans.id, cur.id), eq(schema.advisoryPlans.tenantId, t.id)));
  await audit(t.id, actor, "assessoria.pedido_cancelado", null);
}

// ---------------------------------------------------------------- admin (sócios)
export async function adminPlans() {
  const rows = await db
    .select({ plan: schema.advisoryPlans, tenant: { id: schema.tenants.id, name: schema.tenants.name, slug: schema.tenants.slug, currency: schema.tenants.currency, whatsapp: schema.tenants.whatsapp } })
    .from(schema.advisoryPlans)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.advisoryPlans.tenantId))
    .where(inArray(schema.advisoryPlans.status, ["requested", "active", "paused", "ended"]))
    .orderBy(desc(schema.advisoryPlans.updatedAt))
    .limit(200);
  return rows;
}

/** Sócio ativa depois de cobrar pelo fluxo atual: grava o "antes", gera o calendário e as tarefas. */
export async function activatePlan(planId: string, by: string) {
  const plan = await db.query.advisoryPlans.findFirst({ where: eq(schema.advisoryPlans.id, planId) });
  if (!plan) throw new AdvisoryError("Plano não encontrado.");
  if (plan.status !== "requested" && plan.status !== "paused") throw new AdvisoryError("Só dá para ativar um pedido ou um plano pausado.");
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, plan.tenantId) });
  if (!t) throw new AdvisoryError("Loja não encontrada.");
  const now = new Date();
  const patch: Partial<AdvisoryPlan> = { status: "active", updatedAt: now };
  if (plan.status === "requested") {
    const m = await storeMetrics(t, new Date(now.getTime() - 90 * DAY), now);
    const d = JSON.parse(plan.diagnosis || "{}") as Partial<Diagnosis>;
    patch.baseline = JSON.stringify({ ...per30(periodOf(m, d.weakSlots ?? []), m.days), days: m.days });
    patch.activatedAt = now;
    patch.activatedBy = by;
    patch.endsAt = new Date(now.getTime() + plan.months * 30 * DAY);
    patch.calendarToken = randomBytes(18).toString("base64url");
  }
  const [next] = await db.update(schema.advisoryPlans).set(patch).where(eq(schema.advisoryPlans.id, plan.id)).returning();
  await extendSchedule(next, t, now);
  await audit(t.id, by, "assessoria.ativar", `${plan.months} meses`);
  await notifyStore(t, L(t)(`¡Tu Asesoría GoWeb empezó! Mirá el plan y el calendario en el panel: ${appUrl()}/painel/${t.slug}/crescer`, `Sua Assessoria GoWeb começou! Veja o plano e o calendário no painel: ${appUrl()}/painel/${t.slug}/crescer`));
}

export async function setPlanStatus(planId: string, status: "paused" | "ended" | "cancelled", by: string) {
  const plan = await db.query.advisoryPlans.findFirst({ where: eq(schema.advisoryPlans.id, planId) });
  if (!plan) throw new AdvisoryError("Plano não encontrado.");
  await db.update(schema.advisoryPlans).set({ status, updatedAt: new Date() }).where(eq(schema.advisoryPlans.id, planId));
  // posts aprovados não publicam com o plano parado
  if (status !== "paused") await db.update(schema.advisoryPosts).set({ status: "skipped", updatedAt: new Date() }).where(and(eq(schema.advisoryPosts.planId, planId), inArray(schema.advisoryPosts.status, ["draft", "approved"]), gte(schema.advisoryPosts.scheduledAt, new Date())));
  await audit(plan.tenantId, by, `assessoria.${status}`, null);
}

// ---------------------------------------------------------------- calendário e tarefas
const parsePlan = (p: AdvisoryPlan) => ({
  objectives: parseObjectives(JSON.parse(p.objectives || "[]")),
  months: JSON.parse(p.plan || "[]") as MonthPlan[],
  diagnosis: JSON.parse(p.diagnosis || "{}") as Diagnosis,
  report: JSON.parse(p.selfReport || "{}") as SelfReport,
});

/** Mês do plano (1…) em que cai uma data. */
const monthOf = (p: AdvisoryPlan, at: Date) => Math.max(1, Math.floor((at.getTime() - (p.activatedAt ?? p.createdAt).getTime()) / (30 * DAY)) + 1);
const weekOf = (p: AdvisoryPlan, at: Date) => Math.max(1, Math.floor((at.getTime() - (p.activatedAt ?? p.createdAt).getTime()) / (7 * DAY)) + 1);

const productImage = async (tenantId: string, ids: string[]) => {
  if (!ids.length) return new Map<string, { name: string; imageUrl: string | null }>();
  const rows = await db.select({ id: schema.products.id, name: schema.products.name, imageUrl: schema.products.imageUrl }).from(schema.products).where(and(eq(schema.products.tenantId, tenantId), inArray(schema.products.id, ids)));
  return new Map(rows.map((r) => [r.id, { name: r.name, imageUrl: r.imageUrl }]));
};

/** Garante posts e tarefas até 3 semanas à frente (roda na ativação e todo dia no cron). */
export async function extendSchedule(plan: AdvisoryPlan, t: Tenant, now = new Date()) {
  if (plan.status !== "active") return { posts: 0, tasks: 0 };
  const cfg = await advisoryConfig();
  const pricing = cfg.pricing[t.currency as "BRL" | "PYG"] ?? DEFAULT_ADVISORY.pricing.BRL!;
  const split = splitInvestment(plan.monthlyTotal, plan.months, pricing);
  const { objectives, months, diagnosis } = parsePlan(plan);
  const tz = getRegion(t.country).timeZone;
  const pt = getRegion(t.country).locale === "pt";
  const horizon = new Date(Math.min(now.getTime() + 21 * DAY, (plan.endsAt ?? new Date(now.getTime() + 21 * DAY)).getTime()));
  const [lastPost] = await db.select({ at: schema.advisoryPosts.scheduledAt }).from(schema.advisoryPosts).where(eq(schema.advisoryPosts.planId, plan.id)).orderBy(desc(schema.advisoryPosts.scheduledAt)).limit(1);
  const from = new Date(Math.max(now.getTime(), (lastPost?.at.getTime() ?? 0) + DAY));
  let posts = 0;
  let tasks = 0;
  const metricsNow = await storeMetrics(t, new Date(now.getTime() - 90 * DAY), now);
  const top = metricsNow.topProducts.map((p) => p.id);
  const products = await productImage(t.id, top);
  const activeTop = top.filter((id) => products.has(id));
  const url = tenantPublicUrl(t);

  if (from < horizon) {
    const weeks = Math.ceil((horizon.getTime() - from.getTime()) / (7 * DAY));
    const slots = contentSlots({ startDate: localDate(from, tz), weeks, perWeek: split.tier.postsPerWeek, peaks: diagnosis.peakSlots ?? [], hasWeak: (diagnosis.weakSlots ?? []).length > 0, products: activeTop });
    const rows = slots
      .map((s) => ({ s, at: zonedToUtc(s.date, s.hour, tz) }))
      .filter((x) => x.at > now && x.at <= horizon)
      .map(({ s, at }) => {
        const prod = s.productId ? products.get(s.productId) : undefined;
        const code = `post-s${weekOf(plan, at)}-${["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(`${s.date}T12:00:00Z`).getUTCDay()]}`;
        return {
          tenantId: t.id,
          planId: plan.id,
          scheduledAt: at,
          theme: s.theme,
          productId: prod ? s.productId : null,
          imageUrl: prod?.imageUrl ?? null,
          caption: fallbackCaption({ theme: s.theme, store: t.name, product: prod?.name, link: `${url}?origem=${code}`, pt }),
          code,
          status: "draft" as const,
        };
      });
    if (rows.length) {
      await db.insert(schema.advisoryPosts).values(rows);
      posts = rows.length;
    }
  }

  // tarefas de ação do mês corrente (uma vez cada) e anúncios da semana
  const month = Math.min(plan.months, monthOf(plan, now));
  const monthActions = (months.find((m) => m.month === month)?.actions ?? []).filter((a) => a !== "posts" && a !== "ads");
  const existing = await db.select({ action: schema.advisoryTasks.action, code: schema.advisoryTasks.code }).from(schema.advisoryTasks).where(eq(schema.advisoryTasks.planId, plan.id));
  const haveAction = new Set(existing.map((e) => e.action).filter(Boolean));
  const haveCode = new Set(existing.map((e) => e.code).filter(Boolean));
  const actionRows = monthActions
    .filter((a) => !haveAction.has(a))
    .map((a) => ({ tenantId: t.id, planId: plan.id, kind: "action" as const, action: a, dueAt: new Date(now.getTime() + 7 * DAY), data: "{}" }));
  const wantsAds = months.find((m) => m.month === month)?.actions.includes("ads") && !split.adsTooSmall && split.tier.adPlans;
  const adRows: (typeof schema.advisoryTasks.$inferInsert)[] = [];
  if (wantsAds) {
    const w0 = weekOf(plan, now);
    const radius = t.deliveryMaxKm ?? 5;
    const ads = adTasks({ weeks: w0 + 2, adsMonthly: split.ads, peaks: diagnosis.peakSlots ?? [], products: activeTop, radiusKm: radius, google: objectives.includes("google") }).filter((a) => a.week >= w0);
    for (const a of ads) {
      if (haveCode.has(a.code)) continue;
      const start = new Date((plan.activatedAt ?? now).getTime() + (a.week - 1) * 7 * DAY);
      const prod = a.productId ? products.get(a.productId) : undefined;
      adRows.push({ tenantId: t.id, planId: plan.id, kind: "ad", action: "ads", dueAt: start < now ? now : start, code: a.code, data: JSON.stringify({ ...a, productName: prod?.name ?? null, imageUrl: prod?.imageUrl ?? null, link: `${url}?origem=${a.code}` }) });
    }
  }
  if (actionRows.length || adRows.length) {
    await db.insert(schema.advisoryTasks).values([...actionRows, ...adRows]);
    tasks = actionRows.length + adRows.length;
  }
  return { posts, tasks };
}

// ---------------------------------------------------------------- lojista: posts
async function ownPost(t: Tenant, postId: string) {
  const p = await db.query.advisoryPosts.findFirst({ where: and(eq(schema.advisoryPosts.id, postId), eq(schema.advisoryPosts.tenantId, t.id)) });
  if (!p) throw new AdvisoryError(L(t)("Post no encontrado.", "Post não encontrado."));
  return p;
}

export async function updatePost(t: Tenant, postId: string, patch: { caption?: string; imageUrl?: string | null; jpegUrl?: string | null; approve?: boolean }, actor: string) {
  const p = await ownPost(t, postId);
  if (p.status === "published" || p.status === "publishing") throw new AdvisoryError(L(t)("Ese post ya se publicó.", "Esse post já foi publicado."));
  const set: Partial<AdvisoryPost> = { updatedAt: new Date() };
  if (patch.caption !== undefined) set.caption = igCaption(patch.caption);
  if (patch.imageUrl !== undefined) {
    set.imageUrl = patch.imageUrl;
    set.jpegUrl = null; // foto trocada: o JPEG antigo não vale mais
  }
  if (patch.jpegUrl !== undefined) set.jpegUrl = patch.jpegUrl;
  if (patch.approve) {
    set.status = "approved";
    set.approvedAt = new Date();
    set.error = null;
  }
  await db.update(schema.advisoryPosts).set(set).where(and(eq(schema.advisoryPosts.id, p.id), eq(schema.advisoryPosts.tenantId, t.id)));
  if (patch.approve) await audit(t.id, actor, "assessoria.post_aprovado", p.id);
}

export async function setPostStatus(t: Tenant, postId: string, status: "done_manual" | "skipped" | "draft") {
  const p = await ownPost(t, postId);
  if (p.status === "published" || p.status === "publishing") throw new AdvisoryError(L(t)("Ese post ya se publicó.", "Esse post já foi publicado."));
  await db.update(schema.advisoryPosts).set({ status, updatedAt: new Date() }).where(and(eq(schema.advisoryPosts.id, p.id), eq(schema.advisoryPosts.tenantId, t.id)));
}

/** Legenda com IA (Gemini da GoWeb), com franquia mensal por loja e o freio geral da proteção da Geovana. */
export async function aiCaption(t: Tenant, postId: string) {
  const p = await ownPost(t, postId);
  const { cfg } = await assertAdvisory(t);
  const channel = `advisory:store:${t.id}`;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.geovanaLog)
    .where(and(eq(schema.geovanaLog.channel, channel), eq(schema.geovanaLog.type, "ai"), gte(schema.geovanaLog.createdAt, monthStart)));
  if (Number(used?.n ?? 0) >= cfg.aiMonthlyPerStore) throw new AdvisoryError(L(t)("Llegaste al límite de textos con IA de este mes. Podés editar el texto a mano.", "Você chegou ao limite de textos com IA deste mês. Dá para editar o texto à mão."));
  const { aiGate, aiMeter } = await import("@/services/wa-guard");
  const gate = await aiGate(channel, null);
  if (gate.mode === "blocked") throw new AdvisoryError(L(t)("La IA está en pausa ahora. Probá más tarde.", "A IA está em pausa agora. Tente mais tarde."));
  const { whatsappPlatform } = await import("@/services/geovana");
  const { openSecret } = await import("@/lib/secrets");
  const { geminiChat } = await import("@/adapters/ai/gemini");
  const plat = await whatsappPlatform();
  const key = (plat.geminiKeySealed && openSecret(plat.geminiKeySealed)) || process.env.GEMINI_API_KEY || "";
  if (!key) throw new AdvisoryError(L(t)("La IA todavía no está configurada.", "A IA ainda não está configurada."));
  const prod = p.productId ? await db.query.products.findFirst({ where: and(eq(schema.products.id, p.productId), eq(schema.products.tenantId, t.id)), columns: { name: true, description: true, pricePyg: true } }) : null;
  const pt = getRegion(t.country).locale === "pt";
  const link = `${tenantPublicUrl(t)}?origem=${p.code}`;
  const system = pt
    ? "Você escreve legendas curtas de Instagram para pequenos restaurantes e lojas de delivery. Tom próximo e animado, sem exagero, sem prometer o que não está nos dados, no máximo 2 emojis, 3 a 6 hashtags locais e relevantes no fim. Termine com o link exatamente como recebido. Responda só com a legenda."
    : "Escribís textos cortos para Instagram de pequeños restaurantes y tiendas de delivery. Tono cercano, sin exagerar, sin prometer nada que no esté en los datos, máximo 2 emojis, 3 a 6 hashtags locales y relevantes al final. Terminá con el link tal cual. Respondé solo con el texto.";
  const facts = [`Loja: ${t.name}`, `Tema: ${THEME_LABELS[p.theme as Theme]?.[pt ? "pt" : "es"] ?? p.theme}`, prod ? `Produto: ${prod.name}${prod.description ? ` — ${prod.description}` : ""} (${formatMoney(prod.pricePyg, t.currency as Currency)})` : "", `Link: ${link}`].filter(Boolean).join("\n");
  const meter = aiMeter(channel, null);
  const text = await geminiChat({ key, model: plat.model, system, history: [{ role: "user", text: facts }], maxTokens: 400, temperature: 0.8, onUsage: meter.onUsage });
  await meter.save();
  const caption = igCaption(String(text ?? "").includes(link) ? String(text) : `${String(text ?? "").trim()}\n\n${link}`);
  await db.update(schema.advisoryPosts).set({ caption, updatedAt: new Date() }).where(and(eq(schema.advisoryPosts.id, p.id), eq(schema.advisoryPosts.tenantId, t.id)));
  return caption;
}

// ---------------------------------------------------------------- lojista: tarefas
export async function completeTask(t: Tenant, taskId: string, o: { spent?: number | null; skip?: boolean }) {
  const task = await db.query.advisoryTasks.findFirst({ where: and(eq(schema.advisoryTasks.id, taskId), eq(schema.advisoryTasks.tenantId, t.id)) });
  if (!task) throw new AdvisoryError(L(t)("Tarea no encontrada.", "Tarefa não encontrada."));
  const spent = o.spent != null && Number.isFinite(o.spent) && o.spent >= 0 ? Math.round(o.spent) : null;
  await db
    .update(schema.advisoryTasks)
    .set({ status: o.skip ? "skipped" : "done", spent: task.kind === "ad" ? spent : null, doneAt: new Date() })
    .where(and(eq(schema.advisoryTasks.id, task.id), eq(schema.advisoryTasks.tenantId, t.id)));
}

export async function setAutonomy(t: Tenant, mode: "off" | "approved" | "all", actor: string) {
  const plan = await currentPlan(t.id);
  if (!plan || plan.status !== "active") throw new AdvisoryError(L(t)("La autonomía se activa con el plan en curso.", "A autonomia liga com o plano em andamento."));
  if (mode !== "off") await assertPublishAllowed(t);
  await db.update(schema.advisoryPlans).set({ autonomy: mode, updatedAt: new Date() }).where(and(eq(schema.advisoryPlans.id, plan.id), eq(schema.advisoryPlans.tenantId, t.id)));
  await audit(t.id, actor, "assessoria.autonomia", mode);
}

/** Publicação automática liberada para esta loja? (config do Admin + plano ativo + não demo) */
export async function assertPublishAllowed(t: Tenant) {
  if (t.demo) throw new AdvisoryError(L(t)("Las tiendas de demostración no publican.", "Lojas de demonstração não publicam."));
  const cfg = await advisoryConfig();
  if (!cfg.igPublishEnabled) throw new AdvisoryError(L(t)("La publicación automática todavía espera la aprobación de Meta.", "A publicação automática ainda aguarda a aprovação da Meta."));
  const plan = await currentPlan(t.id);
  if (!plan || plan.status !== "active") throw new AdvisoryError(L(t)("La publicación automática es parte de la Asesoría en curso.", "A publicação automática faz parte da Assessoria em andamento."));
}

/** igMaintenance: conta de loja sem GoInteligence fica ativa só se for usada pela Assessoria com publicação liberada. */
export async function publishKeepsAccount(tenantId: string | null) {
  if (!tenantId) return false;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!t) return false;
  try {
    await assertPublishAllowed(t);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- painel do plano
export async function planView(t: Tenant, plan: AdvisoryPlan) {
  const now = new Date();
  const start = plan.activatedAt ?? now;
  const days = Math.max(1, Math.round((now.getTime() - start.getTime()) / DAY));
  const p = parsePlan(plan);
  const [metricsNow, posts, tasks, campaignRows, account] = await Promise.all([
    storeMetrics(t, start, now),
    db.query.advisoryPosts.findMany({ where: and(eq(schema.advisoryPosts.planId, plan.id), eq(schema.advisoryPosts.tenantId, t.id), gte(schema.advisoryPosts.scheduledAt, new Date(now.getTime() - 7 * DAY))), orderBy: asc(schema.advisoryPosts.scheduledAt), limit: 40 }),
    db.query.advisoryTasks.findMany({ where: and(eq(schema.advisoryTasks.planId, plan.id), eq(schema.advisoryTasks.tenantId, t.id)), orderBy: asc(schema.advisoryTasks.dueAt), limit: 80 }),
    db
      .select({ code: schema.orders.campaign, orders: sql<number>`count(*)::int`, revenue: sql<number>`coalesce(sum(${schema.orders.totalPyg}), 0)::bigint` })
      .from(schema.orders)
      .where(and(notCancelled(t.id), isNotNull(schema.orders.campaign), gte(schema.orders.createdAt, start)))
      .groupBy(schema.orders.campaign),
    db.query.igAccounts.findFirst({ where: eq(schema.igAccounts.tenantId, t.id), columns: { username: true, canPublish: true, status: true } }),
  ]);
  const baseline = plan.baseline ? (JSON.parse(plan.baseline) as Period) : null;
  const current = per30(periodOf(metricsNow, p.diagnosis.weakSlots ?? []), days);
  const byCode = new Map(campaignRows.map((r) => [r.code, { orders: Number(r.orders), revenue: Number(r.revenue) }]));
  const ticket = current.ticket || p.diagnosis.ticket || 0;
  const ads = tasks
    .filter((x) => x.kind === "ad")
    .map((x) => {
      const data = JSON.parse(x.data || "{}") as AdTask & { productName: string | null; link: string; imageUrl: string | null };
      const r = byCode.get(x.code ?? "") ?? { orders: 0, revenue: 0 };
      return { task: x, data, ...r, result: adResult({ spent: x.spent ?? 0, orders: r.orders, revenue: r.revenue, ticket, profitPct: p.report.profitPerOrderPct ?? null }) };
    });
  const postResults = new Map(posts.map((x) => [x.id, byCode.get(x.code) ?? { orders: 0, revenue: 0 }]));
  return {
    plan,
    ...p,
    days,
    month: Math.min(plan.months, monthOf(plan, now)),
    baseline,
    current,
    insights: baseline && days >= 7 ? insights(baseline, current) : [],
    posts,
    postResults,
    actions: tasks.filter((x) => x.kind === "action"),
    ads,
    account: account ?? null,
  };
}

// ---------------------------------------------------------------- agenda
function eventsFor(t: Tenant, plan: AdvisoryPlan, posts: AdvisoryPost[], tasks: (typeof schema.advisoryTasks.$inferSelect)[]): CalEvent[] {
  const T = L(t);
  const panel = `${appUrl()}/painel/${t.slug}/crescer`;
  const ev: CalEvent[] = posts
    .filter((p) => p.status !== "skipped")
    .map((p) => ({ uid: `post-${p.id}`, start: p.scheduledAt, minutes: 15, title: `${T("Post", "Post")}: ${THEME_LABELS[p.theme as Theme]?.[getRegion(t.country).locale] ?? p.theme}`, description: p.caption.slice(0, 500), url: panel }));
  for (const x of tasks.filter((x) => x.status === "todo")) {
    const label = x.kind === "ad" ? T("Crear el anuncio de la semana", "Criar o anúncio da semana") : ACTION_LABELS[x.action as Action]?.[getRegion(t.country).locale] ?? x.action ?? "";
    const start = new Date(x.dueAt);
    start.setUTCHours(13, 0, 0, 0); // 10h em Brasília / Assunção
    ev.push({ uid: `task-${x.id}`, start, minutes: 30, title: `${T("Asesoría", "Assessoria")}: ${label}`, description: T("Detalles y paso a paso en el panel.", "Detalhes e passo a passo no painel."), url: panel });
  }
  return ev;
}

export async function calendarLinks(t: Tenant, plan: AdvisoryPlan, posts: AdvisoryPost[], tasks: (typeof schema.advisoryTasks.$inferSelect)[]) {
  const ics = plan.calendarToken ? `${appUrl()}/api/assessoria/agenda/${plan.calendarToken}` : null;
  return { ics, webcal: ics?.replace(/^https?:/, "webcal:") ?? null, events: eventsFor(t, plan, posts, tasks).map((e) => ({ ...e, gcal: gcalLink(e) })) };
}

/** Feed .ics privado (o token é o segredo). */
export async function calendarFeed(token: string) {
  if (!/^[\w-]{16,64}$/.test(token)) return null;
  const plan = await db.query.advisoryPlans.findFirst({ where: eq(schema.advisoryPlans.calendarToken, token) });
  if (!plan || (plan.status !== "active" && plan.status !== "paused")) return null;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, plan.tenantId) });
  if (!t) return null;
  const since = new Date(Date.now() - 14 * DAY);
  const [posts, tasks] = await Promise.all([
    db.query.advisoryPosts.findMany({ where: and(eq(schema.advisoryPosts.planId, plan.id), eq(schema.advisoryPosts.tenantId, t.id), gte(schema.advisoryPosts.scheduledAt, since)) }),
    db.query.advisoryTasks.findMany({ where: and(eq(schema.advisoryTasks.planId, plan.id), eq(schema.advisoryTasks.tenantId, t.id), gte(schema.advisoryTasks.dueAt, since)) }),
  ]);
  return buildIcs(`${t.name} · ${L(t)("Asesoría GoWeb", "Assessoria GoWeb")}`, eventsFor(t, plan, posts, tasks));
}

// ---------------------------------------------------------------- avisos e cron
async function notifyStore(t: Tenant, text: string) {
  if (t.demo || !t.whatsapp) return;
  const { sendPlatformWhatsApp } = await import("@/services/platform-wa");
  await sendPlatformWhatsApp(t.whatsapp, text, "notice").catch(() => null);
}

/** Cron diário (CRM): estende o calendário, aprova sozinho no modo "todos", encerra planos vencidos e manda o resumo do dia. */
export async function advisoryDaily(now = new Date()) {
  const plans = await db.query.advisoryPlans.findMany({ where: eq(schema.advisoryPlans.status, "active") });
  let digests = 0;
  for (const plan of plans) {
    try {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, plan.tenantId) });
      if (!t) continue;
      if (plan.endsAt && plan.endsAt <= now) {
        await setPlanStatus(plan.id, "ended", "sistema");
        await notifyStore(t, L(t)("Tu Asesoría GoWeb llegó al final del período. Si querés seguir, respondé este mensaje.", "Sua Assessoria GoWeb chegou ao fim do período. Se quiser continuar, responda esta mensagem."));
        continue;
      }
      await extendSchedule(plan, t, now);
      if (plan.autonomy === "all") {
        const drafts = await db.query.advisoryPosts.findMany({ where: and(eq(schema.advisoryPosts.planId, plan.id), eq(schema.advisoryPosts.status, "draft"), lte(schema.advisoryPosts.scheduledAt, new Date(now.getTime() + DAY))) });
        for (const d of drafts) if (autoApproveDue(d.scheduledAt, now.getTime()) && d.jpegUrl && d.caption.trim()) await db.update(schema.advisoryPosts).set({ status: "approved", approvedAt: now, updatedAt: now }).where(eq(schema.advisoryPosts.id, d.id));
      }
      // resumo do dia: uma vez por dia, só se houver algo para hoje
      if (plan.lastDigestAt && now.getTime() - plan.lastDigestAt.getTime() < 20 * 3600_000) continue;
      const tz = getRegion(t.country).timeZone;
      const today = localDate(now, tz);
      const dayEnd = zonedToUtc(today, 23, tz);
      const [posts, tasks] = await Promise.all([
        db.query.advisoryPosts.findMany({ where: and(eq(schema.advisoryPosts.planId, plan.id), inArray(schema.advisoryPosts.status, ["draft", "approved"]), gte(schema.advisoryPosts.scheduledAt, now), lte(schema.advisoryPosts.scheduledAt, dayEnd)) }),
        db.query.advisoryTasks.findMany({ where: and(eq(schema.advisoryTasks.planId, plan.id), eq(schema.advisoryTasks.status, "todo"), lte(schema.advisoryTasks.dueAt, dayEnd)) }),
      ]);
      if (!posts.length && !tasks.length) continue;
      const T = L(t);
      const lines = [T("Asesoría GoWeb — hoy:", "Assessoria GoWeb — hoje:")];
      for (const p of posts) lines.push(`• ${T("Post", "Post")} ${new Intl.DateTimeFormat(getRegion(t.country).intlLocale, { timeZone: tz, timeStyle: "short" }).format(p.scheduledAt)} — ${p.status === "approved" && plan.autonomy !== "off" ? T("se publica solo", "publica sozinho") : T("para aprobar y publicar", "para aprovar e publicar")}`);
      const ads = tasks.filter((x) => x.kind === "ad").length;
      if (ads) lines.push(`• ${T("Anuncio para crear", "Anúncio para criar")} (${ads})`);
      const acts = tasks.filter((x) => x.kind === "action").length;
      if (acts) lines.push(`• ${T("Acciones del plan pendientes", "Ações do plano pendentes")}: ${acts}`);
      lines.push(`${appUrl()}/painel/${t.slug}/crescer`);
      await notifyStore(t, lines.join("\n"));
      await db.update(schema.advisoryPlans).set({ lastDigestAt: now }).where(eq(schema.advisoryPlans.id, plan.id));
      digests++;
    } catch (e) {
      console.error("[assessoria] diário", plan.id, e instanceof Error ? e.message : e);
    }
  }
  return { plans: plans.length, digests };
}

/** URL que a Meta consegue buscar: JPEG no Blob privado → link temporário assinado; Blob público → URL direta. */
async function fetchableImage(jpegUrl: string) {
  if (/^https:\/\//.test(jpegUrl)) return jpegUrl;
  const m = /^\/uploads\/(.+\.jpe?g)$/i.exec(jpegUrl);
  if (!m) return null;
  const { signedVideoUrl } = await import("@/adapters/storage");
  return signedVideoUrl(m[1]); // link de leitura assinado (1 h) — serve para qualquer arquivo do Blob
}

/** A cada minuto (disparador externo de /api/cron/wa-queue): publica os posts aprovados que chegaram na hora. */
export async function publishDuePosts(now = new Date(), limit = 5) {
  const cfg = await advisoryConfig();
  if (!cfg.igPublishEnabled || isSandbox()) return { published: 0, failed: 0 };
  const due = await db
    .select({ post: schema.advisoryPosts, plan: schema.advisoryPlans })
    .from(schema.advisoryPosts)
    .innerJoin(schema.advisoryPlans, eq(schema.advisoryPlans.id, schema.advisoryPosts.planId))
    .where(and(eq(schema.advisoryPosts.status, "approved"), lte(schema.advisoryPosts.scheduledAt, now), gte(schema.advisoryPosts.scheduledAt, new Date(now.getTime() - 6 * 3600_000)), eq(schema.advisoryPlans.status, "active"), ne(schema.advisoryPlans.autonomy, "off")))
    .orderBy(asc(schema.advisoryPosts.scheduledAt))
    .limit(limit);
  let published = 0;
  let failed = 0;
  const { igPublishImage } = await import("@/adapters/instagram/client");
  const { openSecret } = await import("@/lib/secrets");
  for (const { post, plan } of due) {
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, post.tenantId) });
    const acc = await db.query.igAccounts.findFirst({ where: eq(schema.igAccounts.tenantId, post.tenantId) });
    const ok = canAutoPublish({ configOn: cfg.igPublishEnabled, planActive: plan.status === "active", autonomy: plan.autonomy !== "off", status: post.status, scheduledAt: post.scheduledAt, now: now.getTime(), hasImage: !!post.jpegUrl, accountCanPublish: !!acc && acc.canPublish && acc.status === "active", demo: !!t?.demo });
    if (!ok.ok || !t || !acc) continue;
    // trava: só um processo publica cada post
    const [locked] = await db.update(schema.advisoryPosts).set({ status: "publishing", updatedAt: new Date() }).where(and(eq(schema.advisoryPosts.id, post.id), eq(schema.advisoryPosts.status, "approved"))).returning({ id: schema.advisoryPosts.id });
    if (!locked) continue;
    try {
      const url = await fetchableImage(post.jpegUrl!);
      if (!url) throw new Error("imagem sem endereço público");
      const id = await igPublishImage(openSecret(acc.tokenSealed), acc.igUserId, url, igCaption(post.caption), acc.api === "facebook" ? "facebook" : "instagram");
      await db.update(schema.advisoryPosts).set({ status: "published", igMediaId: id, publishedAt: new Date(), error: null, updatedAt: new Date() }).where(eq(schema.advisoryPosts.id, post.id));
      published++;
    } catch (e) {
      // falhou: não tenta de novo sozinho (o lojista vê o erro e decide)
      const msg = e instanceof Error ? e.message.slice(0, 300) : "erro";
      await db.update(schema.advisoryPosts).set({ status: "failed", error: msg, updatedAt: new Date() }).where(eq(schema.advisoryPosts.id, post.id));
      await notifyStore(t, L(t)(`No pudimos publicar el post de hoy en Instagram (${msg}). Revisalo en el panel: ${appUrl()}/painel/${t.slug}/crescer`, `Não conseguimos publicar o post de hoje no Instagram (${msg}). Confira no painel: ${appUrl()}/painel/${t.slug}/crescer`));
      failed++;
    }
  }
  return { published, failed };
}

export const advisoryErrorText = (e: unknown, t: { country: string }) => (e instanceof AdvisoryError ? e.message : L(t)("No se pudo completar.", "Não foi possível concluir."));
