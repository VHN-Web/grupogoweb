// =============================================================================
// STUB — Pagopar (Paraguai). Agrega tarjetas, billeteras (Tigo Money, Personal),
// bocas de cobranza (Aquí Pago, Pago Express) e transferências.
// =============================================================================
// Fluxo resumido (confirmar na documentação oficial do Pagopar):
//  1. createPayment: POST "iniciar-transaccion" com token = sha1(private_key + id_pedido_comercio + monto_total),
//     dados do comprador, itens e monto. Resposta traz "hash" do pedido.
//     redirectUrl = página de pagamento do Pagopar com esse hash.
//  2. Pagopar chama a URL de resposta (webhook) com o resultado; validar token
//     sha1(private_key + hash_pedido) e consultar o pedido para confirmar "pagado".
//  3. handleWebhook: mapear id_pedido_comercio -> orderId, retornar PAID/FAILED,
//     e responder com o JSON que o Pagopar espera (eco do resultado).
// =============================================================================
import { NotImplementedProviderError, type PaymentProvider } from "./PaymentProvider";

export const pagoparProvider: PaymentProvider = {
  id: "pagopar",
  label: "Pagopar (tarjeta, billeteras, bocas de cobranza)",
  methods: ["CARD", "TRANSFER"],
  currencies: ["PYG"],
  online: true,
  available: false,

  async createPayment() {
    throw new NotImplementedProviderError("pagopar", "createPayment");
  },
  async handleWebhook() {
    throw new NotImplementedProviderError("pagopar", "handleWebhook");
  },
};
