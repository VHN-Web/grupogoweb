// =============================================================================
// PONTO DE EXTENSÃO: Gateways de pagamento
// =============================================================================
// Todo meio de pagamento é um adapter que implementa PaymentProvider.
// Para adicionar um gateway real (Bancard vPOS, Pagopar, dLocal, Mercado Pago...):
//   1. Criar src/adapters/payments/<id>.ts implementando esta interface
//   2. Registrar em ./registry.ts
//   3. O webhook chega em /api/payments/<id>/webhook e chama handleWebhook()
// O resto do sistema (checkout, pedidos, caixa, comprovante) NÃO muda.
// =============================================================================
import type { Currency, PaymentMethod, PaymentStatus } from "@/core/types";

export type PaymentContext = {
  tenantId: string;
  tenantSlug: string;
  orderId: string;
  orderNumber: string;
  /** Forma de pagamento escolhida (ex: PIX ou CARD) */
  method: PaymentMethod;
  /** Idioma do cliente final (instruções exibidas a ele) */
  locale: "es" | "pt";
  amountMinor: number; // na moeda abaixo
  currency: Currency;
  customerName: string;
  customerPhone?: string | null;
  /** URL para onde o gateway deve devolver o cliente */
  returnUrl: string;
  /** URL do webhook deste provider */
  webhookUrl: string;
  /** Credenciais do estabelecimento para este provider (tenant.paymentConfig.credentials[id]) */
  credentials: Record<string, string>;
};

export type CreatePaymentResult = {
  status: PaymentStatus;
  /** Referência no gateway (process_id, hash, etc.) */
  providerRef?: string;
  /** Se presente, o cliente é redirecionado para pagar (checkout hospedado) */
  redirectUrl?: string;
  /** Instruções mostradas ao cliente (ex: chave Pix, "pague no caixa") */
  instructions?: string;
};

export type WebhookResult = {
  /** Id do pedido no nosso sistema (o provider deve conseguir resolvê-lo) */
  orderId: string;
  status: PaymentStatus;
  providerRef?: string;
  /** Valor efetivamente pago (unidade menor), para conferência */
  amountMinor?: number;
  /** Resposta que o gateway espera receber */
  responseBody?: unknown;
};

export interface PaymentProvider {
  /** id estável, salvo no pedido e na config do tenant */
  readonly id: string;
  readonly label: string;
  /** Rótulo em português (painel de estabelecimentos do Brasil) */
  readonly labelPt?: string;
  readonly methods: readonly PaymentMethod[];
  readonly currencies: readonly Currency[];
  /** true = pagamento processado online pelo gateway; false = confirmado manualmente no painel */
  readonly online: boolean;
  /** false = stub ainda não implementado (não aparece para o cliente) */
  readonly available: boolean;

  createPayment(ctx: PaymentContext): Promise<CreatePaymentResult>;
  /** null = aviso que não é de pagamento (responder 200 e ignorar) */
  handleWebhook?(req: Request, credentials: Record<string, string>): Promise<WebhookResult | null>;
  refund?(ref: string, amountMinor: number, credentials: Record<string, string>): Promise<void>;
}

export class NotImplementedProviderError extends Error {
  constructor(provider: string, what: string) {
    super(`[${provider}] ${what} ainda não implementado — ver TODOs em src/adapters/payments/${provider}.ts`);
  }
}
