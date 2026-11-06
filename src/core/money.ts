// Dinheiro multi-moeda. Regras puras (sem I/O) — fáceis de testar.
//
// Base do sistema: guaraníes inteiros (PYG). USD e BRL são exibidos/cobrados
// convertendo pela taxa manual do estabelecimento (PYG por 1 unidade).
import type { Currency } from "./types";

export const MINOR_UNITS: Record<Currency, number> = { PYG: 1, USD: 100, BRL: 100 };

export type Rates = { USD: number; BRL: number };

export function rateFor(currency: Currency, rates: Rates): number {
  return currency === "PYG" ? 1 : rates[currency];
}

/**
 * Converte guaraníes para a moeda alvo, em unidade menor (centavos).
 * Arredonda PARA CIMA, para o estabelecimento nunca receber menos que o preço em Gs.
 */
export function pygToMinor(amountPyg: number, currency: Currency, rates: Rates): number {
  if (currency === "PYG") return Math.round(amountPyg);
  const rate = rateFor(currency, rates);
  if (!(rate > 0)) throw new Error(`Taxa de câmbio inválida para ${currency}`);
  return Math.ceil((amountPyg / rate) * MINOR_UNITS[currency] - 1e-9);
}

/** Converte unidade menor da moeda para guaraníes (arredonda para baixo). */
export function minorToPyg(amountMinor: number, currency: Currency, rates: Rates): number {
  if (currency === "PYG") return Math.round(amountMinor);
  return Math.floor((amountMinor / MINOR_UNITS[currency]) * rateFor(currency, rates) + 1e-9);
}

/** Troco (vuelto) em guaraníes quando o cliente paga em dinheiro com `tenderedMinor`. */
export function changeDuePyg(
  totalPyg: number,
  tenderedMinor: number,
  currency: Currency,
  rates: Rates,
): number {
  const tenderedPyg = minorToPyg(tenderedMinor, currency, rates);
  return Math.max(0, tenderedPyg - totalPyg);
}

const fmtPyg = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatPyg(amountPyg: number): string {
  return `Gs. ${fmtPyg.format(amountPyg)}`;
}

export function formatMinor(amountMinor: number, currency: Currency): string {
  if (currency === "PYG") return formatPyg(amountMinor);
  const value = amountMinor / MINOR_UNITS[currency];
  return `${currency === "USD" ? "US$" : "R$"} ${fmt2.format(value)}`;
}

/** Aceita "12,50" ou "12.50" e devolve unidade menor. */
export function parseMajorToMinor(input: string, currency: Currency): number | null {
  const n = Number(String(input).replace(/\./g, currency === "PYG" ? "" : ".").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * MINOR_UNITS[currency]);
}
