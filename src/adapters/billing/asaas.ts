// =============================================================================
// Asaas — cobrança dos CLIENTES DA PLATAFORMA (implantação e saldo residual da mensalidade), BRL
// =============================================================================
// Usa a conta PRINCIPAL da GoWeb. O cliente paga na página segura do Asaas (Pix, boleto ou cartão);
// pagando com cartão, o token volta no webhook e fica salvo para cobrar o residual sozinho.
// Confirmação: webhook único /api/asaas/webhook (externalReference "inv:<id>").
// =============================================================================
import type { BillingProvider } from "./BillingProvider";
import { asaasRuntime } from "@/adapters/asaas/runtime";
import { createPayment, ensureCustomer } from "@/adapters/asaas/client";
import { isValidDoc, toReais } from "@/core/asaas";

export class AsaasBillingDocError extends Error {}

export const asaasBillingProvider: BillingProvider = {
  id: "asaas",
  label: "Asaas (Pix, boleto e cartão)",
  currencies: ["BRL"],
  isConfigured: () => !!asaasRuntime(),
  async createCheckout(input) {
    const rt = asaasRuntime();
    if (!rt) throw new Error("Asaas não configurado");
    const doc = (input.customer.doc ?? "").replace(/\D/g, "");
    if (!isValidDoc(doc)) throw new AsaasBillingDocError("Informe um CPF ou CNPJ válido para pagar.");
    const auth = { env: rt.env, apiKey: rt.apiKey };
    const customer = await ensureCustomer(auth, {
      name: input.customer.businessName || input.customer.name,
      cpfCnpj: doc,
      email: input.customer.email,
      mobilePhone: input.customer.phone?.replace(/^\+55/, "") ?? null,
      externalReference: input.customer.id,
    });
    const due = new Date(Date.now() + 3 * 86_400_000 - 3 * 3600e3).toISOString().slice(0, 10);
    const p = await createPayment(auth, { customer, billingType: "UNDEFINED", value: toReais(input.amountMinor), dueDate: due, description: input.description.slice(0, 500), externalReference: `inv:${input.invoiceId}` });
    if (!p.invoiceUrl) throw new Error("Asaas não devolveu o link de pagamento");
    return { kind: "redirect", checkoutUrl: p.invoiceUrl, providerRef: p.id };
  },
};
