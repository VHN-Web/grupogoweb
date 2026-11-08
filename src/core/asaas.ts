// Asaas (Brasil) — regras puras do billing híbrido: split com trava de teto, ciclo de 30 dias,
// saldo residual e carência. Sem I/O. Testado em asaas.test.ts.
// Valores em CENTAVOS (inteiros); o Asaas recebe reais com 2 casas (toReais).

export type AsaasEnv = "sandbox" | "production";

export type AsaasConfig = {
  env: AsaasEnv;
  apiKeySealed: string; // chave da conta principal (selada)
  walletId: string; // carteira da plataforma (destino do split)
  accountName: string; // nome da conta principal (conferência)
  webhookToken: string; // enviado pelo Asaas no header asaas-access-token
  webhookId: string; // webhook criado na conta principal
  hybridEnabled: boolean; // liga o abatimento da mensalidade por split
  defaultSplitPct: number; // % padrão por venda
  graceDays: number; // dias após o fim do ciclo para pagar o residual
};

export const DEFAULT_ASAAS: AsaasConfig = {
  env: "sandbox",
  apiKeySealed: "",
  walletId: "",
  accountName: "",
  webhookToken: "",
  webhookId: "",
  hybridEnabled: false,
  defaultSplitPct: 5,
  graceDays: 7,
};

export function parseAsaasConfig(raw: string | null | undefined): AsaasConfig {
  let o: Record<string, unknown> = {};
  try {
    o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {}
  const str = (k: keyof AsaasConfig) => (typeof o[k] === "string" ? (o[k] as string) : (DEFAULT_ASAAS[k] as string));
  const num = (k: keyof AsaasConfig, min: number, max: number) => {
    const v = Number(o[k]);
    return Number.isFinite(v) && v >= min && v <= max ? v : (DEFAULT_ASAAS[k] as number);
  };
  return {
    env: o.env === "production" ? "production" : "sandbox",
    apiKeySealed: str("apiKeySealed"),
    walletId: str("walletId"),
    accountName: str("accountName"),
    webhookToken: str("webhookToken"),
    webhookId: str("webhookId"),
    hybridEnabled: o.hybridEnabled === true,
    defaultSplitPct: num("defaultSplitPct", 0, 50),
    graceDays: Math.round(num("graceDays", 1, 30)),
  };
}

export const ASAAS_BASE: Record<AsaasEnv, string> = {
  production: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
};

export const toReais = (minor: number) => Math.round(minor) / 100;
export const fromReais = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0);

/**
 * Split da venda que vai para a carteira da plataforma (centavos).
 * faltante = mensalidade − já abatido (confirmado) − reservado (vendas ainda não pagas do ciclo).
 * Trava de teto: nunca passa do faltante; abaixo de 1 centavo não manda split.
 */
export function splitForSale(i: { targetMinor: number; amortizedMinor: number; reservedMinor?: number; saleMinor: number; pct: number }) {
  const missing = i.targetMinor - i.amortizedMinor - (i.reservedMinor ?? 0);
  if (missing <= 0 || i.saleMinor <= 0 || i.pct <= 0) return 0;
  const calc = Math.floor((i.saleMinor * i.pct) / 100);
  return Math.max(0, Math.min(calc, missing));
}

const DAY = 86_400_000;
export const CYCLE_DAYS = 30;

/** Limites do ciclo: começa na entrega/renovação, fecha 30 dias depois, suspende após a carência. */
export function cycleBounds(start: Date, graceDays: number) {
  const end = new Date(start.getTime() + CYCLE_DAYS * DAY);
  return { startAt: start, endAt: end, graceEndAt: new Date(end.getTime() + graceDays * DAY) };
}

/** Fechamento: quanto falta pagar e o próximo status. */
export function closeCycle(targetMinor: number, amortizedMinor: number) {
  const residual = Math.max(0, targetMinor - amortizedMinor);
  return { residualMinor: residual, status: residual === 0 ? ("PAID_BY_SPLIT" as const) : ("AWAITING_RESIDUAL" as const) };
}

/** Evento do Asaas → situação do pagamento do pedido. null = evento que não muda nada. */
export function orderStatusFromEvent(event: string): "PAID" | "REFUNDED" | "FAILED" | null {
  if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") return "PAID";
  if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_CHARGEBACK_REQUESTED" || event === "PAYMENT_PARTIALLY_REFUNDED") return "REFUNDED";
  if (event === "PAYMENT_DELETED" || event === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED" || event === "PAYMENT_REPROVED_BY_RISK_ANALYSIS") return "FAILED";
  return null;
}

/** Valida CNPJ (dígitos verificadores). */
export function isValidCnpj(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, x, i) => a + x * Number(d[i]), 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Valida CPF (dígitos verificadores). */
export function isValidCpfDigits(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export const isValidDoc = (raw: string) => isValidCpfDigits(raw) || isValidCnpj(raw);

export const COMPANY_TYPES = [
  { id: "MEI", label: "MEI" },
  { id: "LIMITED", label: "LTDA / SLU" },
  { id: "INDIVIDUAL", label: "Empresário individual (EI)" },
  { id: "ASSOCIATION", label: "Associação" },
] as const;

/** Tipo da chave Pix (para o repasse do saldo da subconta). */
export function pixKeyType(raw: string): "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP" | null {
  const v = raw.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return "EVP";
  const d = v.replace(/\D/g, "");
  if (/^\+?55\d{10,11}$/.test(v.replace(/[\s()-]/g, ""))) return "PHONE";
  if (isValidCpfDigits(d) && d.length === v.replace(/[.\-\s]/g, "").length) return "CPF";
  if (isValidCnpj(d)) return "CNPJ";
  return null;
}
