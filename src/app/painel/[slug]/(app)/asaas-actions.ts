"use server";
// Recebimentos online pelo Asaas (só Brasil): criar a subconta, repasse por Pix, formas no site,
// forma de cobrança do saldo da mensalidade.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit, rateLimit } from "@/lib/security";
import { COMPANY_TYPES, isValidCnpj, isValidCpfDigits } from "@/core/asaas";
import { parseMajorToMinor } from "@/core/money";
import { AsaasError, createTenantSubaccount, ensureHybridCycle, setTenantAsaasCheckout, transferTenantBalance, updateTenantPayout } from "@/services/asaas";
import { formatMoney } from "@/core/money";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const page = (slug: string) => `/painel/${slug}/recebimentos`;
const back = (slug: string, kind: "ok" | "err", msg: string): never => redirect(`${page(slug)}?${kind}=${encodeURIComponent(msg)}`);

async function brTenant(slug: string) {
  const t = await requireTenantAdmin(slug, "settings");
  if (t.country !== "BR") redirect(`/painel/${slug}`);
  return t;
}

export async function createSubaccountAction(slug: string, f: FormData) {
  const t = await brTenant(slug);
  if (!(await rateLimit(`asaas-sub:${t.id}`, 5, 3600))) back(slug, "err", "Muitas tentativas. Tente de novo em 1 hora.");
  const doc = str(f, "cpfCnpj").replace(/\D/g, "");
  const isCnpj = doc.length === 14;
  if (isCnpj ? !isValidCnpj(doc) : !isValidCpfDigits(doc)) back(slug, "err", "CPF ou CNPJ inválido.");
  const companyType = str(f, "companyType");
  if (isCnpj && !COMPANY_TYPES.some((c) => c.id === companyType)) back(slug, "err", "Escolha o tipo da empresa.");
  const birthDate = str(f, "birthDate");
  if (!isCnpj && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) back(slug, "err", "Informe a data de nascimento do titular do CPF.");
  const email = str(f, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(slug, "err", "E-mail inválido.");
  const phone = str(f, "mobilePhone").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (!/^\d{10,11}$/.test(phone)) back(slug, "err", "Celular inválido (DDD + número).");
  const cep = str(f, "postalCode").replace(/\D/g, "");
  if (cep.length !== 8) back(slug, "err", "CEP inválido.");
  const income = parseMajorToMinor(str(f, "incomeValue") || "0", "BRL") ?? 0;
  if (income < 100) back(slug, "err", "Informe o faturamento mensal aproximado.");
  for (const k of ["address", "addressNumber", "province"]) if (!str(f, k)) back(slug, "err", "Preencha o endereço completo.");
  if (f.get("terms") !== "on") back(slug, "err", "Confirme que os dados são verdadeiros e que aceita os termos do Asaas.");
  let ok = "";
  try {
    await createTenantSubaccount(t, {
      name: str(f, "name").slice(0, 120) || t.name,
      email,
      cpfCnpj: doc,
      birthDate: isCnpj ? undefined : birthDate,
      companyType: isCnpj ? companyType : undefined,
      mobilePhone: phone,
      incomeValue: income / 100,
      address: str(f, "address").slice(0, 120),
      addressNumber: str(f, "addressNumber").slice(0, 20),
      complement: str(f, "complement").slice(0, 60) || undefined,
      province: str(f, "province").slice(0, 60),
      postalCode: cep,
      pixKey: str(f, "pixKey"),
    });
    ok = "Conta de recebimentos criada! Pix e cartão online já aparecem no seu site. Confira o e-mail do Asaas e envie os documentos pedidos abaixo.";
  } catch (e) {
    back(slug, "err", e instanceof AsaasError ? e.message : "Não foi possível criar a conta agora. Tente de novo.");
  }
  await audit(t.id, await actorName(slug), "asaas.subaccount", doc.length === 14 ? "CNPJ" : "CPF");
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, t.id), columns: { id: true } });
  if (c) await ensureHybridCycle(c.id).catch(() => null);
  revalidatePath(page(slug));
  back(slug, "ok", ok);
}

export async function payoutAction(slug: string, f: FormData) {
  const t = await brTenant(slug);
  try {
    await updateTenantPayout(t, str(f, "pixKey"), f.get("autoTransfer") === "on");
  } catch (e) {
    back(slug, "err", e instanceof AsaasError ? e.message : "Erro ao salvar.");
  }
  await audit(t.id, await actorName(slug), "asaas.payout", "chave Pix atualizada");
  back(slug, "ok", "Repasse salvo ✓");
}

export async function transferNowAction(slug: string) {
  const t = await brTenant(slug);
  if (!(await rateLimit(`asaas-tr:${t.id}`, 6, 3600))) back(slug, "err", "Muitas tentativas. Aguarde um pouco.");
  let msg = "";
  try {
    const r = await transferTenantBalance(t);
    msg = `Transferência de ${formatMoney(r.amountMinor, "BRL")} enviada para a sua chave Pix.`;
    await audit(t.id, await actorName(slug), "asaas.transfer", formatMoney(r.amountMinor, "BRL"));
  } catch (e) {
    back(slug, "err", e instanceof AsaasError ? e.message : "Não foi possível transferir agora.");
  }
  back(slug, "ok", msg);
}

export async function checkoutMethodsAction(slug: string, f: FormData) {
  const t = await brTenant(slug);
  await setTenantAsaasCheckout(t, f.get("pix") === "on", f.get("card") === "on");
  await audit(t.id, await actorName(slug), "asaas.methods", `pix=${f.get("pix") === "on"} cartão=${f.get("card") === "on"}`);
  back(slug, "ok", "Formas de pagamento salvas ✓");
}

export async function billingMethodAction(slug: string, f: FormData) {
  const t = await brTenant(slug);
  const m = f.get("method") === "CREDIT_CARD" ? "CREDIT_CARD" : "PIX";
  await db.update(schema.customers).set({ preferredBilling: m }).where(eq(schema.customers.tenantId, t.id));
  await audit(t.id, await actorName(slug), "billing.method", m);
  back(slug, "ok", m === "CREDIT_CARD" ? "O saldo será cobrado no cartão salvo ✓" : "O saldo será enviado por link (Pix, boleto ou cartão) ✓");
}
