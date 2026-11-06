// =============================================================================
// Mercado Pago — Checkout Pro (conta BRASILEIRA, cobra em BRL: Pix, cartão, boleto)
// =============================================================================
// Variáveis de ambiente:
//   MERCADOPAGO_ACCESS_TOKEN    -> Painel do desenvolvedor > Suas integrações > Credenciais
//                                  (use as credenciais de TESTE primeiro)
//   MERCADOPAGO_WEBHOOK_SECRET  -> Painel > Webhooks > "Assinatura secreta" (recomendado)
// No painel do MP, configure o webhook (evento "Pagamentos") apontando para:
//   {APP_URL}/api/billing/webhook/mercadopago
// Obs: o Mercado Pago não opera no Paraguai; esta conta cobra em reais.
// =============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingProvider } from "./BillingProvider";

const API = "https://api.mercadopago.com";

function token() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN ?? "";
}

/** Valida o header x-signature (manifest: id:{data.id};request-id:{x-request-id};ts:{ts};) */
export function verifyMercadoPagoSignature(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
  secret: string;
}): boolean {
  if (!opts.xSignature) return false;
  let ts = "";
  let v1 = "";
  for (const part of opts.xSignature.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim());
    if (k === "ts") ts = v ?? "";
    if (k === "v1") v1 = v ?? "";
  }
  if (!ts || !v1) return false;
  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId ?? ""};ts:${ts};`;
  const expected = createHmac("sha256", opts.secret).update(manifest).digest("hex");
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

export const mercadoPagoProvider: BillingProvider = {
  id: "mercadopago",
  label: "Mercado Pago (BRL — Pix, cartão, boleto)",
  currencies: ["BRL"],
  isConfigured: () => token().length > 0,

  async createCheckout(input) {
    if (input.currency !== "BRL") throw new Error("Mercado Pago (conta BR) só cobra em BRL");
    const res = await fetch(`${API}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `invoice-${input.invoiceId}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: input.invoiceId,
            title: input.description,
            quantity: 1,
            currency_id: "BRL",
            unit_price: input.amountMinor / 100,
          },
        ],
        payer: { name: input.customer.name, email: input.customer.email },
        external_reference: input.invoiceId,
        notification_url: input.notificationUrl,
        back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
        auto_return: "approved",
        statement_descriptor: "GOWEB",
      }),
    });
    if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${await res.text()}`);
    const pref = (await res.json()) as { id: string; init_point: string };
    return { kind: "redirect", checkoutUrl: pref.init_point, providerRef: pref.id };
  },

  async handleWebhook(req) {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string } };
    const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    const dataId = String(body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
    if (type !== "payment" || !dataId) return null;

    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (secret) {
      const ok = verifyMercadoPagoSignature({
        xSignature: req.headers.get("x-signature"),
        xRequestId: req.headers.get("x-request-id"),
        dataId: url.searchParams.get("data.id") ?? dataId,
        secret,
      });
      if (!ok) throw new Error("Assinatura do Mercado Pago inválida");
    }

    // Nunca confiar no corpo do webhook: consultar o pagamento na API
    const res = await fetch(`${API}/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) throw new Error(`Mercado Pago ${res.status} ao consultar pagamento`);
    const p = (await res.json()) as { status: string; external_reference?: string; transaction_amount?: number; currency_id?: string };
    if (!p.external_reference) return null;
    const status = p.status === "approved" ? "PAID" : p.status === "rejected" || p.status === "cancelled" ? "FAILED" : "PENDING";
    return {
      invoiceId: p.external_reference,
      status,
      providerRef: dataId,
      currency: "BRL",
      amountMinor: p.transaction_amount != null ? Math.round(p.transaction_amount * 100) : undefined,
    };
  },
};
