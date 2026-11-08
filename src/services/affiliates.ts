import "server-only";
// Programa de afiliados (só Brasil). Regras puras em core/affiliates.ts.
// Fluxo: cadastro → fila da live de boas-vindas (PENDING) → admin libera (ACTIVE) → link /a/CODE
//   → clique (cookie 60 dias) → indicação/agenda → contratação (atribuída) → implantação paga
//   → comissão gerada na hora (markInvoicePaid) → admin paga via Pix e marca como paga.
import { createHmac } from "node:crypto";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  BADGES,
  LEAD_LABELS,
  commission,
  isValidCpf,
  missions,
  normalizeAffCode,
  normalizePixKey,
  onlyDigits,
  parseAffiliateConfig,
  pctLabel,
  shortName,
  tierFor,
  xp,
  type LeadStatus,
  type PixKeyType,
  type Stats,
} from "@/core/affiliates";
import { setupAmounts } from "@/core/billing";
import { formatMinor } from "@/core/money";
import { isValidE164, isValidName } from "@/core/region";
import { sendEmail, sendWhatsApp } from "@/adapters/notify";
import { hashPassword } from "@/lib/password";
import { sealSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";
import { onAffiliateLead } from "./crm";

export class AffiliateError extends Error {}

const brl = (m: number) => formatMinor(m, "BRL");
const DAY = 86400000;

export async function affiliateConfig() {
  const s = await db.query.platformSettings.findFirst();
  return parseAffiliateConfig(s?.affiliateConfig);
}

export function cpfHash(cpf: string) {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me-please";
  return createHmac("sha256", secret).update(`cpf:${onlyDigits(cpf)}`).digest("hex");
}

export const affiliateLink = (code: string) => `${appUrl()}/a/${code}`;
export const recruitLink = (code: string) => `${appUrl()}/afiliados/cadastro?indicacao=${code}`;

// ---------------------------------------------------------------- cadastro
export type SignupInput = {
  name: string;
  email: string;
  whatsapp: string;
  cpf: string;
  city?: string | null;
  password: string;
  pixKeyType: PixKeyType;
  pixKey: string;
  code?: string | null;
  recruiterCode?: string | null;
  acceptedTerms: boolean;
};

async function uniqueCode(wanted: string) {
  const base = normalizeAffCode(wanted).slice(0, 12) || "GOWEB";
  let code = base.length >= 3 ? base : `${base}GW`;
  for (let i = 2; await db.query.affiliates.findFirst({ where: eq(schema.affiliates.code, code), columns: { id: true } }); i++) code = `${base}${i}`;
  return code;
}

/** Próxima turma da live de boas-vindas (a mais próxima no futuro). */
export async function nextCohort() {
  return db.query.affiliateCohorts.findFirst({ where: gte(schema.affiliateCohorts.startsAt, new Date(Date.now() - 3 * 3600_000)), orderBy: schema.affiliateCohorts.startsAt });
}

export async function signupAffiliate(i: SignupInput) {
  const name = i.name.trim().replace(/\s+/g, " ");
  if (!isValidName(name) || name.split(" ").length < 2) throw new AffiliateError("Informe o seu nome completo (só letras).");
  const email = i.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AffiliateError("E-mail inválido.");
  if (!isValidE164(i.whatsapp) || !i.whatsapp.startsWith("+55")) throw new AffiliateError("WhatsApp inválido (precisa ser um número do Brasil com DDD).");
  if (!isValidCpf(i.cpf)) throw new AffiliateError("CPF inválido.");
  if (i.password.length < 8) throw new AffiliateError("A senha precisa ter pelo menos 8 caracteres.");
  const pix = normalizePixKey(i.pixKeyType, i.pixKey);
  if (!pix) throw new AffiliateError("Chave Pix inválida para o tipo escolhido.");
  if (!i.acceptedTerms) throw new AffiliateError("É preciso aceitar os termos do programa.");

  const hash = cpfHash(i.cpf);
  if (await db.query.affiliates.findFirst({ where: eq(schema.affiliates.cpfHash, hash), columns: { id: true } })) throw new AffiliateError("Este CPF já tem cadastro. Entre com o seu e-mail e senha.");
  if (await db.query.affiliates.findFirst({ where: eq(schema.affiliates.email, email), columns: { id: true } })) throw new AffiliateError("Este e-mail já tem cadastro. Entre com a sua senha.");

  let referredById: string | null = null;
  const rc = normalizeAffCode(i.recruiterCode ?? "");
  if (rc) {
    const r = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.code, rc) });
    if (r && r.status === "ACTIVE") referredById = r.id;
  }
  const cohort = await nextCohort();
  const [a] = await db
    .insert(schema.affiliates)
    .values({
      code: await uniqueCode(i.code || name.split(" ")[0]),
      name,
      email,
      whatsapp: i.whatsapp,
      cpfHash: hash,
      cpfSealed: sealSecret(onlyDigits(i.cpf)),
      city: i.city?.trim() || null,
      passwordHash: hashPassword(i.password),
      pixKeyType: i.pixKeyType,
      pixKey: pix,
      referredById,
      cohortId: cohort?.id ?? null,
      acceptedTermsAt: new Date(),
    })
    .returning();

  const when = cohort ? `\n\nSua live de boas-vindas: ${fmtDateTime(cohort.startsAt)}. O link aparece no seu portal: ${appUrl()}/afiliados` : `\n\nAssim que a próxima live de boas-vindas for marcada, avisamos você. Acompanhe pelo portal: ${appUrl()}/afiliados`;
  await notifyAffiliate(a, "GoWeb Afiliados: cadastro recebido", `Olá ${name.split(" ")[0]}! Recebemos o seu cadastro no programa de afiliados GoWeb.${when}\n\nDepois da live o seu link é liberado e você já pode começar a indicar.`);
  return a;
}

export async function notifyAffiliate(a: { email: string; whatsapp: string }, subject: string, text: string) {
  await sendEmail(a.email, subject, text).catch(() => null);
  await sendWhatsApp(a.whatsapp, `*${subject}*\n\n${text}`).catch(() => null);
}

export function fmtDateTime(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------- link e cliques
export async function activeAffiliateByCode(code: string) {
  const c = normalizeAffCode(code);
  if (!c) return null;
  const a = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.code, c) });
  return a && a.status === "ACTIVE" ? a : null;
}

/** Registra o clique (1 por visitante por dia). */
export async function recordClick(a: { id: string }, visitorKey: string, source?: string | null) {
  const day = new Date().toISOString().slice(0, 10);
  const visitor = createHmac("sha256", "gw-click").update(`${visitorKey}|${day}`).digest("hex").slice(0, 32);
  const dup = await db.query.affiliateClicks.findFirst({
    where: and(eq(schema.affiliateClicks.affiliateId, a.id), eq(schema.affiliateClicks.visitor, visitor)),
    columns: { id: true },
  });
  if (dup) return false;
  await db.insert(schema.affiliateClicks).values({ affiliateId: a.id, visitor, source: source?.slice(0, 30) || null });
  return true;
}

// ---------------------------------------------------------------- indicações (leads)
export type LeadInput = { businessName: string; contactName: string; whatsapp: string; email?: string | null; city?: string | null; segment?: string | null; note?: string | null; scheduledAt?: Date | null };

function checkLead(i: LeadInput) {
  if (!i.businessName.trim()) throw new AffiliateError("Informe o nome do negócio.");
  if (!isValidName(i.contactName)) throw new AffiliateError("Nome do responsável inválido (só letras).");
  if (!isValidE164(i.whatsapp) || !i.whatsapp.startsWith("+55")) throw new AffiliateError("WhatsApp inválido (número do Brasil com DDD).");
}

export async function createLead(affiliateId: string, i: LeadInput, source: "link" | "manual") {
  checkLead(i);
  // Mesmo WhatsApp já indicado (por qualquer afiliado) e ainda em aberto → não duplica
  const dup = await db.query.affiliateLeads.findFirst({
    where: and(eq(schema.affiliateLeads.whatsapp, i.whatsapp), inArray(schema.affiliateLeads.status, ["NEW", "SCHEDULED", "SIGNED"])),
  });
  if (dup) {
    if (dup.affiliateId === affiliateId) return dup;
    throw new AffiliateError("Este contato já foi indicado por outro afiliado e está em atendimento.");
  }
  const [l] = await db
    .insert(schema.affiliateLeads)
    .values({
      affiliateId,
      businessName: i.businessName.trim().slice(0, 80),
      contactName: i.contactName.trim().slice(0, 60),
      whatsapp: i.whatsapp,
      email: i.email?.trim().toLowerCase() || null,
      city: i.city?.trim().slice(0, 60) || null,
      segment: i.segment?.trim().slice(0, 40) || null,
      note: i.note?.trim().slice(0, 500) || null,
      source,
      status: i.scheduledAt ? "SCHEDULED" : "NEW",
      scheduledAt: i.scheduledAt ?? null,
    })
    .returning();
  // CRM dos sócios: a indicação entra no funil e todos são avisados no app
  const aff = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, affiliateId), columns: { name: true } });
  await onAffiliateLead(l, aff?.name ?? "afiliado");
  return l;
}

/** O afiliado (ou o admin) atualiza a situação da indicação. SIGNED/WON só pelo sistema. */
export async function updateLead(leadId: string, by: { affiliateId?: string; admin?: boolean }, patch: { status?: LeadStatus; scheduledAt?: Date | null; note?: string | null; adminNote?: string | null }) {
  const l = await db.query.affiliateLeads.findFirst({ where: eq(schema.affiliateLeads.id, leadId) });
  if (!l || (by.affiliateId && l.affiliateId !== by.affiliateId)) throw new AffiliateError("Indicação não encontrada.");
  if (l.status === "WON") throw new AffiliateError("Esta indicação já fechou.");
  const allowed: LeadStatus[] = by.admin ? ["NEW", "SCHEDULED", "NOT_SCHEDULED", "LOST"] : ["NEW", "SCHEDULED", "NOT_SCHEDULED", "LOST"];
  const set: Partial<typeof schema.affiliateLeads.$inferInsert> = { updatedAt: new Date() };
  if (patch.status && allowed.includes(patch.status) && l.status !== "SIGNED") set.status = patch.status;
  if (patch.scheduledAt !== undefined) {
    set.scheduledAt = patch.scheduledAt;
    if (patch.scheduledAt && l.status !== "SIGNED" && !patch.status) set.status = "SCHEDULED";
  }
  if (patch.note !== undefined) set.note = patch.note?.slice(0, 500) || null;
  if (by.admin && patch.adminNote !== undefined) set.adminNote = patch.adminNote?.slice(0, 500) || null;
  await db.update(schema.affiliateLeads).set(set).where(eq(schema.affiliateLeads.id, leadId));
}

// ---------------------------------------------------------------- atribuição na contratação
/**
 * Liga o cliente recém-criado ao afiliado. Regras: só Brasil, só afiliado ATIVO, sem autoindicação.
 * Prioridade: código do cookie/link → indicação com o mesmo WhatsApp (dentro da validade).
 */
export async function attributeCustomer(c: typeof schema.customers.$inferSelect, refCode: string | null) {
  if (c.country !== "BR" || c.affiliateId) return null;
  const cfg = await affiliateConfig();
  let aff = refCode ? await activeAffiliateByCode(refCode) : null;
  let lead = c.whatsapp
    ? await db.query.affiliateLeads.findFirst({
        where: and(eq(schema.affiliateLeads.whatsapp, c.whatsapp), inArray(schema.affiliateLeads.status, ["NEW", "SCHEDULED", "NOT_SCHEDULED"]), gte(schema.affiliateLeads.createdAt, new Date(Date.now() - cfg.cookieDays * DAY))),
        orderBy: desc(schema.affiliateLeads.createdAt),
      })
    : undefined;
  if (!aff && lead) {
    const a = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, lead.affiliateId) });
    if (a?.status === "ACTIVE") aff = a;
  }
  if (!aff) return null;
  if (lead && lead.affiliateId !== aff.id) lead = undefined;
  // Autoindicação: o afiliado não ganha comissão contratando para si mesmo
  const self =
    aff.email === c.email.toLowerCase() ||
    (!!c.whatsapp && aff.whatsapp === c.whatsapp) ||
    (!!c.ruc && onlyDigits(c.ruc).length === 11 && cpfHash(c.ruc) === aff.cpfHash);
  if (self) return null;

  if (!lead) {
    [lead] = await db
      .insert(schema.affiliateLeads)
      .values({ affiliateId: aff.id, businessName: c.businessName, contactName: c.contactName, whatsapp: c.whatsapp ?? "", email: c.email, source: "link", status: "SIGNED", customerId: c.id })
      .returning();
  } else {
    await db.update(schema.affiliateLeads).set({ status: "SIGNED", customerId: c.id, updatedAt: new Date() }).where(eq(schema.affiliateLeads.id, lead.id));
  }
  await db.update(schema.customers).set({ affiliateId: aff.id, affiliateLeadId: lead.id }).where(eq(schema.customers.id, c.id));
  await notifyAffiliate(aff, "GoWeb Afiliados: sua indicação contratou!", `${c.businessName} acabou de contratar a GoWeb pelo seu link. Assim que a implantação for paga, a sua comissão aparece no portal.`);
  return aff;
}

/** Admin liga/desliga manualmente o afiliado de um cliente (antes de a implantação ser paga). */
export async function setCustomerAffiliate(customerId: string, code: string | null) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) throw new AffiliateError("Cliente não encontrado.");
  if (c.country !== "BR") throw new AffiliateError("O programa de afiliados vale só para clientes do Brasil.");
  if (!code) {
    await db.update(schema.customers).set({ affiliateId: null, affiliateLeadId: null }).where(eq(schema.customers.id, c.id));
    return null;
  }
  const a = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.code, normalizeAffCode(code)) });
  if (!a || a.status === "SUSPENDED") throw new AffiliateError("Afiliado não encontrado ou suspenso.");
  let leadId = c.affiliateLeadId;
  const lead = leadId ? await db.query.affiliateLeads.findFirst({ where: eq(schema.affiliateLeads.id, leadId) }) : null;
  if (!lead || lead.affiliateId !== a.id) {
    const [l] = await db
      .insert(schema.affiliateLeads)
      .values({ affiliateId: a.id, businessName: c.businessName, contactName: c.contactName, whatsapp: c.whatsapp ?? "", email: c.email, source: "manual", status: c.status === "AWAITING_SETUP_PAYMENT" ? "SIGNED" : "WON", customerId: c.id })
      .returning();
    leadId = l.id;
  }
  await db.update(schema.customers).set({ affiliateId: a.id, affiliateLeadId: leadId }).where(eq(schema.customers.id, c.id));
  return a;
}

// ---------------------------------------------------------------- comissões (chamado por markInvoicePaid)
async function paidSales(affiliateId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.affiliateCommissions)
    .where(and(eq(schema.affiliateCommissions.affiliateId, affiliateId), eq(schema.affiliateCommissions.level, 1), eq(schema.affiliateCommissions.kind, "SETUP"), ne(schema.affiliateCommissions.status, "CANCELLED")));
  return r?.n ?? 0;
}

/**
 * Gera as comissões de uma fatura paga. Idempotente (índice único fatura+afiliado+nível).
 * SETUP: % do nível sobre a implantação (sem domínio) + 3% para quem indicou o afiliado.
 * ANNUAL: +5% sobre a 1ª anuidade paga (plano anual), só para quem vendeu.
 */
export async function onInvoicePaidAffiliate(inv: typeof schema.invoices.$inferSelect) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, inv.customerId), with: { plan: true } });
  if (!c?.affiliateId || c.country !== "BR") return [];
  const aff = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, c.affiliateId) });
  if (!aff || aff.status === "SUSPENDED") return [];
  const cfg = await affiliateConfig();
  const settings = await db.query.platformSettings.findFirst();
  const created: (typeof schema.affiliateCommissions.$inferSelect)[] = [];

  const add = async (v: typeof schema.affiliateCommissions.$inferInsert) => {
    if (v.amountMinor <= 0) return;
    const [row] = await db.insert(schema.affiliateCommissions).values(v).onConflictDoNothing().returning();
    if (row) created.push(row);
  };

  if (inv.kind === "SETUP") {
    const base = Math.min(settings ? setupAmounts(c.plan, false, settings).BRL : c.plan.setupBrlMinor, inv.amountBrlMinor);
    const sales = (await paidSales(aff.id)) + 1; // esta venda já conta para o nível
    const t = tierFor(sales, cfg).tier;
    await add({ affiliateId: aff.id, customerId: c.id, invoiceId: inv.id, level: 1, kind: "SETUP", tierName: t.name, baseMinor: base, pctBp: t.pctBp, amountMinor: commission(base, t.pctBp) });
    if (aff.referredById && cfg.referrerPctBp > 0) {
      const r = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, aff.referredById) });
      if (r?.status === "ACTIVE") await add({ affiliateId: r.id, customerId: c.id, invoiceId: inv.id, level: 2, kind: "SETUP", tierName: null, baseMinor: base, pctBp: cfg.referrerPctBp, amountMinor: commission(base, cfg.referrerPctBp) });
    }
    if (c.affiliateLeadId) await db.update(schema.affiliateLeads).set({ status: "WON", updatedAt: new Date() }).where(eq(schema.affiliateLeads.id, c.affiliateLeadId));
  } else if (c.plan.interval === "YEARLY" && cfg.annualPctBp > 0) {
    const prior = await db.query.affiliateCommissions.findFirst({ where: and(eq(schema.affiliateCommissions.customerId, c.id), eq(schema.affiliateCommissions.kind, "ANNUAL")) });
    if (!prior) {
      const base = Math.min(c.plan.priceBrlMinor, inv.amountBrlMinor);
      await add({ affiliateId: aff.id, customerId: c.id, invoiceId: inv.id, level: 1, kind: "ANNUAL", tierName: null, baseMinor: base, pctBp: cfg.annualPctBp, amountMinor: commission(base, cfg.annualPctBp) });
    }
  }

  for (const k of created) {
    const who = k.affiliateId === aff.id ? aff : await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, k.affiliateId) });
    if (!who) continue;
    const why = k.level === 2 ? `venda de ${shortName(aff.name)}, que você trouxe para o programa` : k.kind === "ANNUAL" ? `1ª anuidade de ${c.businessName}` : `implantação de ${c.businessName}`;
    await notifyAffiliate(who, `GoWeb Afiliados: +${brl(k.amountMinor)} de comissão`, `Parabéns! Você ganhou ${brl(k.amountMinor)} (${pctLabel(k.pctBp)} da ${why}).\n\nO pagamento é feito por Pix na chave cadastrada. Acompanhe no portal: ${appUrl()}/afiliados`);
  }
  return created;
}

export async function markCommissionPaid(id: string, by: string, ref?: string | null) {
  const [k] = await db
    .update(schema.affiliateCommissions)
    .set({ status: "PAID", paidAt: new Date(), paidBy: by.slice(0, 60), paidRef: ref?.slice(0, 80) || null })
    .where(and(eq(schema.affiliateCommissions.id, id), eq(schema.affiliateCommissions.status, "PENDING")))
    .returning();
  if (!k) return null;
  const a = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, k.affiliateId) });
  if (a) await notifyAffiliate(a, "GoWeb Afiliados: comissão paga", `Enviamos ${brl(k.amountMinor)} por Pix para a sua chave (${a.pixKey}). Obrigado pela parceria!`);
  return k;
}

export async function cancelCommission(id: string, reason: string) {
  await db
    .update(schema.affiliateCommissions)
    .set({ status: "CANCELLED", cancelReason: reason.slice(0, 200) || "Cancelada pelo admin" })
    .where(and(eq(schema.affiliateCommissions.id, id), eq(schema.affiliateCommissions.status, "PENDING")));
}

// ---------------------------------------------------------------- painel do afiliado
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Ranking do mês: vendas próprias pagas (implantação); desempate pelo valor ganho. */
export async function monthlyRanking(limit = 10, month = new Date()) {
  const from = startOfMonth(month);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const rows = await db
    .select({
      affiliateId: schema.affiliateCommissions.affiliateId,
      sales: sql<number>`count(*) filter (where ${schema.affiliateCommissions.level} = 1 and ${schema.affiliateCommissions.kind} = 'SETUP')::int`,
      earned: sql<number>`coalesce(sum(${schema.affiliateCommissions.amountMinor}), 0)::int`,
    })
    .from(schema.affiliateCommissions)
    .where(and(ne(schema.affiliateCommissions.status, "CANCELLED"), gte(schema.affiliateCommissions.createdAt, from), sql`${schema.affiliateCommissions.createdAt} < ${to}`))
    .groupBy(schema.affiliateCommissions.affiliateId);
  const ids = rows.map((r) => r.affiliateId);
  const affs = ids.length ? await db.query.affiliates.findMany({ where: inArray(schema.affiliates.id, ids), columns: { id: true, name: true, code: true, city: true } }) : [];
  const byId = new Map(affs.map((a) => [a.id, a]));
  return rows
    .filter((r) => r.sales > 0)
    .sort((a, b) => b.sales - a.sales || b.earned - a.earned)
    .map((r, i) => ({ pos: i + 1, ...r, name: shortName(byId.get(r.affiliateId)?.name ?? "Afiliado"), fullName: byId.get(r.affiliateId)?.name ?? "", code: byId.get(r.affiliateId)?.code ?? "", city: byId.get(r.affiliateId)?.city ?? null }))
    .slice(0, limit);
}

export async function affiliateDashboard(affiliateId: string) {
  const cfg = await affiliateConfig();
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const [[clicks], leads, commissions, recruits, ranking] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        d7: sql<number>`count(*) filter (where ${schema.affiliateClicks.createdAt} >= ${d7})::int`,
        d30: sql<number>`count(*) filter (where ${schema.affiliateClicks.createdAt} >= ${d30})::int`,
      })
      .from(schema.affiliateClicks)
      .where(eq(schema.affiliateClicks.affiliateId, affiliateId)),
    db.query.affiliateLeads.findMany({ where: eq(schema.affiliateLeads.affiliateId, affiliateId), orderBy: desc(schema.affiliateLeads.createdAt), limit: 300 }),
    db.query.affiliateCommissions.findMany({
      where: eq(schema.affiliateCommissions.affiliateId, affiliateId),
      orderBy: desc(schema.affiliateCommissions.createdAt),
      with: { customer: { columns: { businessName: true } } },
      limit: 300,
    }),
    db.query.affiliates.findMany({ where: eq(schema.affiliates.referredById, affiliateId), columns: { id: true, name: true, status: true, createdAt: true } }),
    monthlyRanking(50),
  ]);
  const recruitIds = recruits.map((r) => r.id);
  const recruitSales = recruitIds.length
    ? await db
        .select({ affiliateId: schema.affiliateCommissions.affiliateId, n: sql<number>`count(*)::int` })
        .from(schema.affiliateCommissions)
        .where(and(inArray(schema.affiliateCommissions.affiliateId, recruitIds), eq(schema.affiliateCommissions.level, 1), eq(schema.affiliateCommissions.kind, "SETUP"), ne(schema.affiliateCommissions.status, "CANCELLED")))
        .groupBy(schema.affiliateCommissions.affiliateId)
    : [];

  const valid = commissions.filter((k) => k.status !== "CANCELLED");
  const own = valid.filter((k) => k.level === 1 && k.kind === "SETUP");
  const salesTotal = own.length;
  const som = startOfMonth().getTime();
  const salesMonth = own.filter((k) => k.createdAt.getTime() >= som).length;
  const count = (s: LeadStatus[]) => leads.filter((l) => s.includes(l.status)).length;

  // Sequência de semanas seguidas com venda (contando para trás a partir desta semana)
  let weeksWithSale = 0;
  for (let w = 0; w < 52; w++) {
    const a = now - (w + 1) * 7 * DAY;
    const b = now - w * 7 * DAY;
    if (own.some((k) => k.createdAt.getTime() >= a && k.createdAt.getTime() < b)) weeksWithSale++;
    else if (w > 0) break;
  }
  const stats: Stats = {
    clicks7d: clicks?.d7 ?? 0,
    leads7d: leads.filter((l) => l.createdAt >= d7).length,
    scheduled7d: leads.filter((l) => l.scheduledAt && l.updatedAt >= d7).length,
    salesMonth,
    salesTotal,
    recruits: recruits.filter((r) => r.status === "ACTIVE").length,
    weeksWithSale,
  };
  const myPos = ranking.find((r) => r.affiliateId === affiliateId)?.pos ?? null;
  const scheduledEver = leads.filter((l) => l.scheduledAt).length;

  return {
    cfg,
    tier: tierFor(salesTotal, cfg),
    xp: xp({ sales: salesTotal, scheduled: scheduledEver, leads: leads.length }),
    funnel: {
      clicks: clicks?.total ?? 0,
      clicks30: clicks?.d30 ?? 0,
      leads: leads.length,
      scheduled: count(["SCHEDULED"]),
      notScheduled: count(["NEW", "NOT_SCHEDULED"]),
      signed: count(["SIGNED"]),
      won: count(["WON"]),
      lost: count(["LOST"]),
    },
    money: {
      pending: valid.filter((k) => k.status === "PENDING").reduce((s, k) => s + k.amountMinor, 0),
      paid: valid.filter((k) => k.status === "PAID").reduce((s, k) => s + k.amountMinor, 0),
      month: valid.filter((k) => k.createdAt.getTime() >= som).reduce((s, k) => s + k.amountMinor, 0),
      network: valid.filter((k) => k.level === 2).reduce((s, k) => s + k.amountMinor, 0),
    },
    stats,
    missions: missions(stats),
    badges: BADGES.map((b) => ({ id: b.id, title: b.title, desc: b.desc, done: b.done(stats) })),
    ranking: ranking.slice(0, 10),
    myPos,
    leads,
    commissions,
    recruits: recruits.map((r) => ({ ...r, name: shortName(r.name), sales: recruitSales.find((s) => s.affiliateId === r.id)?.n ?? 0 })),
  };
}

export const leadLabel = (s: LeadStatus) => LEAD_LABELS[s];
