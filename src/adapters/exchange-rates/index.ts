// =============================================================================
// PONTO DE EXTENSÃO: Cotação de moedas
// =============================================================================
// Padrão: taxa MANUAL definida pelo estabelecimento no painel ("hoy el dólar a 7.300").
// Futuro: adapter que busca cotação de casas de câmbio / BCP / BCB e sugere ao lojista
// (nunca aplicar automaticamente sem margem configurável).
// =============================================================================
import type { Rates } from "@/core/money";
import { tenantRates } from "@/core/region";

type TenantRates = { currency: string; rateUsd: number; rateBrl: number; ratePyg: number };

export interface ExchangeRateProvider {
  readonly id: string;
  getRates(tenant: TenantRates): Promise<Rates>;
}

export const manualRatesProvider: ExchangeRateProvider = {
  id: "manual",
  async getRates(t) {
    return tenantRates(t);
  },
};

export function getExchangeRateProvider(): ExchangeRateProvider {
  return manualRatesProvider;
}
