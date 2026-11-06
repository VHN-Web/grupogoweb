// =============================================================================
// STUB — Bancard vPOS 2.0 (Paraguai). Implementação real requer intervenção humana:
// contrato com Bancard, credenciais de staging, homologação.
// =============================================================================
// Fluxo resumido (confirmar na documentação oficial do vPOS antes de implementar):
//  1. createPayment: POST single_buy com shop_process_id (nosso id numérico), amount
//     (Gs. com 2 decimais "10000.00"), currency "PYG", description, return_url,
//     cancel_url e token = md5(private_key + shop_process_id + amount + currency).
//     Resposta traz process_id -> usar no checkout JS do Bancard (iframe) ou redirect.
//  2. Bancard chama nossa URL de confirmação (webhook) com operation.response === "S"
//     (aprovado) e um token para validar: md5(private_key + shop_process_id + "confirm" + amount + currency).
//  3. handleWebhook deve: validar token, mapear shop_process_id -> orderId, retornar PAID/FAILED,
//     e responder { status: "success" }.
//  4. refund: rollback (antes do fechamento do lote) via endpoint single_buy/rollback.
// Observações: shop_process_id precisa ser NUMÉRICO e único -> criar coluna/tabela
// payment_attempts (orderId, attemptNumber) quando implementar.
// =============================================================================
import { NotImplementedProviderError, type PaymentProvider } from "./PaymentProvider";

export const bancardProvider: PaymentProvider = {
  id: "bancard",
  label: "Tarjeta online (Bancard)",
  methods: ["CARD"],
  currencies: ["PYG"],
  online: true,
  available: false, // mudar para true quando implementado e homologado

  async createPayment() {
    throw new NotImplementedProviderError("bancard", "createPayment");
  },
  async handleWebhook() {
    throw new NotImplementedProviderError("bancard", "handleWebhook");
  },
  async refund() {
    throw new NotImplementedProviderError("bancard", "refund");
  },
};
