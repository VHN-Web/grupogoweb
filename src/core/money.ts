// Dinheiro multi-moeda. Regras puras (sem I/O) — fáceis de testar.
//
// Cada estabelecimento tem uma MOEDA BASE (tenant.currency: PYG no Paraguai, BRL no Brasil).
// Preços, totais, caixa e delivery ficam na moeda base, em UNIDADE MENOR
// (guaraní inteiro; centavos de real/dólar). As colunas antigas chamadas *_pyg/*Pyg
// guardam esse valor na moeda base do estabelecimento (nome histórico).
// Outras moedas são cobradas convertendo pela cotação manual do estabelecimento.
import type { Currency } from "./types";

export const MINOR_UNITS: Record<Currency, number> = { PYG: 1, USD: 100, BRL: 100 };

/** Quantas unidades (maiores) da moeda base vale 1 unidade de cada moeda. rates[base] = 1. */
export type Rates = Record<Currency, number>;

export function rateFor(currency: Currency, base: Currency, rates: Rates): number {
  return currency === base ? 1 : rates[currency];
}

/**
 * Converte um valor da moeda base para a moeda alvo (unidade menor).
 * Arredonda PARA CIMA: o estabelecimento nunca recebe menos que o preço.
 */
export function fromBase(amountBaseMinor: number, base: Currency, target: Currency, rates: Rates): number {
  if (target === base) return Math.round(amountBaseMinor);
  const rate = rateFor(target, base, rates);
  if (!(rate > 0)) throw new Error(`Taxa de câmbio inválida para ${target}`);
  const baseMajor = amountBaseMinor / MINOR_UNITS[base];
  return Math.ceil((baseMajor / rate) * MINOR_UNITS[target] - 1e-9);
}

/** Converte um valor em outra moeda (unidade menor) para a moeda base (arredonda para baixo). */
export function toBase(amountMinor: number, currency: Currency, base: Currency, rates: Rates): number {
  if (currency === base) return Math.round(amountMinor);
  const major = amountMinor / MINOR_UNITS[currency];
  return Math.floor(major * rateFor(currency, base, rates) * MINOR_UNITS[base] + 1e-9);
}

/** Troco, na moeda base, quando o cliente paga em dinheiro com `tenderedMinor` na moeda `currency`. */
export function changeDue(totalBaseMinor: number, tenderedMinor: number, currency: Currency, base: Currency, rates: Rates): number {
  return Math.max(0, toBase(tenderedMinor, currency, base, rates) - totalBaseMinor);
}

const fmt0 = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const CURRENCY_SYMBOL: Record<Currency, string> = { PYG: "Gs.", USD: "US$", BRL: "R$" };

export function formatMoney(amountMinor: number, currency: Currency): string {
  if (currency === "PYG") return `Gs. ${fmt0.format(amountMinor)}`;
  return `${CURRENCY_SYMBOL[currency]} ${fmt2.format(amountMinor / MINOR_UNITS[currency])}`;
}

/** Atalhos usados no billing da plataforma e em telas antigas. */
export const formatMinor = formatMoney;
export function formatPyg(amountPyg: number): string {
  return formatMoney(amountPyg, "PYG");
}

/** Aceita "12,50", "12.50" ou "100.000" (PYG) e devolve unidade menor. */
export function parseMajorToMinor(input: string, currency: Currency): number | null {
  const s = String(input).trim();
  if (!s) return null;
  let norm: string;
  if (currency === "PYG") norm = s.replace(/[.\s]/g, "").replace(",", ".");
  else if (s.includes(",")) norm = s.replace(/\./g, "").replace(",", ".");
  else norm = s;
  const n = Number(norm);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * MINOR_UNITS[currency]);
}

/** Valor (minor) → texto editável em unidade maior: PYG "125000", BRL "12,50". */
export function minorToInput(amountMinor: number | null | undefined, currency: Currency): string {
  if (amountMinor == null) return "";
  const m = MINOR_UNITS[currency];
  if (m === 1) return String(amountMinor);
  return (amountMinor / m).toFixed(2).replace(".", ",");
}
