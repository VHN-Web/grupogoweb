// Regiões atendidas: cada estabelecimento tem um país, que define idioma, moeda base,
// formato de telefone, rótulos fiscais e padrões (cotações, delivery, meios de pagamento).
import type { Currency, PaymentMethod } from "./types";

export const COUNTRIES = ["PY", "BR"] as const;
export type Country = (typeof COUNTRIES)[number];
export type Locale = "es" | "pt";

export type PhoneRule = {
  country: string; // ISO
  label: string;
  dial: string; // código do país, sem "+"
  /** Dígitos do número nacional (com DDD/código de área, sem 0 inicial) */
  length: number;
  /** Validação extra do número nacional */
  pattern: RegExp;
  placeholder: string;
  hint: { es: string; pt: string };
};

export const PHONE_RULES: Record<string, PhoneRule> = {
  PY: {
    country: "PY",
    label: "Paraguay",
    dial: "595",
    length: 9,
    pattern: /^9\d{8}$/, // celular: 9XX XXX XXX (o 0 inicial é removido)
    placeholder: "981 123 456",
    hint: { es: "Celular de 9 dígitos (sin el 0)", pt: "Celular de 9 dígitos (sem o 0)" },
  },
  BR: {
    country: "BR",
    label: "Brasil",
    dial: "55",
    length: 11,
    pattern: /^[1-9][1-9]9\d{8}$/, // DDD (2) + 9 + 8 dígitos
    placeholder: "11 91234 5678",
    hint: { es: "DDD + celular (11 dígitos)", pt: "DDD + celular (11 dígitos)" },
  },
  AR: {
    country: "AR",
    label: "Argentina",
    dial: "54",
    length: 10,
    pattern: /^[1-9]\d{9}$/, // código de área + número, sin 0 ni 15
    placeholder: "11 2345 6789",
    hint: { es: "Código de área + número (10 dígitos, sin 0 ni 15)", pt: "Código de área + número (10 dígitos)" },
  },
};

export const PHONE_COUNTRIES = Object.keys(PHONE_RULES);

export type RegionConfig = {
  country: Country;
  name: { es: string; pt: string };
  locale: Locale;
  currency: Currency;
  /** Moedas aceitas por padrão (além da base) */
  extraCurrencies: Currency[];
  /** Cotações padrão: unidades da moeda base por 1 unidade da moeda */
  defaultRates: { USD: number; BRL: number; PYG: number };
  delivery: { baseFee: number; perKm: number; freeOver: number | null }; // em unidade menor da base
  payments: { method: PaymentMethod; provider: string; enabled: boolean; currencies: Currency[] }[];
  timeZone: string;
  intlLocale: string;
  taxDocLabel: { es: string; pt: string };
  /** Documento do estabelecimento/cliente: RUC (PY) · CNPJ/CPF (BR) */
  taxIdLabel: string;
};

export const REGIONS: Record<Country, RegionConfig> = {
  PY: {
    country: "PY",
    name: { es: "Paraguay", pt: "Paraguai" },
    locale: "es",
    currency: "PYG",
    extraCurrencies: ["USD", "BRL"],
    defaultRates: { USD: 7300, BRL: 1300, PYG: 1 },
    delivery: { baseFee: 5000, perKm: 2000, freeOver: null },
    payments: [
      { method: "CASH", provider: "cash", enabled: true, currencies: ["PYG", "USD", "BRL"] },
      { method: "CARD", provider: "pos", enabled: true, currencies: ["PYG"] },
      { method: "PIX", provider: "pix_manual", enabled: true, currencies: ["BRL"] },
      { method: "TRANSFER", provider: "transfer_manual", enabled: false, currencies: ["PYG"] },
    ],
    timeZone: "America/Asuncion",
    intlLocale: "es-PY",
    taxDocLabel: { es: "Facturas", pt: "Notas fiscais" },
    taxIdLabel: "RUC",
  },
  BR: {
    country: "BR",
    name: { es: "Brasil", pt: "Brasil" },
    locale: "pt",
    currency: "BRL",
    extraCurrencies: [],
    defaultRates: { USD: 5.5, BRL: 1, PYG: 0.00075 },
    delivery: { baseFee: 500, perKm: 200, freeOver: null },
    payments: [
      { method: "PIX", provider: "pix_manual", enabled: true, currencies: ["BRL"] },
      { method: "CARD", provider: "pos", enabled: true, currencies: ["BRL"] },
      { method: "CASH", provider: "cash", enabled: true, currencies: ["BRL"] },
      { method: "TRANSFER", provider: "transfer_manual", enabled: false, currencies: ["BRL"] },
    ],
    timeZone: "America/Sao_Paulo",
    intlLocale: "pt-BR",
    taxDocLabel: { es: "Notas fiscales", pt: "Notas fiscais" },
    taxIdLabel: "CNPJ / CPF",
  },
};

export function getRegion(country: string | null | undefined): RegionConfig {
  return REGIONS[(country as Country) ?? "PY"] ?? REGIONS.PY;
}

/** Cotações do estabelecimento no formato de money.ts (base = 1). */
export function tenantRates(t: { currency: string; rateUsd: number; rateBrl: number; ratePyg: number }) {
  const base = t.currency as Currency;
  return {
    PYG: base === "PYG" ? 1 : t.ratePyg,
    USD: base === "USD" ? 1 : t.rateUsd,
    BRL: base === "BRL" ? 1 : t.rateBrl,
  };
}

// ---------------------------------------------------------------- idioma

/** Tradução inline: T("Texto en español", "Texto em português"). */
export function tr(locale: Locale) {
  return (es: string, pt: string) => (locale === "pt" ? pt : es);
}

/** Idioma do visitante pela região (header da Vercel) ou pelo navegador. */
export function detectLocale(headers: { get(name: string): string | null }): Locale {
  const forced = headers.get("x-gw-lang");
  if (forced === "pt" || forced === "es") return forced;
  const country = headers.get("x-vercel-ip-country")?.toUpperCase();
  if (country === "BR" || country === "PT") return "pt";
  if (country) return "es";
  const lang = headers.get("accept-language")?.toLowerCase() ?? "";
  return lang.startsWith("pt") ? "pt" : "es";
}

// ---------------------------------------------------------------- validação de nome e telefone

/** Remove tudo que não for letra (com acentos), espaço, apóstrofo ou hífen. */
export function sanitizeName(input: string): string {
  return input.replace(/[^\p{L}\s'’-]/gu, "").replace(/\s{2,}/g, " ").slice(0, 60);
}

export function isValidName(input: string): boolean {
  const s = input.trim();
  return s.length >= 2 && /^[\p{L}][\p{L}\s'’-]*$/u.test(s);
}

/** Só dígitos; remove o 0 inicial (tronco) e corta no limite do país. */
export function sanitizePhone(input: string, country: string): string {
  const rule = PHONE_RULES[country] ?? PHONE_RULES.PY;
  return input.replace(/\D/g, "").replace(/^0+/, "").slice(0, rule.length);
}

export function isValidPhone(national: string, country: string): boolean {
  const rule = PHONE_RULES[country];
  return !!rule && national.length === rule.length && rule.pattern.test(national);
}

/** Formato internacional E.164 (+5959...). */
export function toE164(national: string, country: string): string {
  const rule = PHONE_RULES[country] ?? PHONE_RULES.PY;
  return `+${rule.dial}${national}`;
}

/** Valida um telefone já em E.164 vindo do navegador. */
export function isValidE164(phone: string): boolean {
  const m = /^\+(\d+)$/.exec(phone);
  if (!m) return false;
  return Object.values(PHONE_RULES).some((r) => m[1].startsWith(r.dial) && isValidPhone(m[1].slice(r.dial.length), r.country));
}

/** Formata para exibição: +55 11 91234-5678 / +595 981 123 456. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const rule = Object.values(PHONE_RULES).find((r) => e164.startsWith(`+${r.dial}`));
  if (!rule) return e164;
  const n = e164.slice(rule.dial.length + 1);
  if (rule.country === "BR") return `+55 ${n.slice(0, 2)} ${n.slice(2, 7)}-${n.slice(7)}`;
  if (rule.country === "PY") return `+595 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  return `+${rule.dial} ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
}

// ---------------------------------------------------------------- CPF (Brasil)
/** Valida CPF pelos dígitos verificadores. Aceita com ou sem pontuação. */
export function isValidCpf(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** 12345678909 -> 123.456.789-09 (formata parcialmente enquanto digita). */
export function formatCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}
