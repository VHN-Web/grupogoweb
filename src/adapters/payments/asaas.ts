// =============================================================================
// Asaas — pagamento ONLINE dos pedidos do lojista (Brasil, BRL) pela SUBCONTA white-label dele
// =============================================================================
// A cobrança é criada com a chave da subconta do lojista; o dinheiro cai no saldo dele.
// Se houver mensalidade a abater (billing híbrido), vai um `split` fixo para a carteira da GoWeb
// (calculado no servidor em services/asaas.ts → credentials.splitWallet/splitMinor).
// Pix: QR + copia e cola na página do pedido. Cartão: página segura do Asaas (invoiceUrl).
// Confirmação: webhook único /api/asaas/webhook (services/asaas.ts#handleAsaasEvent).
// =============================================================================
import type { PaymentProvider } from "./PaymentProvider";
import { createPayment, ensureCustomer, pixQrCode } from "@/adapters/asaas/client";
import { toReais, type AsaasEnv } from "@/core/asaas";

export class AsaasCheckoutError extends Error {}

const today = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // data de Brasília

export const asaasPaymentProvider: PaymentProvider = {
  id: "asaas",
  label: "Asaas (online)",
  labelPt: "GoWeb Pagamentos (Asaas) — Pix e cartão online, cai na sua conta",
  methods: ["PIX", "CARD"],
  currencies: ["BRL"],
  online: true,
  available: true,

  async createPayment(ctx) {
    const auth = { env: (ctx.credentials.env as AsaasEnv) || "sandbox", apiKey: ctx.credentials.apiKey ?? "" };
    if (!auth.apiKey) throw new AsaasCheckoutError("Recebimentos Asaas não ativados nesta loja.");
    if (!ctx.customerDoc) throw new AsaasCheckoutError("CPF obrigatório para pagar online.");
    const customer = await ensureCustomer(auth, { name: ctx.customerName, cpfCnpj: ctx.customerDoc, mobilePhone: ctx.customerPhone?.replace(/^\+55/, "") ?? null });
    const splitMinor = Number(ctx.credentials.splitMinor ?? 0);
    const pay = await createPayment(auth, {
      customer,
      billingType: ctx.method === "PIX" ? "PIX" : "CREDIT_CARD",
      value: toReais(ctx.amountMinor),
      dueDate: today(),
      description: `Pedido #${ctx.orderNumber}`,
      externalReference: `ord:${ctx.orderId}`,
      split: splitMinor > 0 && ctx.credentials.splitWallet ? [{ walletId: ctx.credentials.splitWallet, fixedValue: toReais(splitMinor) }] : undefined,
    });
    if (ctx.method === "PIX") {
      const qr = await pixQrCode(auth, pay.id);
      return { status: "PENDING", providerRef: pay.id, pixPayload: qr.payload, instructions: "Pix" };
    }
    return { status: "PENDING", providerRef: pay.id, redirectUrl: pay.invoiceUrl };
  },
};
