// =============================================================================
// PONTO DE EXTENSÃO: Cotação de moedas
// =============================================================================
// Padrão: taxa MANUAL definida pelo estabelecimento no painel (é o que se usa na
// prática em balcão: "hoy el dólar a 7.300").
// Futuro: adapter que busca cotação de casas de câmbio / BCP e sugere ao lojista
// (nunca aplicar automaticamente sem margem configurável).
// =============================================================================
import type { Rates } from "@/core/money";

export interface ExchangeRateProvider {
  readonly id: string;
  getRates(tenant: { rateUsd: number; rateBrl: number }): Promise<Rates>;
}

export const manualRatesProvider: ExchangeRateProvider = {
  id: "manual",
  async getRates(t) {
    return { USD: t.rateUsd, BRL: t.rateBrl };
  },
};

export function getExchangeRateProvider(): ExchangeRateProvider {
  return manualRatesProvider;
}
