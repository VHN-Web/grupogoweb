// Regras puras de cobrança da plataforma (seus clientes). Sem I/O — testadas em billing.test.ts.
import type { BillingInterval, Currency } from "./types";

export type Amounts = Record<Currency, number>; // unidade menor de cada moeda

export type PlanPrices = {
  interval: BillingInterval;
  pricePyg: number;
  priceUsdMinor: number;
  priceBrlMinor: number;
  setupPyg: number;
  setupUsdMinor: number;
  setupBrlMinor: number;
  includesDomain: boolean;
};

export type DomainPrices = { domainPricePyg: number; domainPriceUsdMinor: number; domainPriceBrlMinor: number };

export const zero = (): Amounts => ({ PYG: 0, USD: 0, BRL: 0 });
export const add = (a: Amounts, b: Amounts): Amounts => ({ PYG: a.PYG + b.PYG, USD: a.USD + b.USD, BRL: a.BRL + b.BRL });

export function planPrice(p: PlanPrices): Amounts {
  return { PYG: p.pricePyg, USD: p.priceUsdMinor, BRL: p.priceBrlMinor };
}
export function domainPrice(s: DomainPrices): Amounts {
  return { PYG: s.domainPricePyg, USD: s.domainPriceUsdMinor, BRL: s.domainPriceBrlMinor };
}

/** Domínio é cobrado só se o cliente quer e o plano NÃO inclui (anual inclui grátis). */
export function chargesDomain(plan: PlanPrices, wantsDomain: boolean) {
  return wantsDomain && !plan.includesDomain;
}

/** Valor da fatura de implantação = taxa de implantação (+ domínio do 1º ano, se aplicável). */
export function setupAmounts(plan: PlanPrices, wantsDomain: boolean, s: DomainPrices): Amounts {
  const setup = { PYG: plan.setupPyg, USD: plan.setupUsdMinor, BRL: plan.setupBrlMinor };
  return chargesDomain(plan, wantsDomain) ? add(setup, domainPrice(s)) : setup;
}

export function isZero(a: Amounts) {
  return a.PYG === 0 && a.USD === 0 && a.BRL === 0;
}

/** Soma 1 mês ou 1 ano, preservando o dia (31/01 + 1 mês = 28/29 fev). */
export function addInterval(date: Date, interval: BillingInterval, times = 1): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  if (interval === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + times);
  else d.setUTCFullYear(d.getUTCFullYear() + times);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 864e5);
}

export function daysOverdue(dueAt: Date, now: Date) {
  return Math.floor((now.getTime() - dueAt.getTime()) / 864e5);
}

/** Situação de cobrança dada a fatura vencida mais antiga em aberto. */
export function dunningState(oldestOpenDueAt: Date | null, now: Date, graceDays: number): "OK" | "PAST_DUE" | "SUSPEND" {
  if (!oldestOpenDueAt || oldestOpenDueAt.getTime() > now.getTime()) return "OK";
  return daysOverdue(oldestOpenDueAt, now) >= graceDays ? "SUSPEND" : "PAST_DUE";
}

/** Deve gerar a próxima fatura agora? (X dias antes do vencimento) */
export function shouldInvoice(nextBillingAt: Date | null, now: Date, daysBefore: number) {
  return !!nextBillingAt && addDays(now, daysBefore).getTime() >= nextBillingAt.getTime();
}

export function amountIn(inv: { amountPyg: number; amountUsdMinor: number; amountBrlMinor: number }, c: Currency) {
  return c === "PYG" ? inv.amountPyg : c === "USD" ? inv.amountUsdMinor : inv.amountBrlMinor;
}

export function randomPassword(length = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Asuncion" }).format(d);
}
