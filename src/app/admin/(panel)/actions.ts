"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { clearSession, requirePlatformAdmin } from "@/lib/auth";
import { isValidE164, isValidName } from "@/core/region";
import { CURRENCIES, type Currency } from "@/core/types";
import { parseMajorToMinor } from "@/core/money";
import {
  BillingError,
  cancelCustomer,
  createCustomer,
  deliverCustomer,
  markInvoicePaid,
  runBillingCycle,
  setCustomDomain,
  setCustomerSuspended,
  getSettings,
} from "@/services/billing";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => f.get(k) === "on";
const money = (f: FormData, k: string, c: Currency) => parseMajorToMinor(str(f, k) || "0", c) ?? 0;
const back = (path: string, msg: string, kind: "ok" | "err" = "ok") => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

export async function adminLogout() {
  await clearSession();
  redirect("/admin/login");
}

// ---------------- clientes
export async function newCustomer(f: FormData) {
  await requirePlatformAdmin();
  let id = "";
  try {
    if (!isValidName(str(f, "contactName"))) throw new Error("Nome do responsável inválido (use apenas letras).");
    const wa = str(f, "whatsapp");
    if (wa && !isValidE164(wa)) throw new Error("WhatsApp inválido para o país escolhido.");
    const c = await createCustomer({
      country: str(f, "country") || "PY",
      businessName: str(f, "businessName"),
      contactName: str(f, "contactName"),
      email: str(f, "email"),
      whatsapp: str(f, "whatsapp") || null,
      whatsappOptIn: bool(f, "whatsappOptIn"),
      ruc: str(f, "ruc") || null,
      desiredSlug: str(f, "slug") || null,
      planId: str(f, "planId"),
      // Brasil cobra só em R$
      preferredCurrency: str(f, "country") === "BR" ? "BRL" : ((CURRENCIES.find((c) => c === str(f, "currency")) ?? "PYG") as Currency),
      wantsDomain: bool(f, "wantsDomain"),
      domainName: str(f, "domainName") || null,
      notes: str(f, "notes") || null,
      theme: str(f, "theme") || null,
    });
    id = c.id;
  } catch (e) {
    back("/admin/clientes", e instanceof Error ? e.message : "Erro", "err");
  }
  back(`/admin/clientes/${id}`, "Cliente criado. A cobrança da implantação foi enviada.");
}

export async function deliver(customerId: string) {
  await requirePlatformAdmin();
  try {
    await deliverCustomer(customerId);
  } catch (e) {
    back(`/admin/clientes/${customerId}`, e instanceof BillingError ? e.message : "Erro ao entregar", "err");
  }
  back(`/admin/clientes/${customerId}`, "Sistema entregue! Acessos e 1ª mensalidade enviados ao cliente.");
}

export async function confirmInvoicePaid(customerId: string, invoiceId: string, f: FormData) {
  await requirePlatformAdmin();
  const currency = (CURRENCIES.find((c) => c === str(f, "currency")) ?? undefined) as Currency | undefined;
  await markInvoicePaid(invoiceId, { provider: "manual", currency });
  revalidatePath(`/admin/clientes/${customerId}`);
}

export async function cancelInvoice(customerId: string, invoiceId: string) {
  await requirePlatformAdmin();
  await db.update(schema.invoices).set({ status: "CANCELLED" }).where(eq(schema.invoices.id, invoiceId));
  revalidatePath(`/admin/clientes/${customerId}`);
}

export async function toggleTask(customerId: string, taskId: string, done: boolean) {
  await requirePlatformAdmin();
  await db.update(schema.adminTasks).set({ done, doneAt: done ? new Date() : null }).where(eq(schema.adminTasks.id, taskId));
  revalidatePath(`/admin/clientes/${customerId}`);
  revalidatePath("/admin");
}

export async function saveDomain(customerId: string, f: FormData) {
  await requirePlatformAdmin();
  try {
    await setCustomDomain(customerId, str(f, "customDomain") || null);
  } catch (e) {
    back(`/admin/clientes/${customerId}`, e instanceof Error ? e.message : "Erro", "err");
  }
  back(`/admin/clientes/${customerId}`, "Domínio salvo.");
}

export async function suspendCustomer(customerId: string, suspended: boolean) {
  await requirePlatformAdmin();
  await setCustomerSuspended(customerId, suspended);
  revalidatePath(`/admin/clientes/${customerId}`);
}

export async function cancelCustomerAction(customerId: string) {
  await requirePlatformAdmin();
  await cancelCustomer(customerId);
  revalidatePath(`/admin/clientes/${customerId}`);
}

export async function runCycleNow() {
  await requirePlatformAdmin();
  const r = await runBillingCycle();
  back("/admin", `Ciclo executado: ${r.invoicesCreated} fatura(s) gerada(s), ${r.pastDue} em atraso, ${r.suspended} suspenso(s).`);
}

// ---------------- planos
export async function savePlan(f: FormData) {
  await requirePlatformAdmin();
  const id = str(f, "id");
  const values = {
    name: str(f, "name"),
    description: str(f, "description") || null,
    interval: str(f, "interval") === "YEARLY" ? ("YEARLY" as const) : ("MONTHLY" as const),
    pricePyg: money(f, "pricePyg", "PYG"),
    priceUsdMinor: money(f, "priceUsd", "USD"),
    priceBrlMinor: money(f, "priceBrl", "BRL"),
    setupPyg: money(f, "setupPyg", "PYG"),
    setupUsdMinor: money(f, "setupUsd", "USD"),
    setupBrlMinor: money(f, "setupBrl", "BRL"),
    includesDomain: bool(f, "includesDomain"),
    features: str(f, "features") || null,
    active: bool(f, "active"),
    sortOrder: Number(str(f, "sortOrder")) || 0,
  };
  if (!values.name) back("/admin/planos", "Nome obrigatório", "err");
  if (id) await db.update(schema.plans).set(values).where(eq(schema.plans.id, id));
  else await db.insert(schema.plans).values(values);
  back("/admin/planos", "Plano salvo.");
}

// ---------------- configurações
export async function saveSettings(f: FormData) {
  await requirePlatformAdmin();
  await getSettings();
  const gw = { PYG: str(f, "gw_PYG") || "manual", USD: str(f, "gw_USD") || "manual", BRL: str(f, "gw_BRL") || "manual" };
  await db
    .update(schema.platformSettings)
    .set({
      companyName: str(f, "companyName") || "GoWeb",
      platformDomain: str(f, "platformDomain").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null,
      supportWhatsapp: str(f, "supportWhatsapp") || null,
      supportEmail: str(f, "supportEmail") || null,
      domainPricePyg: money(f, "domainPyg", "PYG"),
      domainPriceUsdMinor: money(f, "domainUsd", "USD"),
      domainPriceBrlMinor: money(f, "domainBrl", "BRL"),
      gatewayByCurrency: JSON.stringify(gw),
      manualInstructions: str(f, "manualInstructions") || null,
      invoiceDaysBefore: Math.max(0, Number(str(f, "invoiceDaysBefore")) || 5),
      graceDays: Math.max(1, Number(str(f, "graceDays")) || 7),
      updatedAt: new Date(),
    })
    .where(eq(schema.platformSettings.id, "default"));
  back("/admin/config", "Configurações salvas.");
}
