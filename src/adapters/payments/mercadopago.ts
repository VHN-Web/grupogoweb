// =============================================================================
// Mercado Pago — pagamento ONLINE dos pedidos do estabelecimento (Brasil, BRL)
// =============================================================================
// Cada estabelecimento usa a PRÓPRIA conta: o dinheiro vai direto para ele.
// Credenciais salvas no painel (Configurações > Integrações de pagamento) em
// tenant.paymentConfig.credentials.mercadopago = { accessToken, webhookSecret?, account? }.
// O webhook é enviado automaticamente pelo MP para a notification_url da preferência:
//   {APP_URL}/api/payments/mercadopago/webhook?t={slug}
// Nunca confiamos no corpo do webhook: o pagamento é consultado na API com o token do estabelecimento.
// =============================================================================
import type { PaymentProvider } from "./PaymentProvider";
import { verifyMercadoPagoSignature } from "@/adapters/billing/mercadopago";

const API = "https://api.mercadopago.com";

export class MercadoPagoConfigError extends Error {}

/** Valida um Access Token chamando /users/me. Retorna o apelido/e-mail da conta. */
export async function checkMercadoPagoToken(accessToken: string): Promise<{ ok: true; account: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Token inválido ou sem permissão." };
    if (!res.ok) return { ok: false, error: `Mercado Pago respondeu ${res.status}.` };
    const u = (await res.json()) as { nickname?: string; email?: string; site_id?: string };
    if (u.site_id && u.site_id !== "MLB") return { ok: false, error: "Esta conta não é do Mercado Pago Brasil." };
    return { ok: true, account: u.email || u.nickname || "conta Mercado Pago" };
  } catch {
    return { ok: false, error: "Não foi possível falar com o Mercado Pago agora. Tente de novo." };
  }
}

export const mercadoPagoPaymentProvider: PaymentProvider = {
  id: "mercadopago",
  label: "Mercado Pago (online)",
  labelPt: "Mercado Pago — Pix e cartão online (confirmação automática)",
  methods: ["PIX", "CARD"],
  currencies: ["BRL"],
  online: true,
  available: true,

  async createPayment(ctx) {
    const token = ctx.credentials.accessToken;
    if (!token) throw new MercadoPagoConfigError("Mercado Pago não configurado neste estabelecimento.");
    // Pix → só Pix; Cartão → só cartões
    const excluded =
      ctx.method === "PIX"
        ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "prepaid_card" }, { id: "ticket" }, { id: "atm" }]
        : [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }];
    const res = await fetch(`${API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `order-${ctx.orderId}`,
      },
      body: JSON.stringify({
        items: [{ id: ctx.orderId, title: `Pedido #${ctx.orderNumber}`, quantity: 1, currency_id: "BRL", unit_price: ctx.amountMinor / 100 }],
        payer: { name: ctx.customerName },
        external_reference: ctx.orderId,
        notification_url: ctx.webhookUrl,
        back_urls: { success: ctx.returnUrl, pending: ctx.returnUrl, failure: ctx.returnUrl },
        auto_return: "approved",
        payment_methods: { excluded_payment_types: excluded, installments: 12 },
        expires: true,
        expiration_date_to: new Date(Date.now() + 2 * 3600e3).toISOString(),
      }),
    });
    if (res.status === 401 || res.status === 403) throw new MercadoPagoConfigError("Token do Mercado Pago inválido.");
    if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${await res.text()}`);
    const pref = (await res.json()) as { id: string; init_point: string };
    return { status: "PENDING", providerRef: pref.id, redirectUrl: pref.init_point };
  },

  async handleWebhook(req, credentials) {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
    const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    if (type !== "payment" || !dataId) return null; // outros avisos (merchant_order etc.) são ignorados

    if (credentials.webhookSecret) {
      const ok = verifyMercadoPagoSignature({
        xSignature: req.headers.get("x-signature"),
        xRequestId: req.headers.get("x-request-id"),
        dataId: url.searchParams.get("data.id") ?? dataId,
        secret: credentials.webhookSecret,
      });
      if (!ok) throw new Error("Assinatura do Mercado Pago inválida");
    }
    if (!credentials.accessToken) throw new Error("Mercado Pago sem token");
    const res = await fetch(`${API}/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Mercado Pago ${res.status} ao consultar pagamento`);
    const p = (await res.json()) as { status: string; external_reference?: string; transaction_amount?: number };
    if (!p.external_reference) return null;
    const status =
      p.status === "approved"
        ? "PAID"
        : p.status === "refunded" || p.status === "charged_back"
          ? "REFUNDED"
          : p.status === "rejected" || p.status === "cancelled"
            ? "FAILED"
            : "PENDING";
    return {
      orderId: p.external_reference,
      status,
      providerRef: dataId,
      amountMinor: p.transaction_amount != null ? Math.round(p.transaction_amount * 100) : undefined,
      responseBody: { ok: true },
    };
  },
};
