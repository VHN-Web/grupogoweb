import type { BillingProvider } from "./BillingProvider";

/** Pagamento manual: transferência/depósito/dinheiro. Você confirma em /admin. */
export const manualBillingProvider: BillingProvider = {
  id: "manual",
  label: "Manual (transferência / depósito — você confirma no admin)",
  currencies: ["PYG", "USD", "BRL"],
  isConfigured: () => true,
  async createCheckout() {
    // As instruções reais vêm de platform_settings.manualInstructions (preenchidas no service)
    return { kind: "instructions", instructions: "" };
  },
};

/** Gateway simulado para testar o fluxo completo sem dinheiro real. Desligado em produção. */
export const mockBillingProvider: BillingProvider = {
  id: "mock",
  label: "Simulado (testes)",
  currencies: ["PYG", "USD", "BRL"],
  // NUNCA em produção: confirmaria faturas sem dinheiro real.
  isConfigured: () => process.env.NODE_ENV !== "production",
  async createCheckout(input) {
    const u = new URL("/pay/billing-mock", input.returnUrl);
    u.searchParams.set("invoice", input.invoiceId);
    u.searchParams.set("amount", String(input.amountMinor));
    u.searchParams.set("currency", input.currency);
    u.searchParams.set("return", input.returnUrl);
    return { kind: "redirect", checkoutUrl: u.toString(), providerRef: `mock_${input.invoiceId}` };
  },
  async handleWebhook(req) {
    const b = (await req.json()) as { invoiceId: string; approved: boolean; currency: "PYG" | "USD" | "BRL"; amount: number };
    return { invoiceId: b.invoiceId, status: b.approved ? "PAID" : "FAILED", providerRef: `mock_${b.invoiceId}`, currency: b.currency, amountMinor: b.amount };
  },
};

// =============================================================================
// STUB — PayPal (USD). Implementar com Orders API v2:
//   1. OAuth: POST /v1/oauth2/token (client_id/secret) -> access_token
//   2. POST /v2/checkout/orders { intent: CAPTURE, purchase_units:[{ reference_id: invoiceId,
//      amount:{ currency_code:"USD", value }}], application_context:{ return_url, cancel_url } }
//      -> link "approve" = checkoutUrl
//   3. Na volta (return_url) capturar: POST /v2/checkout/orders/{id}/capture
//   4. Webhook PAYMENT.CAPTURE.COMPLETED -> verificar assinatura (verify-webhook-signature)
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox|live
// 🧑 Confirmar com o PayPal se a sua conta (BR) pode receber de pagadores paraguaios em USD.
// =============================================================================
export const paypalBillingProvider: BillingProvider = {
  id: "paypal",
  label: "PayPal (USD) — próximamente",
  currencies: ["USD"],
  isConfigured: () => false,
  async createCheckout() {
    throw new Error("[paypal] ainda não implementado — ver src/adapters/billing/others.ts");
  },
};

// =============================================================================
// STUB — Pagopar (PYG). Exige comércio registrado no Paraguai (RUC) ou sócio local.
// Mesmo fluxo descrito em src/adapters/payments/pagopar.ts.
// Env: PAGOPAR_PUBLIC_KEY, PAGOPAR_PRIVATE_KEY
// =============================================================================
export const pagoparBillingProvider: BillingProvider = {
  id: "pagopar",
  label: "Pagopar (Gs.) — próximamente",
  currencies: ["PYG"],
  isConfigured: () => false,
  async createCheckout() {
    throw new Error("[pagopar] ainda não implementado — ver src/adapters/billing/others.ts");
  },
};
