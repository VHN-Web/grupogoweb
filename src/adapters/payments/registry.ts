import type { PaymentProvider } from "./PaymentProvider";
import { cashProvider, pixManualProvider, posProvider, transferManualProvider } from "./manual";
import { mockOnlineProvider } from "./mock-online";
import { bancardProvider } from "./bancard";
import { pagoparProvider } from "./pagopar";
import { mercadoPagoPaymentProvider } from "./mercadopago";

// Registre aqui novos gateways. A ordem define a ordem de exibição no painel.
const providers: PaymentProvider[] = [
  cashProvider,
  posProvider,
  pixManualProvider,
  transferManualProvider,
  mercadoPagoPaymentProvider,
  mockOnlineProvider,
  bancardProvider,
  pagoparProvider,
];

const byId = new Map(providers.map((p) => [p.id, p]));

export function getPaymentProvider(id: string): PaymentProvider {
  const p = byId.get(id);
  if (!p) throw new Error(`Payment provider desconhecido: ${id}`);
  return p;
}

export function listPaymentProviders(): PaymentProvider[] {
  return providers;
}
