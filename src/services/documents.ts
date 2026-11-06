import "server-only";
// Contratos e notas/recibos dos clientes contratantes (cobrança da plataforma).
import { randomBytes } from "node:crypto";
import { and, desc, eq, lt, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildContract, contractNumber, type ContractData } from "@/core/contract";
import { amountIn, chargesDomain, domainPrice } from "@/core/billing";
import { planFeature, planName } from "@/core/plans";
import { getRegion } from "@/core/region";
import { formatMinor } from "@/core/money";
import type { Currency } from "@/core/types";
import type { Customer, Invoice, Plan } from "@/db/schema";
import { appUrl } from "@/lib/urls";

const key = () => randomBytes(18).toString("base64url");
type Settings = typeof schema.platformSettings.$inferSelect;

/** Moeda em que o cliente vê os valores: Brasil = R$; Paraguai = a preferida (Gs./US$). */
export function customerCurrency(c: Pick<Customer, "country" | "preferredCurrency">): Currency {
  return getRegion(c.country).country === "BR" ? "BRL" : c.preferredCurrency === "USD" ? "USD" : "PYG";
}

function planAmounts(plan: Plan, cur: Currency) {
  const recurring = cur === "BRL" ? plan.priceBrlMinor : cur === "USD" ? plan.priceUsdMinor : plan.pricePyg;
  const setup = cur === "BRL" ? plan.setupBrlMinor : cur === "USD" ? plan.setupUsdMinor : plan.setupPyg;
  return { recurring, setup };
}

/** Resumo de valores e serviços mostrado antes do pagamento. */
export function contractSummary(customer: Customer, plan: Plan, settings: Settings) {
  const locale = getRegion(customer.country).locale;
  const cur = customerCurrency(customer);
  const { recurring, setup } = planAmounts(plan, cur);
  const domain = chargesDomain(plan, customer.wantsDomain) ? domainPrice(settings)[cur] : 0;
  const features = (plan.features ?? "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => planFeature(f, locale));
  return {
    locale,
    currency: cur,
    planName: planName(plan.name, locale),
    interval: plan.interval,
    intelligence: plan.intelligence,
    features,
    setupMinor: setup,
    domainMinor: domain,
    domainIncluded: customer.wantsDomain && plan.includesDomain,
    wantsDomain: customer.wantsDomain,
    domainName: customer.domainName,
    recurringMinor: recurring,
    graceDays: settings.graceDays,
  };
}

function contractData(customer: Customer, plan: Plan, settings: Settings, number: string, acceptedAt: Date, acceptedIp?: string | null): ContractData {
  const s = contractSummary(customer, plan, settings);
  return {
    number,
    locale: s.locale,
    contractor: {
      brand: settings.companyName,
      legalName: settings.legalName,
      doc: settings.legalDoc,
      address: settings.legalAddress,
      city: settings.legalCity,
      email: settings.supportEmail,
      whatsapp: settings.supportWhatsapp,
    },
    client: { businessName: customer.businessName, contactName: customer.contactName, doc: customer.ruc, email: customer.email, whatsapp: customer.whatsapp },
    plan: { name: s.planName, interval: plan.interval, features: s.features, intelligence: plan.intelligence },
    currency: s.currency,
    setupMinor: s.setupMinor,
    domainMinor: s.domainMinor,
    domain: { wanted: customer.wantsDomain, name: customer.domainName, included: s.domainIncluded },
    recurringMinor: s.recurringMinor,
    graceDays: settings.graceDays,
    implementationDays: 10,
    retentionMonths: settings.docsRetentionMonths,
    acceptedAt,
    acceptedIp,
  };
}

/** Texto do contrato para leitura antes do aceite (número provisório). */
export function previewContract(customer: Customer, plan: Plan, settings: Settings) {
  return buildContract(contractData(customer, plan, settings, "(gerado no pagamento)", new Date()));
}

/** Registra o aceite do resumo + contrato (obrigatório antes de pagar a implantação). */
export async function acceptInvoice(invoiceId: string, ip: string | null, ua: string | null) {
  const [r] = await db
    .update(schema.invoices)
    .set({ acceptedAt: new Date(), acceptedIp: ip, acceptedUa: ua?.slice(0, 200) ?? null })
    .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.status, "OPEN")))
    .returning({ id: schema.invoices.id });
  return !!r;
}

async function nextSeq(table: typeof schema.contracts | typeof schema.serviceInvoices) {
  const year = new Date().getFullYear();
  const n = await db.$count(table, sql`extract(year from ${table.createdAt}) = ${year}`);
  return n + 1;
}

/**
 * Chamado quando uma fatura é paga: gera o contrato (na implantação) e o recibo/NFS-e.
 * Nunca derruba a confirmação do pagamento.
 */
export async function onInvoicePaidDocuments(inv: Invoice): Promise<{ contractUrl?: string; receiptUrl?: string }> {
  const out: { contractUrl?: string; receiptUrl?: string } = {};
  try {
    const customer = await db.query.customers.findFirst({ where: eq(schema.customers.id, inv.customerId), with: { plan: true } });
    if (!customer) return out;
    const settings = (await db.query.platformSettings.findFirst())!;
    const locale = getRegion(customer.country).locale;

    if (inv.kind === "SETUP") {
      const exists = await db.query.contracts.findFirst({ where: eq(schema.contracts.invoiceId, inv.id) });
      const ct =
        exists ??
        (
          await db
            .insert(schema.contracts)
            .values({
              customerId: customer.id,
              invoiceId: inv.id,
              number: contractNumber(await nextSeq(schema.contracts)),
              version: "",
              title: "",
              body: "",
              acceptedAt: inv.acceptedAt ?? inv.paidAt ?? new Date(),
              acceptedIp: inv.acceptedIp,
              acceptedUa: inv.acceptedUa,
              accessKey: key(),
            })
            .returning()
        )[0];
      if (!exists) {
        const doc = buildContract(contractData(customer, customer.plan, settings, ct.number, ct.acceptedAt, ct.acceptedIp));
        await db.update(schema.contracts).set({ version: doc.version, title: doc.title, body: doc.body }).where(eq(schema.contracts.id, ct.id));
      }
      out.contractUrl = `${appUrl()}/contrato/${ct.id}?k=${ct.accessKey}`;
    }

    // Recibo (sem PJ) ou NFS-e (quando ativada no admin)
    const already = await db.query.serviceInvoices.findFirst({ where: eq(schema.serviceInvoices.invoiceId, inv.id) });
    const cur = (inv.paidCurrency ?? customerCurrency(customer)) as Currency;
    const amount = inv.paidAmountMinor ?? amountIn(inv, cur);
    const nfse = settings.nfseEnabled && !!settings.legalDoc && !!settings.nfseProvider;
    const si =
      already ??
      (
        await db
          .insert(schema.serviceInvoices)
          .values({
            customerId: customer.id,
            invoiceId: inv.id,
            kind: nfse ? "NFSE" : "RECEIPT",
            status: nfse ? "PENDING" : "ISSUED",
            number: `${nfse ? "NFS" : "REC"}-${new Date().getFullYear()}-${String(await nextSeq(schema.serviceInvoices)).padStart(6, "0")}`,
            description: inv.description,
            currency: cur,
            amountMinor: amount,
            takerName: customer.businessName,
            takerDoc: customer.ruc,
            issuedAt: nfse ? null : new Date(),
            error: nfse ? (locale === "pt" ? "Integração de NFS-e ainda não configurada — emitir manualmente no portal da prefeitura/NFS-e Nacional." : "Integración NFS-e pendiente.") : null,
            accessKey: key(),
          })
          .returning()
      )[0];
    out.receiptUrl = `${appUrl()}/recibo/${si.id}?k=${si.accessKey}`;
  } catch (e) {
    console.error("[documents]", e);
  }
  return out;
}

export function receiptAmount(si: { amountMinor: number; currency: Currency }) {
  return formatMinor(si.amountMinor, si.currency);
}

/** Documentos do cliente contratante (painel "Meu plano"). */
export async function customerDocuments(customerId: string) {
  const [contracts, receipts] = await Promise.all([
    db.query.contracts.findMany({ where: eq(schema.contracts.customerId, customerId), orderBy: desc(schema.contracts.createdAt), columns: { body: false } }),
    db.query.serviceInvoices.findMany({ where: eq(schema.serviceInvoices.customerId, customerId), orderBy: desc(schema.serviceInvoices.createdAt) }),
  ]);
  return { contracts, receipts };
}

/**
 * Retenção: apaga contratos e recibos/notas com mais de N meses (padrão 12).
 * O contrato MAIS RECENTE de cada cliente é sempre mantido, para nenhum cliente ativo ficar sem contrato.
 */
export async function purgeOldDocuments() {
  const settings = await db.query.platformSettings.findFirst();
  const months = Math.max(1, settings?.docsRetentionMonths ?? 12);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const latest = await db
    .select({ id: sql<string>`(array_agg(${schema.contracts.id} order by ${schema.contracts.createdAt} desc))[1]` })
    .from(schema.contracts)
    .groupBy(schema.contracts.customerId);
  const keep = latest.map((r) => r.id).filter(Boolean);
  const delContracts = await db
    .delete(schema.contracts)
    .where(keep.length ? and(lt(schema.contracts.createdAt, cutoff), notInArray(schema.contracts.id, keep)) : lt(schema.contracts.createdAt, cutoff))
    .returning({ id: schema.contracts.id });
  const delReceipts = await db.delete(schema.serviceInvoices).where(lt(schema.serviceInvoices.createdAt, cutoff)).returning({ id: schema.serviceInvoices.id });
  return { months, contracts: delContracts.length, receipts: delReceipts.length };
}

export async function listContracts(limit = 200) {
  return db.query.contracts.findMany({ orderBy: desc(schema.contracts.createdAt), limit, columns: { body: false }, with: { customer: true } });
}
export async function listServiceInvoices(limit = 200) {
  return db.query.serviceInvoices.findMany({ orderBy: desc(schema.serviceInvoices.createdAt), limit, with: { customer: true } });
}
