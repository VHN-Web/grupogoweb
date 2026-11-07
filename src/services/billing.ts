import "server-only";
// Ciclo comercial da plataforma:
//   contratação -> fatura de implantação -> pago -> sistema criado (IMPLEMENTING) + tarefas
//   -> você entrega -> 1ª mensalidade -> ciclo automático -> atraso -> suspensão -> pago -> reativa
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  addDays,
  addInterval,
  amountIn,
  chargesDomain,
  domainPrice,
  dunningState,
  fmtDate,
  isZero,
  planPrice,
  randomPassword,
  setupAmounts,
  shouldInvoice,
  add,
  type Amounts,
} from "@/core/billing";
import { CORE_INFO, MODULE_INFO, customPrice, needsPro, parseModulePrices, sanitizeModules, type ModuleKey } from "@/core/modules";
import { formatMinor } from "@/core/money";
import { slugify } from "@/core/codes";
import { getTheme } from "@/core/themes";
import { CURRENCIES, type Currency } from "@/core/types";
import { getBillingProvider } from "@/adapters/billing/registry";
import { sendEmail, sendWhatsApp } from "@/adapters/notify";
import { provisionTenant, RESERVED_SLUGS } from "./provision";
import { getRegion, tr } from "@/core/region";
import { planName } from "@/core/plans";

const Tc = (c: { country?: string | null }) => tr(getRegion(c.country).locale);
import { hashPassword } from "@/lib/password";
import { onInvoicePaidDocuments } from "./documents";
import { appUrl, tenantPublicUrl } from "@/lib/urls";
import type { Customer, Plan } from "@/db/schema";

export class BillingError extends Error {}

// ---------------------------------------------------------------- settings
export async function getSettings() {
  const s = await db.query.platformSettings.findFirst();
  if (s) return s;
  const [created] = await db.insert(schema.platformSettings).values({ id: "default" }).onConflictDoNothing().returning();
  return created ?? (await db.query.platformSettings.findFirst())!;
}

/**
 * Gateway efetivo por moeda. Regras de segurança/fallback:
 * - Mercado Pago configurado (token na Vercel) substitui o "Simulado" em BRL — dinheiro real vence a demonstração.
 * - Gateway escolhido que não está configurado cai para pagamento manual (transferência).
 */
export function gatewayMap(raw: string): Record<Currency, string> {
  let j: Partial<Record<Currency, string>> = {};
  try {
    j = JSON.parse(raw) ?? {};
  } catch {}
  const out = { PYG: j.PYG ?? "manual", USD: j.USD ?? "manual", BRL: j.BRL ?? "manual" } as Record<Currency, string>;
  const mp = getBillingProvider("mercadopago");
  for (const c of CURRENCIES) {
    if (c === "BRL" && out[c] === "mock" && mp?.isConfigured()) out[c] = "mercadopago";
    const p = getBillingProvider(out[c]);
    if (!p || !p.isConfigured() || !p.currencies.includes(c)) out[c] = "manual";
  }
  return out;
}

export const invoiceUrl = (id: string) => `${appUrl()}/fatura/${id}`;

// ---------------------------------------------------------------- notificações
export async function notifyCustomer(c: Customer, subject: string, text: string) {
  const email = await sendEmail(c.email, subject, text);
  await db.insert(schema.notifications).values({
    customerId: c.id,
    channel: "EMAIL",
    to: c.email,
    subject,
    body: text,
    status: email.status,
    error: email.error ?? null,
  });
  if (c.whatsappOptIn && c.whatsapp) {
    const msg = `*${subject}*\n\n${text}`;
    const wa = await sendWhatsApp(c.whatsapp, msg);
    await db.insert(schema.notifications).values({
      customerId: c.id,
      channel: "WHATSAPP",
      to: c.whatsapp,
      body: msg,
      status: wa.status,
      error: wa.error ?? null,
    });
  }
}

function amountsText(a: Amounts) {
  return CURRENCIES.filter((c) => a[c] > 0)
    .map((c) => formatMinor(a[c], c))
    .join(" · ");
}

// ---------------------------------------------------------------- contratação
export type NewCustomerInput = {
  businessName: string;
  contactName: string;
  email: string;
  whatsapp?: string | null;
  whatsappOptIn: boolean;
  ruc?: string | null;
  desiredSlug?: string | null;
  planId: string;
  preferredCurrency: Currency;
  wantsDomain: boolean;
  domainName?: string | null;
  notes?: string | null;
  theme?: string | null;
  country?: string;
  /** Plano personalizado: módulos escolhidos (o preço é sempre calculado aqui, nunca vem do navegador). */
  modules?: ModuleKey[] | null;
};

/** Cria o plano exclusivo desta contratação (oculto da lista) com o preço = núcleo + módulos. */
async function createCustomPlan(settings: Awaited<ReturnType<typeof getSettings>>, selected: ModuleKey[]) {
  const prices = parseModulePrices(settings.modulePrices);
  if (!prices.enabled) throw new BillingError("Plano personalizado indisponível no momento");
  const mods = sanitizeModules(selected);
  const monthly = customPrice(prices, mods);
  const [plan] = await db
    .insert(schema.plans)
    .values({
      name: "Personalizado",
      interval: "MONTHLY",
      pricePyg: monthly.PYG,
      priceUsdMinor: monthly.USD,
      priceBrlMinor: monthly.BRL,
      setupPyg: prices.setup.PYG,
      setupUsdMinor: prices.setup.USD,
      setupBrlMinor: prices.setup.BRL,
      includesDomain: false,
      intelligence: needsPro(mods),
      modules: JSON.stringify(mods),
      features: [CORE_INFO.pt, ...mods.map((m) => MODULE_INFO[m].pt)].join("\n"),
      isCustom: true,
      active: false, // não aparece na página de vendas nem no admin de planos
      sortOrder: 99,
    })
    .returning();
  return plan;
}

export async function createCustomer(input: NewCustomerInput) {
  const settings = await getSettings();
  const plan = input.modules ? await createCustomPlan(settings, input.modules) : await db.query.plans.findFirst({ where: eq(schema.plans.id, input.planId) });
  if (!plan) throw new BillingError("Plano não encontrado");
  const slug = slugify(input.desiredSlug || input.businessName);
  if (!slug || RESERVED_SLUGS.has(slug)) throw new BillingError("Endereço (slug) inválido");
  if (!input.email.includes("@")) throw new BillingError("E-mail inválido");

  const [customer] = await db
    .insert(schema.customers)
    .values({
      businessName: input.businessName,
      contactName: input.contactName,
      email: input.email.toLowerCase(),
      whatsapp: input.whatsapp || null,
      whatsappOptIn: input.whatsappOptIn && !!input.whatsapp,
      ruc: input.ruc || null,
      desiredSlug: slug,
      planId: plan.id,
      preferredCurrency: input.preferredCurrency,
      theme: getTheme(input.theme).id,
      country: getRegion(input.country).country,
      wantsDomain: input.wantsDomain,
      domainName: input.wantsDomain ? input.domainName || null : null,
      notes: input.notes || null,
    })
    .returning();

  const amounts = setupAmounts(plan, input.wantsDomain, settings);
  const TT = Tc(customer);
  const domainNote = input.wantsDomain
    ? chargesDomain(plan, true)
      ? TT(" + dominio (1er año)", " + domínio (1º ano)")
      : TT(" · dominio incluido gratis", " · domínio incluso grátis")
    : "";
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      customerId: customer.id,
      kind: "SETUP",
      description: `${TT("Implementación — plan", "Implantação — plano")} ${planName(plan.name, getRegion(customer.country).locale)}${domainNote}`,
      amountPyg: amounts.PYG,
      amountUsdMinor: amounts.USD,
      amountBrlMinor: amounts.BRL,
      dueAt: addDays(new Date(), 3),
    })
    .returning();

  if (isZero(amounts)) {
    await markInvoicePaid(inv.id, { provider: "free" });
  } else {
    const T = Tc(customer);
    await notifyCustomer(
      customer,
      `${settings.companyName}: ${T("pago de implementación", "pagamento da implantação")}`,
      T(
        `Hola ${customer.contactName}! Gracias por elegir ${settings.companyName} para ${customer.businessName}.\n\n` +
          `Para comenzar la implementación, realizá el pago (${amountsText(amounts)}) en el siguiente enlace. Podés elegir pagar en guaraníes, dólares o reales:\n${invoiceUrl(inv.id)}\n\n` +
          `Apenas se confirme el pago empezamos a preparar tu sistema.`,
        `Olá ${customer.contactName}! Obrigado por escolher a ${settings.companyName} para ${customer.businessName}.\n\n` +
          `Para começarmos a implantação, faça o pagamento (${amountsText(amounts)}) no link abaixo (Pix, cartão ou boleto em reais, ou em dólares/guaranis):\n${invoiceUrl(inv.id)}\n\n` +
          `Assim que o pagamento for confirmado começamos a preparar o seu sistema.`,
      ),
    );
  }
  return customer;
}

// ---------------------------------------------------------------- checkout
export type CheckoutOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "instructions"; text: string; amount: string };

export async function startCheckout(invoiceId: string, currency: Currency): Promise<CheckoutOutcome> {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId), with: { customer: true } });
  if (!inv) throw new BillingError("Fatura não encontrada");
  const T = Tc(inv.customer);
  if (inv.status !== "OPEN") throw new BillingError(T("Esta factura ya no está pendiente", "Esta fatura não está mais pendente"));
  // Antes de pagar a implantação o cliente precisa ver o resumo e aceitar o contrato
  if (inv.kind === "SETUP" && !inv.acceptedAt) {
    throw new BillingError(T("Antes de pagar, leé el resumen y confirmá que estás de acuerdo.", "Antes de pagar, leia o resumo e confirme que está ciente e de acordo."));
  }
  const amount = amountIn(inv, currency);
  if (amount <= 0) throw new BillingError(T("Moneda no disponible para esta factura", "Moeda indisponível para esta fatura"));

  const settings = await getSettings();
  const providerId = gatewayMap(settings.gatewayByCurrency)[currency];
  const provider = getBillingProvider(providerId);
  if (!provider || !provider.isConfigured() || !provider.currencies.includes(currency)) {
    throw new BillingError(T("Medio de pago no disponible para esta moneda. Elegí otra moneda.", "Forma de pagamento indisponível no momento. Fale com o suporte."));
  }

  await db.update(schema.customers).set({ preferredCurrency: currency }).where(eq(schema.customers.id, inv.customerId));

  const result = await provider.createCheckout({
    invoiceId: inv.id,
    description: inv.description,
    currency,
    amountMinor: amount,
    customer: { name: inv.customer.contactName, email: inv.customer.email, businessName: inv.customer.businessName },
    returnUrl: invoiceUrl(inv.id),
    notificationUrl: `${appUrl()}/api/billing/webhook/${provider.id}`,
  });

  if (result.kind === "instructions") {
    await db.update(schema.invoices).set({ provider: provider.id }).where(eq(schema.invoices.id, inv.id));
    return {
      kind: "instructions",
      text: result.instructions || settings.manualInstructions || T("Contactanos para coordinar el pago.", "Fale conosco para combinar o pagamento."),
      amount: formatMinor(amount, currency),
    };
  }
  await db
    .update(schema.invoices)
    .set({ provider: provider.id, providerRef: result.providerRef ?? null, checkoutUrl: result.checkoutUrl })
    .where(eq(schema.invoices.id, inv.id));
  return { kind: "redirect", url: result.checkoutUrl };
}

// ---------------------------------------------------------------- pagamento confirmado
export async function markInvoicePaid(
  invoiceId: string,
  info: { provider: string; providerRef?: string; currency?: Currency; amountMinor?: number },
) {
  // Idempotente: só a primeira confirmação faz efeito
  const [inv] = await db
    .update(schema.invoices)
    .set({
      status: "PAID",
      paidAt: new Date(),
      provider: info.provider,
      providerRef: info.providerRef ?? null,
      paidCurrency: info.currency ?? null,
      paidAmountMinor: info.amountMinor ?? null,
    })
    .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.status, "OPEN")))
    .returning();
  if (!inv) return null;

  if (inv.kind === "SETUP") await onSetupPaid(inv.customerId);
  else await onSubscriptionPaid(inv.customerId);

  // Contrato (implantação) + recibo/NFS-e, enviados por e-mail ao cliente contratante
  const docs = await onInvoicePaidDocuments(inv);
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, inv.customerId) });
  if (c && (docs.contractUrl || docs.receiptUrl)) {
    const T = Tc(c);
    const settings = await getSettings();
    await notifyCustomer(
      c,
      `${settings.companyName}: ${docs.contractUrl ? T("tu contrato y recibo", "seu contrato e recibo") : T("tu recibo", "seu recibo")}`,
      [
        T(`Hola ${c.contactName}! Confirmamos tu pago (${inv.description}).`, `Olá ${c.contactName}! Confirmamos o seu pagamento (${inv.description}).`),
        docs.contractUrl ? `${T("Contrato (guardá una copia)", "Contrato (guarde uma cópia)")}: ${docs.contractUrl}` : "",
        docs.receiptUrl ? `${T("Recibo", "Recibo")}: ${docs.receiptUrl}` : "",
        docs.contractUrl
          ? T(
              "Recordá: podés arrepentirte en hasta 7 días y no se cobra ninguna mensualidad; el valor de la implementación no es reembolsable (cláusula 4).",
              "Lembrete: você pode se arrepender em até 7 dias e nenhuma mensalidade será cobrada; o valor da implantação não é reembolsável (cláusula 5).",
            )
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).catch(() => null);
  }
  return inv;
}

async function onSetupPaid(customerId: string) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId), with: { plan: true } });
  if (!c || c.status !== "AWAITING_SETUP_PAYMENT") return;
  const settings = await getSettings();

  // Cria o sistema do cliente (fechado ao público até você entregar)
  let tenantId = c.tenantId;
  if (!tenantId) {
    let slug = c.desiredSlug;
    for (let i = 2; await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true } }); i++) {
      slug = `${c.desiredSlug}-${i}`;
    }
    const tenant = await provisionTenant(db, { name: c.businessName, slug, password: randomPassword(16), tables: 10, theme: c.theme, country: c.country });
    const plan = await db.query.plans.findFirst({ where: eq(schema.plans.id, c.planId) });
    await db
      .update(schema.tenants)
      .set({ ruc: c.ruc, phone: c.whatsapp, whatsapp: c.whatsapp, tier: plan?.intelligence ? "pro" : "basic", modules: plan?.modules ?? null })
      .where(eq(schema.tenants.id, tenant.id));
    tenantId = tenant.id;
  }

  await db
    .update(schema.customers)
    .set({
      status: "IMPLEMENTING",
      tenantId,
      domainPaidUntil: c.wantsDomain ? addInterval(new Date(), "YEARLY") : null,
    })
    .where(eq(schema.customers.id, c.id));

  const tasks: { kind: string; title: string; details?: string }[] = [
    { kind: "IMPLEMENTATION", title: "Configurar cardápio, marca, mesas e meios de pagamento", details: "Acesse o painel do cliente pelo link na ficha." },
  ];
  if (c.wantsDomain) {
    tasks.push(
      {
        kind: "DOMAIN_PURCHASE",
        title: `Comprar o domínio ${c.domainName ?? "(a definir com o cliente)"}`,
        details: (c.domainName ?? "").endsWith(".py")
          ? "Domínio .py: registrar no NIC Paraguay (nic.py)."
          : "Comprar na HostGator (ou outro registrador) em nome da sua empresa.",
      },
      {
        kind: "DNS_SETUP",
        title: "Apontar o DNS e ativar o domínio no sistema",
        details: "Criar CNAME (www) apontando para o seu servidor/Vercel e preencher 'Domínio próprio' na ficha do cliente.",
      },
    );
  }
  await db.insert(schema.adminTasks).values(tasks.map((t) => ({ ...t, customerId: c.id })));

  const T = Tc(c);
  await notifyCustomer(
    c,
    `${settings.companyName}: ${T("¡pago recibido!", "pagamento recebido!")}`,
    T(
      `Hola ${c.contactName}, recibimos el pago de la implementación de ${c.businessName}. Ya estamos preparando tu sistema y te avisamos apenas esté listo.`,
      `Olá ${c.contactName}, recebemos o pagamento da implantação de ${c.businessName}. Já estamos preparando o seu sistema e avisamos assim que estiver pronto.`,
    ),
  );
}

async function onSubscriptionPaid(customerId: string) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) return;
  const stillOverdue = await db.query.invoices.findFirst({
    where: and(eq(schema.invoices.customerId, c.id), eq(schema.invoices.status, "OPEN"), lt(schema.invoices.dueAt, new Date())),
  });
  if (!stillOverdue && (c.status === "PAST_DUE" || c.status === "SUSPENDED")) {
    await db.update(schema.customers).set({ status: "ACTIVE" }).where(eq(schema.customers.id, c.id));
    if (c.tenantId) await db.update(schema.tenants).set({ suspended: false }).where(eq(schema.tenants.id, c.tenantId));
  }
  const settings = await getSettings();
  const T = Tc(c);
  await notifyCustomer(
    c,
    `${settings.companyName}: ${T("pago confirmado", "pagamento confirmado")}`,
    T(`¡Gracias ${c.contactName}! Confirmamos el pago de tu suscripción.`, `Obrigado, ${c.contactName}! Confirmamos o pagamento da sua assinatura.`),
  );
}

// ---------------------------------------------------------------- entrega
export async function deliverCustomer(customerId: string) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId), with: { plan: true, tenant: true } });
  if (!c || !c.tenant) throw new BillingError("Cliente sem sistema criado");
  if (c.status !== "IMPLEMENTING") throw new BillingError("O cliente não está em implantação");
  const settings = await getSettings();

  const password = randomPassword(10);
  await db.update(schema.tenants).set({ adminPasswordHash: hashPassword(password) }).where(eq(schema.tenants.id, c.tenant.id));

  const now = new Date();
  const periodEnd = addInterval(now, c.plan.interval);
  // 1ª mensalidade: período começa hoje, com 3 dias para pagar
  const inv = await createSubscriptionInvoice(c, c.plan, now, periodEnd, addDays(now, 3));
  await db
    .update(schema.customers)
    .set({ status: "ACTIVE", deliveredAt: now, nextBillingAt: periodEnd })
    .where(eq(schema.customers.id, c.id));

  const site = tenantPublicUrl(c.tenant);
  const T = Tc(c);
  await notifyCustomer(
    c,
    `${settings.companyName}: ${T("¡tu sistema está listo!", "seu sistema está pronto!")}`,
    T(
      `Hola ${c.contactName}! El sistema de ${c.businessName} está listo.\n\n` +
        `Menú para tus clientes: ${site}\n` +
        `Panel: ${appUrl()}/painel/${c.tenant.slug}\nContraseña: ${password}\n(cambiala en Configuración)\n\n` +
        `Tu primera ${c.plan.interval === "YEARLY" ? "anualidad" : "mensualidad"} (${amountsText(planPrice(c.plan))}) ya está disponible:\n${invoiceUrl(inv.id)}`,
      `Olá ${c.contactName}! O sistema de ${c.businessName} está pronto.\n\n` +
        `Cardápio/loja para seus clientes: ${site}\n` +
        `Painel: ${appUrl()}/painel/${c.tenant.slug}\nSenha: ${password}\n(troque em Configurações)\n\n` +
        `Sua primeira ${c.plan.interval === "YEARLY" ? "anuidade" : "mensalidade"} (${amountsText(planPrice(c.plan))}) já está disponível:\n${invoiceUrl(inv.id)}`,
    ),
  );
  return { password };
}

async function createSubscriptionInvoice(c: Customer, plan: Plan, periodStart: Date, periodEnd: Date, dueAt: Date) {
  const settings = await getSettings();
  let amounts = planPrice(plan);
  let domainLine = "";
  let domainPaidUntil = c.domainPaidUntil;
  // Planos sem domínio incluso: renovação anual do domínio entra na fatura do período em que vence
  if (chargesDomain(plan, c.wantsDomain) && domainPaidUntil && domainPaidUntil.getTime() <= periodEnd.getTime()) {
    amounts = add(amounts, domainPrice(settings));
    domainPaidUntil = addInterval(domainPaidUntil, "YEARLY");
    domainLine = Tc(c)(" + renovación de dominio", " + renovação do domínio");
  }
  const [inv] = await db
    .insert(schema.invoices)
    .values({
      customerId: c.id,
      kind: "SUBSCRIPTION",
      description: `${Tc(c)("Plan", "Plano")} ${planName(plan.name, getRegion(c.country).locale)} — ${fmtDate(periodStart)} ${Tc(c)("a", "a")} ${fmtDate(periodEnd)}${domainLine}`,
      amountPyg: amounts.PYG,
      amountUsdMinor: amounts.USD,
      amountBrlMinor: amounts.BRL,
      dueAt,
      periodStart,
      periodEnd,
    })
    .returning();
  if (domainPaidUntil !== c.domainPaidUntil) {
    await db.update(schema.customers).set({ domainPaidUntil }).where(eq(schema.customers.id, c.id));
  }
  return inv;
}

// ---------------------------------------------------------------- ciclo automático (cron diário)
export async function runBillingCycle(now = new Date()) {
  const settings = await getSettings();
  const out = { invoicesCreated: 0, pastDue: 0, suspended: 0 };

  // 1) Gera faturas X dias antes do vencimento
  const billable = await db.query.customers.findMany({
    where: inArray(schema.customers.status, ["ACTIVE", "PAST_DUE", "SUSPENDED"]),
    with: { plan: true },
  });
  for (const c of billable) {
    let next = c.nextBillingAt;
    let guard = 0;
    while (next && shouldInvoice(next, now, settings.invoiceDaysBefore) && guard++ < 3) {
      const end = addInterval(next, c.plan.interval);
      const fresh = (await db.query.customers.findFirst({ where: eq(schema.customers.id, c.id) }))!;
      const inv = await createSubscriptionInvoice(fresh, c.plan, next, end, next);
      await db.update(schema.customers).set({ nextBillingAt: end }).where(eq(schema.customers.id, c.id));
      out.invoicesCreated++;
      const T = Tc(fresh);
      const val = amountsText({ PYG: inv.amountPyg, USD: inv.amountUsdMinor, BRL: inv.amountBrlMinor });
      await notifyCustomer(
        fresh,
        `${settings.companyName}: ${T("nueva factura", "nova fatura")}`,
        T(
          `Hola ${c.contactName}, tu factura de ${c.businessName} vence el ${fmtDate(next)}.\nValor: ${val}\nPagá aquí (guaraníes, dólares o reales): ${invoiceUrl(inv.id)}`,
          `Olá ${c.contactName}, sua fatura de ${c.businessName} vence em ${fmtDate(next)}.\nValor: ${val}\nPague aqui: ${invoiceUrl(inv.id)}`,
        ),
      );
      next = end;
    }
  }

  // 2) Cobrança de atrasados: atraso -> aviso; passou da tolerância -> suspende
  const openOverdue = await db.query.invoices.findMany({
    where: and(eq(schema.invoices.status, "OPEN"), eq(schema.invoices.kind, "SUBSCRIPTION"), lt(schema.invoices.dueAt, now)),
    orderBy: asc(schema.invoices.dueAt),
  });
  const oldestByCustomer = new Map<string, (typeof openOverdue)[number]>();
  for (const i of openOverdue) if (!oldestByCustomer.has(i.customerId)) oldestByCustomer.set(i.customerId, i);

  for (const [customerId, inv] of oldestByCustomer) {
    const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
    if (!c || c.status === "CANCELLED") continue;
    const state = dunningState(inv.dueAt, now, settings.graceDays);
    if (state === "SUSPEND" && c.status !== "SUSPENDED") {
      await db.update(schema.customers).set({ status: "SUSPENDED" }).where(eq(schema.customers.id, c.id));
      if (c.tenantId) await db.update(schema.tenants).set({ suspended: true }).where(eq(schema.tenants.id, c.tenantId));
      out.suspended++;
      const T = Tc(c);
      await notifyCustomer(
        c,
        `${settings.companyName}: ${T("servicio suspendido", "serviço suspenso")}`,
        T(
          `Hola ${c.contactName}, el menú de ${c.businessName} fue suspendido por falta de pago. Al pagar se reactiva automáticamente: ${invoiceUrl(inv.id)}`,
          `Olá ${c.contactName}, o site de ${c.businessName} foi suspenso por falta de pagamento. Ao pagar ele é reativado automaticamente: ${invoiceUrl(inv.id)}`,
        ),
      );
    } else if (state === "PAST_DUE" && c.status === "ACTIVE") {
      await db.update(schema.customers).set({ status: "PAST_DUE" }).where(eq(schema.customers.id, c.id));
      out.pastDue++;
      const T = Tc(c);
      await notifyCustomer(
        c,
        `${settings.companyName}: ${T("factura vencida", "fatura vencida")}`,
        T(
          `Hola ${c.contactName}, tu factura venció el ${fmtDate(inv.dueAt)}. Para evitar la suspensión del servicio en ${settings.graceDays} días, pagá aquí: ${invoiceUrl(inv.id)}`,
          `Olá ${c.contactName}, sua fatura venceu em ${fmtDate(inv.dueAt)}. Para evitar a suspensão do serviço em ${settings.graceDays} dias, pague aqui: ${invoiceUrl(inv.id)}`,
        ),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------- ações manuais do admin
export async function setCustomerSuspended(customerId: string, suspended: boolean) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) return;
  await db.update(schema.customers).set({ status: suspended ? "SUSPENDED" : "ACTIVE" }).where(eq(schema.customers.id, c.id));
  if (c.tenantId) await db.update(schema.tenants).set({ suspended }).where(eq(schema.tenants.id, c.tenantId));
}

/** Liga/desliga o GoInteligence (recursos pro) do sistema do cliente. */
export async function setCustomerTier(customerId: string, tier: "basic" | "pro") {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c?.tenantId) throw new BillingError("Cliente sem sistema criado");
  await db.update(schema.tenants).set({ tier }).where(eq(schema.tenants.id, c.tenantId));
}

/** Plano personalizado: troca os módulos do cliente e recalcula a mensalidade (vale a partir da próxima fatura). */
export async function setCustomerModules(customerId: string, selected: ModuleKey[]) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId), with: { plan: true } });
  if (!c) throw new BillingError("Cliente não encontrado");
  if (!c.plan.isCustom) throw new BillingError("Só clientes do plano personalizado escolhem módulos");
  const prices = parseModulePrices((await getSettings()).modulePrices);
  const mods = sanitizeModules(selected);
  const monthly = customPrice(prices, mods);
  await db
    .update(schema.plans)
    .set({
      pricePyg: monthly.PYG,
      priceUsdMinor: monthly.USD,
      priceBrlMinor: monthly.BRL,
      intelligence: needsPro(mods),
      modules: JSON.stringify(mods),
      features: [CORE_INFO.pt, ...mods.map((m) => MODULE_INFO[m].pt)].join("\n"),
    })
    .where(eq(schema.plans.id, c.planId));
  if (c.tenantId) await db.update(schema.tenants).set({ modules: JSON.stringify(mods), tier: needsPro(mods) ? "pro" : "basic" }).where(eq(schema.tenants.id, c.tenantId));
  return { mods, monthly };
}

export async function cancelCustomer(customerId: string) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) return;
  await db.update(schema.customers).set({ status: "CANCELLED", nextBillingAt: null }).where(eq(schema.customers.id, c.id));
  await db
    .update(schema.invoices)
    .set({ status: "CANCELLED" })
    .where(and(eq(schema.invoices.customerId, c.id), eq(schema.invoices.status, "OPEN")));
  if (c.tenantId) await db.update(schema.tenants).set({ suspended: true, isOpen: false }).where(eq(schema.tenants.id, c.tenantId));
}

export async function setCustomDomain(customerId: string, domain: string | null) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c?.tenantId) throw new BillingError("Cliente sem sistema criado");
  const clean = domain ? domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null;
  if (clean && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) throw new BillingError("Domínio inválido");
  await db.update(schema.tenants).set({ customDomain: clean || null }).where(eq(schema.tenants.id, c.tenantId));
}
