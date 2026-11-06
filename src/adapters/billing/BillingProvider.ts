// =============================================================================
// PONTO DE EXTENSÃO: Gateways para cobrar OS SEUS CLIENTES (implantação + mensalidade)
// =============================================================================
// Não confundir com src/adapters/payments (pagamentos dos clientes finais do restaurante).
// Um gateway por moeda, configurado em /admin/config:
//   BRL -> mercadopago   USD -> paypal (stub)   PYG -> pagopar (stub) / manual
// Para adicionar: criar arquivo aqui, registrar em ./registry.ts.
// O webhook chega em /api/billing/webhook/{providerId}.
// =============================================================================
import type { Currency } from "@/core/types";

export type BillingCheckoutInput = {
  invoiceId: string;
  description: string;
  currency: Currency;
  amountMinor: number;
  customer: { name: string; email: string; businessName: string };
  /** Página da fatura (o cliente volta para cá depois de pagar) */
  returnUrl: string;
  /** URL pública do webhook deste provider */
  notificationUrl: string;
};

export type BillingCheckoutResult =
  | { kind: "redirect"; checkoutUrl: string; providerRef?: string }
  | { kind: "instructions"; instructions: string };

export type BillingWebhookResult =
  | { invoiceId: string; status: "PAID" | "FAILED" | "PENDING"; providerRef?: string; currency?: Currency; amountMinor?: number }
  | null; // notificação ignorada (evento que não interessa)

export interface BillingProvider {
  readonly id: string;
  readonly label: string;
  readonly currencies: readonly Currency[];
  /** false = stub ou sem credenciais configuradas */
  isConfigured(): boolean;
  createCheckout(input: BillingCheckoutInput): Promise<BillingCheckoutResult>;
  handleWebhook?(req: Request): Promise<BillingWebhookResult>;
}
