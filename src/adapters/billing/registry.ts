import type { BillingProvider } from "./BillingProvider";
import { mercadoPagoProvider } from "./mercadopago";
import { asaasBillingProvider } from "./asaas";
import { manualBillingProvider, mockBillingProvider, pagoparBillingProvider, paypalBillingProvider } from "./others";

const providers: BillingProvider[] = [
  manualBillingProvider,
  mercadoPagoProvider,
  asaasBillingProvider,
  paypalBillingProvider,
  pagoparBillingProvider,
  mockBillingProvider,
];

export function listBillingProviders() {
  return providers;
}

export function getBillingProvider(id: string): BillingProvider | undefined {
  return providers.find((p) => p.id === id);
}
