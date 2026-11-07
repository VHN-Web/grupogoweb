"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { audit } from "@/lib/security";
import { db, schema } from "@/db";
import { adminActor, clearSession, requirePlatformAdmin } from "@/lib/auth";
import { isValidE164, isValidName } from "@/core/region";
import { CURRENCIES, type Currency } from "@/core/types";
import { customerCurrency } from "@/services/documents";
import { amountIn } from "@/core/billing";
import { parseMajorToMinor } from "@/core/money";
import { MODULES, parseModulePrices } from "@/core/modules";
import { saveImage } from "@/adapters/storage";
import {
  BillingError,
  cancelCustomer,
  createCustomer,
  deliverCustomer,
  markInvoicePaid,
  runBillingCycle,
  setCustomDomain,
  setCustomerSuspended,
  setCustomerTier,
  setCustomerModules,
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
  // Moeda do país do cliente: cliente do Brasil sempre em R$ (nunca cai em guaranis por padrão)
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) return;
  const allowed: Currency[] = c.country === "BR" ? ["BRL"] : ["PYG", "USD"];
  const asked = CURRENCIES.find((x) => x === str(f, "currency")) as Currency | undefined;
  const currency = asked && allowed.includes(asked) ? asked : customerCurrency(c);
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv || inv.customerId !== c.id) return;
  await markInvoicePaid(invoiceId, { provider: "manual", currency, amountMinor: amountIn(inv, currency) });
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

export async function setTier(customerId: string, tier: "basic" | "pro") {
  await requirePlatformAdmin();
  await setCustomerTier(customerId, tier);
  back(`/admin/clientes/${customerId}`, tier === "pro" ? "GoInteligence ativado." : "GoInteligence desativado.");
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
    intelligence: bool(f, "intelligence"),
    features: str(f, "features") || null,
    active: bool(f, "active"),
    sortOrder: Number(str(f, "sortOrder")) || 0,
  };
  if (!values.name) back("/admin/planos", "Nome obrigatório", "err");
  if (id) await db.update(schema.plans).set(values).where(eq(schema.plans.id, id));
  else await db.insert(schema.plans).values(values);
  back("/admin/planos", "Plano salvo.");
}

export async function saveCustomerModules(customerId: string, f: FormData) {
  await requirePlatformAdmin();
  const path = `/admin/clientes/${customerId}`;
  try {
    const r = await setCustomerModules(customerId, f.getAll("modules").map(String) as never);
    await audit(null, await adminActor(), "customer.modules", `${customerId}: ${r.mods.join(", ") || "só núcleo"}`);
  } catch (e) {
    back(path, e instanceof BillingError ? e.message : "Erro ao salvar módulos.", "err");
  }
  revalidatePath(path);
  back(path, "Módulos atualizados. A nova mensalidade vale a partir da próxima fatura.");
}

// ---------------- plano personalizado (preço do núcleo, da implantação e de cada módulo, por moeda)
export async function saveModulePrices(f: FormData) {
  await requirePlatformAdmin();
  await getSettings();
  const trio = (prefix: string) => ({ BRL: money(f, `${prefix}_BRL`, "BRL"), PYG: money(f, `${prefix}_PYG`, "PYG"), USD: money(f, `${prefix}_USD`, "USD") });
  const prices = {
    enabled: bool(f, "enabled"),
    core: trio("core"),
    setup: trio("setup"),
    modules: Object.fromEntries(MODULES.map((m) => [m, trio(`m_${m}`)])),
  };
  await db.update(schema.platformSettings).set({ modulePrices: JSON.stringify(parseModulePrices(JSON.stringify(prices))) }).where(eq(schema.platformSettings.id, "default"));
  await audit(null, await adminActor(), "plans.modules", prices.enabled ? "ativo" : "desligado");
  back("/admin/planos", "Preços do plano personalizado salvos (valem para novas contratações).");
}

/** Envia uma imagem minúscula de teste para conferir o armazenamento (Vercel Blob) em produção. */
export async function testStorage() {
  await requirePlatformAdmin();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  let url: string | null = null;
  let error = "";
  try {
    url = await saveImage(new File([png], "teste.png", { type: "image/png" }), "healthcheck");
  } catch (e) {
    error = e instanceof Error ? e.message : "erro desconhecido";
  }
  await audit(null, await adminActor(), "storage.test", url ?? `falhou: ${error}`);
  if (url) back("/admin/config", `Imagem enviada com sucesso: ${url}`);
  else back("/admin/config", `Falhou: ${error}`, "err");
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
      legalName: str(f, "legalName") || null,
      legalDoc: str(f, "legalDoc").replace(/[^\d./-]/g, "") || null,
      legalAddress: str(f, "legalAddress") || null,
      legalCity: str(f, "legalCity") || null,
      // NFS-e só liga com CNPJ (14 dígitos), inscrição municipal e provedor preenchidos
      nfseEnabled: f.get("nfseEnabled") === "on" && str(f, "legalDoc").replace(/\D/g, "").length === 14 && !!str(f, "nfseMunicipalReg") && !!str(f, "nfseProvider"),
      nfseProvider: str(f, "nfseProvider") || null,
      nfseMunicipalReg: str(f, "nfseMunicipalReg") || null,
      nfseServiceCode: str(f, "nfseServiceCode") || null,
      docsRetentionMonths: Math.min(120, Math.max(1, Number(str(f, "docsRetentionMonths")) || 12)),
      updatedAt: new Date(),
    })
    .where(eq(schema.platformSettings.id, "default"));
  back("/admin/config", "Configurações salvas.");
}

// ---------------- Apagar clientes (limpeza) ----------------
/**
 * Apaga clientes de vez: faturas, contratos, recibos e tarefas vão junto (cascata).
 * Com "apagar a loja", o site/painel do cliente e todos os dados dele (produtos, pedidos, caixa…) também são apagados.
 * Lojas de demonstração nunca são apagadas por aqui.
 */
async function removeCustomers(ids: string[], withStore: boolean) {
  const list = await db.query.customers.findMany({ where: inArray(schema.customers.id, ids), with: { tenant: true } });
  let stores = 0;
  for (const c of list) {
    await db.delete(schema.customers).where(eq(schema.customers.id, c.id));
    if (withStore && c.tenant && !c.tenant.demo) {
      await db.delete(schema.tenants).where(eq(schema.tenants.id, c.tenant.id));
      stores++;
    }
    await audit(null, await adminActor(), "customer.delete", `${c.businessName}${withStore && c.tenant && !c.tenant.demo ? " + loja" : ""}`);
  }
  return { customers: list.length, stores };
}

export async function deleteCustomers(f: FormData) {
  await requirePlatformAdmin();
  const ids = f.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) back("/admin/clientes", "Selecione pelo menos um cliente.", "err");
  if (str(f, "confirm").toUpperCase() !== "APAGAR") back("/admin/clientes", "Para confirmar, digite APAGAR.", "err");
  const r = await removeCustomers(ids, bool(f, "withStore"));
  revalidatePath("/admin/clientes");
  back("/admin/clientes", `${r.customers} cliente(s) apagado(s)${r.stores ? ` e ${r.stores} loja(s)` : ""}.`);
}

export async function deleteCustomer(customerId: string, f: FormData) {
  await requirePlatformAdmin();
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  if (!c) back("/admin/clientes", "Cliente não encontrado.", "err");
  if (str(f, "confirm").toLowerCase() !== c!.businessName.trim().toLowerCase())
    back(`/admin/clientes/${customerId}`, `Para apagar, digite o nome exato: ${c!.businessName}`, "err");
  const r = await removeCustomers([customerId], bool(f, "withStore"));
  revalidatePath("/admin/clientes");
  back("/admin/clientes", `${c!.businessName} apagado${r.stores ? " (com a loja)" : ""}.`);
}

/** Lojas que ficaram sem cliente (testes antigos) — exceto as de demonstração. */
export async function orphanStores() {
  await requirePlatformAdmin();
  const linked = (await db.query.customers.findMany({ columns: { tenantId: true } })).map((c) => c.tenantId).filter((x): x is string => !!x);
  return db.query.tenants.findMany({
    where: linked.length ? and(eq(schema.tenants.demo, false), notInArray(schema.tenants.id, linked)) : eq(schema.tenants.demo, false),
    columns: { id: true, name: true, slug: true, createdAt: true },
  });
}

export async function deleteOrphanStores(f: FormData) {
  await requirePlatformAdmin();
  const ids = f.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) back("/admin/clientes", "Selecione pelo menos uma loja.", "err");
  if (str(f, "confirm").toUpperCase() !== "APAGAR") back("/admin/clientes", "Para confirmar, digite APAGAR.", "err");
  const valid = new Set((await orphanStores()).map((t) => t.id));
  const del = ids.filter((id) => valid.has(id));
  if (del.length) await db.delete(schema.tenants).where(inArray(schema.tenants.id, del));
  await audit(null, await adminActor(), "store.delete", `${del.length} loja(s) sem cliente`);
  revalidatePath("/admin/clientes");
  back("/admin/clientes", `${del.length} loja(s) sem cliente apagada(s).`);
}
