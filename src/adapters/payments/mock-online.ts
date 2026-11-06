// Gateway SIMULADO para desenvolvimento/demonstração.
// Reproduz o fluxo real de um checkout hospedado: redirect -> página do "gateway"
// -> webhook -> pedido pago. Use-o como referência ao implementar Bancard/Pagopar.
import type { PaymentProvider } from "./PaymentProvider";

export const mockOnlineProvider: PaymentProvider = {
  id: "mock_online",
  label: "Tarjeta online (SIMULADO)",
  labelPt: "Cartão online (SIMULADO — demonstração)",
  methods: ["CARD"],
  currencies: ["PYG", "USD", "BRL"],
  online: true,
  // Desligado em produção, exceto se ENABLE_MOCK_GATEWAY=true (útil para demos)
  available: process.env.NODE_ENV !== "production" || process.env.ENABLE_MOCK_GATEWAY === "true",

  async createPayment(ctx) {
    const ref = `mock_${ctx.orderId}`;
    const url = new URL("/pay/mock", ctx.returnUrl);
    url.searchParams.set("ref", ref);
    url.searchParams.set("order", ctx.orderId);
    url.searchParams.set("amount", String(ctx.amountMinor));
    url.searchParams.set("currency", ctx.currency);
    url.searchParams.set("return", ctx.returnUrl);
    url.searchParams.set("t", ctx.tenantSlug);
    return { status: "PENDING", providerRef: ref, redirectUrl: url.toString() };
  },

  async handleWebhook(req) {
    const body = (await req.json()) as { ref: string; approved: boolean };
    const orderId = body.ref.replace(/^mock_/, "");
    return { orderId, providerRef: body.ref, status: body.approved ? "PAID" : "FAILED", responseBody: { ok: true } };
  },
};
