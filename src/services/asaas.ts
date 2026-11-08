import "server-only";
// =============================================================================
// Asaas: conta principal da GoWeb, subcontas white-label dos lojistas e billing híbrido
// (split das vendas abate a mensalidade; no fim do ciclo cobra só o residual).
// Regras puras em core/asaas.ts; chamadas HTTP em adapters/asaas/client.ts.
// =============================================================================
import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { BillingCycle, Customer, Plan, Tenant } from "@/db/schema";
import {
  closeCycle,
  cycleBounds,
  DEFAULT_ASAAS,
  fromReais,
  isValidDoc,
  orderStatusFromEvent,
  parseAsaasConfig,
  pixKeyType,
  splitForSale,
  toReais,
  type AsaasConfig,
  type AsaasEnv,
} from "@/core/asaas";
import { addInterval, chargesDomain, domainPrice, planPrice } from "@/core/billing";
import { formatMoney } from "@/core/money";
import { parsePaymentConfig } from "@/core/tenant-config";
import {
  AsaasError,
  accountDocuments,
  accountStatus,
  balance,
  createPayment,
  createSubaccount,
  createWebhook,
  ensureCustomer,
  myAccount,
  transferPix,
  updateWebhook,
  wallets,
  webhookSpec,
  type AsaasAuth,
  type AsaasPayment,
  type NewSubaccount,
} from "@/adapters/asaas/client";
import { primeAsaas } from "@/adapters/asaas/runtime";
import { openSecret, sealSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";
import { audit } from "@/lib/security";

export { AsaasError };

const fmt = (minor: number) => formatMoney(minor, "BRL");
export const asaasWebhookUrl = () => `${appUrl()}/api/asaas/webhook`;

// ---------------------------------------------------------------- configuração da plataforma
export async function asaasConfig(): Promise<AsaasConfig> {
  const s = await db.query.platformSettings.findFirst({ columns: { asaasConfig: true } });
  const cfg = parseAsaasConfig(s?.asaasConfig);
  primeFrom(cfg);
  return cfg;
}

export function primeFrom(cfg: AsaasConfig) {
  let key = "";
  try {
    key = cfg.apiKeySealed ? openSecret(cfg.apiKeySealed) : "";
  } catch {}
  primeAsaas(key ? { env: cfg.env, apiKey: key, walletId: cfg.walletId } : null);
}

async function saveConfig(patch: Partial<AsaasConfig>) {
  const cur = await asaasConfig();
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", asaasConfig: JSON.stringify(next) })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { asaasConfig: JSON.stringify(next), updatedAt: new Date() } });
  primeFrom(next);
  return next;
}

export async function platformAuth(): Promise<AsaasAuth | null> {
  const cfg = await asaasConfig();
  if (!cfg.apiKeySealed) return null;
  return { env: cfg.env, apiKey: openSecret(cfg.apiKeySealed) };
}

/** Conecta a conta principal: confere a chave, pega o walletId e cria/atualiza o webhook. */
export async function connectPlatform(env: AsaasEnv, apiKey: string, notifyEmail: string) {
  const auth = { env, apiKey: apiKey.trim() };
  const [w, acc] = await Promise.all([wallets(auth), myAccount(auth).catch(() => ({ name: "" }) as { name?: string })]);
  const walletId = w.data?.[0]?.id;
  if (!walletId) throw new AsaasError("A conta não devolveu a carteira (walletId).", 400);
  const cur = await asaasConfig();
  const token = cur.webhookToken || randomBytes(24).toString("base64url");
  const spec = webhookSpec(asaasWebhookUrl(), notifyEmail, token);
  let webhookId = cur.env === env ? cur.webhookId : "";
  try {
    webhookId = webhookId ? (await updateWebhook(auth, webhookId, spec)).id : (await createWebhook(auth, spec)).id;
  } catch (e) {
    // webhook antigo apagado no painel do Asaas: cria outro
    if (webhookId) webhookId = (await createWebhook(auth, spec)).id;
    else throw e;
  }
  return saveConfig({ env, apiKeySealed: sealSecret(auth.apiKey), walletId, accountName: acc?.name ?? "", webhookToken: token, webhookId });
}

export async function savePlatformRules(r: { hybridEnabled: boolean; defaultSplitPct: number; graceDays: number }) {
  return saveConfig({
    hybridEnabled: r.hybridEnabled,
    defaultSplitPct: Math.min(50, Math.max(0, Math.round(r.defaultSplitPct * 100) / 100)),
    graceDays: Math.min(30, Math.max(1, Math.round(r.graceDays))),
  });
}

export async function disconnectPlatform() {
  return saveConfig({ apiKeySealed: "", walletId: "", accountName: "", webhookId: "", hybridEnabled: false });
}

export function checkWebhookToken(header: string | null, expected: string) {
  if (!header || !expected) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- subconta do lojista
export type TenantAsaasInfo = {
  pixKey?: string;
  pixKeyType?: string;
  autoTransfer?: boolean;
  email?: string;
  cpfCnpj?: string;
  createdAt?: string;
  env?: AsaasEnv;
};
export function tenantAsaasInfo(t: Pick<Tenant, "asaasInfo">): TenantAsaasInfo {
  try {
    return t.asaasInfo ? (JSON.parse(t.asaasInfo) as TenantAsaasInfo) : {};
  } catch {
    return {};
  }
}

export async function tenantAuth(t: Tenant): Promise<AsaasAuth | null> {
  if (!t.asaasApiKeySealed) return null;
  const env = tenantAsaasInfo(t).env ?? (await asaasConfig()).env;
  return { env, apiKey: openSecret(t.asaasApiKeySealed) };
}

export type SubaccountForm = Omit<NewSubaccount, "webhooks"> & { pixKey: string };

/** Cria a subconta white-label do lojista (uma vez) e liga Pix/cartão online no site dele. */
export async function createTenantSubaccount(t: Tenant, f: SubaccountForm) {
  if (t.country !== "BR") throw new AsaasError("Disponível só para lojas do Brasil.", 400);
  if (t.asaasWalletId) throw new AsaasError("Esta loja já tem a conta de recebimentos criada.", 400);
  const cfg = await asaasConfig();
  const auth = await platformAuth();
  if (!auth) throw new AsaasError("A GoWeb ainda não ativou os recebimentos. Fale com o suporte.", 400);
  if (!isValidDoc(f.cpfCnpj)) throw new AsaasError("CPF ou CNPJ inválido.", 400);
  const kType = pixKeyType(f.pixKey);
  if (!kType) throw new AsaasError("Chave Pix inválida (CPF, CNPJ, e-mail, celular com +55 ou aleatória).", 400);
  const { pixKey, ...body } = f;
  const acc = await createSubaccount(auth, {
    ...body,
    cpfCnpj: f.cpfCnpj.replace(/\D/g, ""),
    postalCode: f.postalCode.replace(/\D/g, ""),
    mobilePhone: f.mobilePhone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""),
    webhooks: cfg.webhookToken ? [webhookSpec(asaasWebhookUrl(), f.email, cfg.webhookToken)] : undefined,
  });
  const info: TenantAsaasInfo = { pixKey: pixKey.trim(), pixKeyType: kType, autoTransfer: true, email: f.email, cpfCnpj: f.cpfCnpj.replace(/\D/g, ""), createdAt: new Date().toISOString(), env: cfg.env };
  // liga Pix e cartão online pelo Asaas no site da loja (sem mexer nas outras formas)
  const pay = parsePaymentConfig(t.paymentConfig);
  const options = pay.options.filter((o) => !(o.provider === "asaas"));
  for (const m of ["PIX", "CARD"] as const) {
    const i = options.findIndex((o) => o.method === m);
    const opt = { method: m, provider: "asaas", enabled: true, currencies: ["BRL" as const] };
    if (i >= 0) options[i] = opt;
    else options.push(opt);
  }
  const nextPay = { ...pay, options, credentials: { ...pay.credentials, asaas: { enabled: "1" } } };
  await db
    .update(schema.tenants)
    .set({ asaasAccountId: acc.id, asaasWalletId: acc.walletId, asaasApiKeySealed: sealSecret(acc.apiKey), asaasInfo: JSON.stringify(info), paymentConfig: JSON.stringify(nextPay) })
    .where(eq(schema.tenants.id, t.id));
  return acc.id;
}

export async function updateTenantPayout(t: Tenant, pixKey: string, autoTransfer: boolean) {
  const kType = pixKeyType(pixKey);
  if (!kType) throw new AsaasError("Chave Pix inválida.", 400);
  const info = { ...tenantAsaasInfo(t), pixKey: pixKey.trim(), pixKeyType: kType, autoTransfer };
  await db.update(schema.tenants).set({ asaasInfo: JSON.stringify(info) }).where(eq(schema.tenants.id, t.id));
}

/** Liga/desliga Pix e cartão online pelo Asaas no site da loja. */
export async function setTenantAsaasCheckout(t: Tenant, pix: boolean, card: boolean) {
  const pay = parsePaymentConfig(t.paymentConfig);
  const options = pay.options.map((o) => (o.provider === "asaas" ? { ...o, enabled: o.method === "PIX" ? pix : o.method === "CARD" ? card : o.enabled } : o));
  await db.update(schema.tenants).set({ paymentConfig: JSON.stringify({ ...pay, options }) }).where(eq(schema.tenants.id, t.id));
}

/** Saldo, situação cadastral e links de documentos da subconta (melhor esforço). */
export async function subaccountOverview(t: Tenant) {
  const auth = await tenantAuth(t);
  if (!auth) return null;
  const [bal, st, docs] = await Promise.all([balance(auth).catch(() => null), accountStatus(auth).catch(() => null), accountDocuments(auth).catch(() => null)]);
  return {
    balanceMinor: bal ? fromReais(bal.balance) : null,
    status: st?.general ?? null,
    pendingDocs: (docs?.data ?? []).filter((d) => d.status !== "APPROVED" && d.onboardingUrl).map((d) => ({ title: d.title ?? "Documento", url: d.onboardingUrl! })),
  };
}

/** Repassa o saldo disponível da subconta para a chave Pix do lojista. */
export async function transferTenantBalance(t: Tenant) {
  const auth = await tenantAuth(t);
  const info = tenantAsaasInfo(t);
  if (!auth || !info.pixKey || !info.pixKeyType) throw new AsaasError("Cadastre a chave Pix para receber.", 400);
  const bal = fromReais((await balance(auth)).balance);
  if (bal < 100) throw new AsaasError("Sem saldo disponível para transferir agora.", 400);
  const tr = await transferPix(auth, { value: toReais(bal), pixAddressKey: info.pixKey, pixAddressKeyType: info.pixKeyType, description: "Repasse GoWeb" });
  return { amountMinor: bal, id: tr.id };
}

/** Cron: repasse automático diário para quem deixou ligado. */
export async function autoTransfers() {
  const list = await db.query.tenants.findMany({ where: sql`${schema.tenants.asaasApiKeySealed} is not null` });
  let n = 0;
  for (const t of list) {
    if (!tenantAsaasInfo(t).autoTransfer) continue;
    try {
      const r = await transferTenantBalance(t);
      n++;
      await audit(t.id, "asaas", "asaas.transfer.auto", fmt(r.amountMinor));
    } catch {}
  }
  return n;
}

// ---------------------------------------------------------------- billing híbrido: ciclos
type HybridCustomer = Customer & { plan: Plan; tenant: Tenant | null };

export function isHybrid(c: HybridCustomer, cfg: AsaasConfig) {
  return cfg.hybridEnabled && !!cfg.walletId && !!cfg.apiKeySealed && c.country === "BR" && c.plan.interval === "MONTHLY" && !!c.tenant?.asaasWalletId;
}

export async function hybridCustomers(cfg?: AsaasConfig) {
  const conf = cfg ?? (await asaasConfig());
  if (!conf.hybridEnabled) return [] as HybridCustomer[];
  const list = await db.query.customers.findMany({
    where: inArray(schema.customers.status, ["ACTIVE", "PAST_DUE", "SUSPENDED"]),
    with: { plan: true, tenant: true },
  });
  return (list as HybridCustomer[]).filter((c) => isHybrid(c, conf));
}

/** Ciclo aberto que cobre o instante `at` para a loja. */
export function cycleAt(tenantId: string, at = new Date()) {
  return db.query.billingCycles.findFirst({
    where: and(eq(schema.billingCycles.tenantId, tenantId), eq(schema.billingCycles.status, "ACCUMULATING"), lte(schema.billingCycles.startAt, at), gt(schema.billingCycles.endAt, at)),
  });
}

const RESERVE_MS = 2 * 3600e3; // venda não paga reserva o split por 2 h (Pix expira)

/** Split desta venda (centavos) e o ciclo a que pertence. Sem ciclo/regra = 0. */
export async function splitForTenantSale(t: Tenant, saleMinor: number) {
  const cfg = await asaasConfig();
  if (!cfg.hybridEnabled || !cfg.walletId) return { splitMinor: 0, cycleId: null as string | null, walletId: cfg.walletId };
  const cyc = await cycleAt(t.id);
  if (!cyc) return { splitMinor: 0, cycleId: null, walletId: cfg.walletId };
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.orders.platformSplitMinor}), 0)` })
    .from(schema.orders)
    .where(and(eq(schema.orders.billingCycleId, cyc.id), eq(schema.orders.splitStatus, "PENDING"), gte(schema.orders.createdAt, new Date(Date.now() - RESERVE_MS))));
  const pct = t.splitPct ?? cfg.defaultSplitPct;
  const splitMinor = splitForSale({ targetMinor: cyc.targetMinor, amortizedMinor: cyc.amortizedMinor, reservedMinor: Number(r?.s ?? 0), saleMinor, pct });
  return { splitMinor, cycleId: splitMinor > 0 ? cyc.id : null, walletId: cfg.walletId };
}

/** Credenciais do checkout do lojista (chave da subconta + split calculado no servidor). */
export async function asaasCheckoutCredentials(t: Tenant, saleMinor: number) {
  const auth = await tenantAuth(t);
  if (!auth) return { creds: {} as Record<string, string>, split: { splitMinor: 0, cycleId: null as string | null } };
  const split = await splitForTenantSale(t, saleMinor);
  return {
    creds: { apiKey: auth.apiKey, env: auth.env, splitWallet: split.walletId, splitMinor: String(split.splitMinor) },
    split,
  };
}

/** Recalcula o abatido do ciclo com os splits confirmados (só enquanto o ciclo está aberto). */
export async function recomputeCycle(cycleId: string) {
  const [r] = await db
    .select({ s: sql<number>`coalesce(sum(${schema.orders.platformSplitMinor}), 0)` })
    .from(schema.orders)
    .where(and(eq(schema.orders.billingCycleId, cycleId), eq(schema.orders.splitStatus, "CONFIRMED")));
  await db
    .update(schema.billingCycles)
    .set({ amortizedMinor: Number(r?.s ?? 0) })
    .where(and(eq(schema.billingCycles.id, cycleId), eq(schema.billingCycles.status, "ACCUMULATING")));
}

/** Mensalidade do ciclo (centavos) — inclui a renovação anual do domínio quando vence no período. */
async function cycleTarget(c: HybridCustomer, start: Date, end: Date) {
  let target = planPrice(c.plan).BRL;
  const s = await db.query.platformSettings.findFirst();
  if (s && chargesDomain(c.plan, c.wantsDomain) && c.domainPaidUntil && c.domainPaidUntil.getTime() <= end.getTime()) {
    target += domainPrice(s).BRL;
    await db.update(schema.customers).set({ domainPaidUntil: addInterval(c.domainPaidUntil, "YEARLY") }).where(eq(schema.customers.id, c.id));
  }
  void start;
  return target;
}

type Notify = (c: Customer, subject: string, text: string) => Promise<unknown>;

/**
 * Cron diário (antes do ciclo normal): fecha ciclos vencidos, cobra o residual, suspende após a
 * carência e abre o próximo ciclo. Devolve os ids dos clientes híbridos (o ciclo normal os pula).
 */
export async function runHybridBilling(now: Date, deps: { notify: Notify; invoiceUrl: (id: string) => string; companyName: string }) {
  const cfg = await asaasConfig();
  const out = { hybridIds: new Set<string>(), opened: 0, closedBySplit: 0, residuals: 0, cardCharged: 0, suspended: 0 };
  const list = await hybridCustomers(cfg);
  for (const c0 of list) {
    out.hybridIds.add(c0.id);
    const c = c0;
    // 1) fecha ciclos que terminaram
    const ended = await db.query.billingCycles.findMany({
      where: and(eq(schema.billingCycles.customerId, c.id), eq(schema.billingCycles.status, "ACCUMULATING"), lte(schema.billingCycles.endAt, now)),
    });
    for (const cyc of ended) {
      if (cyc.tenantId) await recomputeCycle(cyc.id);
      const fresh = (await db.query.billingCycles.findFirst({ where: eq(schema.billingCycles.id, cyc.id) }))!;
      const r = closeCycle(fresh.targetMinor, fresh.amortizedMinor);
      if (r.status === "PAID_BY_SPLIT") {
        await db.update(schema.billingCycles).set({ status: "PAID_BY_SPLIT", residualMinor: 0 }).where(eq(schema.billingCycles.id, cyc.id));
        out.closedBySplit++;
        await deps.notify(c, `${deps.companyName}: mensalidade quitada`, `Olá ${c.contactName}! Suas vendas online já quitaram a mensalidade de ${fmt(fresh.targetMinor)} deste ciclo. Nada a pagar. 🎉`).catch(() => null);
        continue;
      }
      const [inv] = await db
        .insert(schema.invoices)
        .values({
          customerId: c.id,
          kind: "SUBSCRIPTION",
          description: `Mensalidade — saldo após abatimento pelas vendas (${fmt(fresh.amortizedMinor)} de ${fmt(fresh.targetMinor)} já abatidos)`,
          amountPyg: 0,
          amountUsdMinor: 0,
          amountBrlMinor: r.residualMinor,
          dueAt: fresh.endAt,
          periodStart: fresh.startAt,
          periodEnd: fresh.endAt,
        })
        .returning();
      await db.update(schema.billingCycles).set({ status: "AWAITING_RESIDUAL", residualMinor: r.residualMinor, invoiceId: inv.id }).where(eq(schema.billingCycles.id, cyc.id));
      out.residuals++;
      // cartão salvo + preferência cartão: cobra sozinho; senão manda o link (Pix/boleto/cartão)
      let charged = false;
      if (c.preferredBilling === "CREDIT_CARD" && c.cardTokenSealed) {
        try {
          const auth = (await platformAuth())!;
          const cust = c.asaasCustomerId ?? (c.ruc ? await ensureCustomer(auth, { name: c.businessName, cpfCnpj: c.ruc, email: c.email }) : null);
          if (cust) {
            const p = await createPayment(auth, {
              customer: cust,
              billingType: "CREDIT_CARD",
              value: toReais(r.residualMinor),
              dueDate: now.toISOString().slice(0, 10),
              description: inv.description.slice(0, 500),
              externalReference: `inv:${inv.id}`,
              creditCardToken: openSecret(c.cardTokenSealed),
            });
            await db.update(schema.billingCycles).set({ residualPaymentId: p.id }).where(eq(schema.billingCycles.id, cyc.id));
            await db.update(schema.invoices).set({ provider: "asaas", providerRef: p.id }).where(eq(schema.invoices.id, inv.id));
            charged = true;
            out.cardCharged++;
          }
        } catch (e) {
          console.error("[asaas] cobrança no cartão falhou", c.id, e instanceof Error ? e.message : e);
        }
      }
      await deps
        .notify(
          c,
          `${deps.companyName}: saldo da mensalidade`,
          charged
            ? `Olá ${c.contactName}! Suas vendas abateram ${fmt(fresh.amortizedMinor)} da mensalidade de ${fmt(fresh.targetMinor)}. O saldo de ${fmt(r.residualMinor)} foi cobrado no cartão ${c.cardLabel ?? "salvo"}. Detalhes: ${deps.invoiceUrl(inv.id)}`
            : `Olá ${c.contactName}! Suas vendas abateram ${fmt(fresh.amortizedMinor)} da mensalidade de ${fmt(fresh.targetMinor)}. Falta pagar só ${fmt(r.residualMinor)} até ${new Date(fresh.graceEndAt).toLocaleDateString("pt-BR")}: ${deps.invoiceUrl(inv.id)}`,
        )
        .catch(() => null);
    }

    // 2) carência vencida sem pagar o residual → suspende
    const late = await db.query.billingCycles.findMany({
      where: and(eq(schema.billingCycles.customerId, c.id), eq(schema.billingCycles.status, "AWAITING_RESIDUAL"), lte(schema.billingCycles.graceEndAt, now)),
    });
    for (const cyc of late) {
      const inv = cyc.invoiceId ? await db.query.invoices.findFirst({ where: eq(schema.invoices.id, cyc.invoiceId) }) : null;
      if (inv?.status === "PAID") continue;
      await db.update(schema.billingCycles).set({ status: "OVERDUE_SUSPENDED" }).where(eq(schema.billingCycles.id, cyc.id));
      if (c.status !== "SUSPENDED") {
        await db.update(schema.customers).set({ status: "SUSPENDED" }).where(eq(schema.customers.id, c.id));
        if (c.tenantId) await db.update(schema.tenants).set({ suspended: true }).where(eq(schema.tenants.id, c.tenantId));
        c.status = "SUSPENDED";
        out.suspended++;
        await deps
          .notify(c, `${deps.companyName}: serviço suspenso`, `Olá ${c.contactName}, o site de ${c.businessName} foi suspenso porque o saldo da mensalidade não foi pago em ${cfg.graceDays} dias. Ao pagar ele volta na hora: ${inv ? deps.invoiceUrl(inv.id) : ""}`)
          .catch(() => null);
      }
    }
    // em carência (ainda não suspenso): marca "em atraso"
    const waiting = await db.query.billingCycles.findFirst({
      where: and(eq(schema.billingCycles.customerId, c.id), eq(schema.billingCycles.status, "AWAITING_RESIDUAL"), lte(schema.billingCycles.endAt, now)),
    });
    if (waiting && !waiting.residualPaymentId && c.status === "ACTIVE") {
      await db.update(schema.customers).set({ status: "PAST_DUE" }).where(eq(schema.customers.id, c.id));
      c.status = "PAST_DUE";
    }

    // 3) abre o(s) próximo(s) ciclo(s): começa onde o anterior terminou (1º = entrega)
    out.opened += await openCycles(c, cfg, now);
  }
  return out;
}

async function openCycles(c: HybridCustomer, cfg: AsaasConfig, now: Date) {
  let n = 0;
  while (n < 3) {
    const fresh = (await db.query.customers.findFirst({ where: eq(schema.customers.id, c.id) }))!;
    const start = fresh.nextBillingAt;
    if (!start || start.getTime() > now.getTime()) break;
    const b = cycleBounds(start, cfg.graceDays);
    const target = await cycleTarget({ ...c, ...fresh }, b.startAt, b.endAt);
    await db.insert(schema.billingCycles).values({ customerId: c.id, tenantId: c.tenantId, ...b, targetMinor: target });
    await db.update(schema.customers).set({ nextBillingAt: b.endAt }).where(eq(schema.customers.id, c.id));
    n++;
  }
  return n;
}

/** Abre o ciclo na hora (entrega do site / subconta criada), sem esperar o cron. */
export async function ensureHybridCycle(customerId: string, now = new Date()) {
  const cfg = await asaasConfig();
  const c = (await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId), with: { plan: true, tenant: true } })) as HybridCustomer | undefined;
  if (!c || !isHybrid(c, cfg) || !["ACTIVE", "PAST_DUE"].includes(c.status)) return 0;
  return openCycles(c, cfg, now);
}

/** Chamado por markInvoicePaid: fatura do residual paga → ciclo quitado. */
export async function onHybridInvoicePaid(invoiceId: string) {
  await db
    .update(schema.billingCycles)
    .set({ status: "PAID_RESIDUAL" })
    .where(and(eq(schema.billingCycles.invoiceId, invoiceId), inArray(schema.billingCycles.status, ["AWAITING_RESIDUAL", "OVERDUE_SUSPENDED"])));
}

/** Ids das faturas de residual (o ciclo normal não aplica a carência dele a elas). */
export async function hybridInvoiceIds(ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db.query.billingCycles.findMany({ where: inArray(schema.billingCycles.invoiceId, ids), columns: { invoiceId: true } });
  return new Set(rows.map((r) => r.invoiceId!));
}

/** Resumo do ciclo atual para o painel do lojista e o admin. */
export async function cycleSummary(customerId: string) {
  const list = await db.query.billingCycles.findMany({ where: eq(schema.billingCycles.customerId, customerId), orderBy: desc(schema.billingCycles.startAt), limit: 6 });
  const current = list.find((c) => c.status === "ACCUMULATING") ?? null;
  return { current, history: list };
}

// ---------------------------------------------------------------- webhook
type AsaasEvent = { id?: string; event?: string; payment?: AsaasPayment };

/**
 * Evento do Asaas (conta principal ou subcontas). externalReference:
 *   ord:<pedido> → pagamento do pedido do lojista (+ split)   inv:<fatura> → cobrança da plataforma
 */
export async function handleAsaasEvent(body: AsaasEvent, deps: { markInvoicePaid: (id: string, info: { provider: string; providerRef?: string; currency?: "BRL"; amountMinor?: number }) => Promise<unknown>; setPaymentStatus: (tenantId: string, orderId: string, status: "PAID" | "REFUNDED" | "FAILED", ref?: string) => Promise<unknown> }) {
  const ev = body.event ?? "";
  const p = body.payment;
  if (!p?.id || !ev) return "ignored";
  // idempotência por evento
  if (body.id) {
    const ins = await db.insert(schema.asaasEvents).values({ id: body.id.slice(0, 200), event: ev }).onConflictDoNothing().returning({ id: schema.asaasEvents.id });
    if (!ins.length) return "duplicate";
  }
  const ref = p.externalReference ?? "";
  const status = orderStatusFromEvent(ev);

  if (ref.startsWith("inv:")) {
    const invoiceId = ref.slice(4);
    const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
    if (!inv) return "unknown-invoice";
    if (status === "PAID") {
      const paid = fromReais(p.value);
      if (paid < inv.amountBrlMinor) {
        await audit(null, "gateway:asaas", "invoice.amount_mismatch", `${invoiceId} pago ${paid} < ${inv.amountBrlMinor}`);
        return "amount-mismatch";
      }
      // cartão usado: guarda o token para cobrar o residual sozinho nos próximos ciclos
      const tok = p.creditCard?.creditCardToken;
      if (tok) {
        await db
          .update(schema.customers)
          .set({ cardTokenSealed: sealSecret(tok), cardLabel: `${p.creditCard?.creditCardBrand ?? "Cartão"} •••• ${p.creditCard?.creditCardNumber ?? ""}`.trim() })
          .where(eq(schema.customers.id, inv.customerId));
      }
      await deps.markInvoicePaid(invoiceId, { provider: "asaas", providerRef: p.id, currency: "BRL", amountMinor: paid });
      return "invoice-paid";
    }
    if (ev === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED") await audit(null, "gateway:asaas", "invoice.card_refused", invoiceId);
    return "invoice-ignored";
  }

  if (ref.startsWith("ord:")) {
    const orderId = ref.slice(4);
    const o = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
    if (!o || o.paymentProvider !== "asaas") return "unknown-order";
    if (o.paymentRef && o.paymentRef !== p.id) return "ref-mismatch";
    if (!status) return "order-ignored";
    if (status === "PAID") {
      if (fromReais(p.value) < o.payAmountMinor) {
        await audit(o.tenantId, "gateway:asaas", "order.amount_mismatch", `#${o.number}`);
        return "amount-mismatch";
      }
      if (o.paymentStatus !== "PAID") await deps.setPaymentStatus(o.tenantId, o.id, "PAID", p.id);
      if (o.billingCycleId && o.splitStatus === "PENDING") {
        await db.update(schema.orders).set({ splitStatus: "CONFIRMED" }).where(eq(schema.orders.id, o.id));
        await recomputeCycle(o.billingCycleId);
      }
      return "order-paid";
    }
    if (status === "REFUNDED") {
      await deps.setPaymentStatus(o.tenantId, o.id, "REFUNDED", p.id);
      if (o.billingCycleId && o.splitStatus) {
        await db.update(schema.orders).set({ splitStatus: "REFUNDED" }).where(eq(schema.orders.id, o.id));
        await recomputeCycle(o.billingCycleId);
      }
      return "order-refunded";
    }
    if (status === "FAILED" && o.paymentStatus !== "PAID") {
      await deps.setPaymentStatus(o.tenantId, o.id, "FAILED", p.id);
      if (o.splitStatus === "PENDING") await db.update(schema.orders).set({ splitStatus: "CANCELLED" }).where(eq(schema.orders.id, o.id));
      return "order-failed";
    }
    return "order-ignored";
  }
  return "ignored";
}

export type { BillingCycle };
export { DEFAULT_ASAAS };
