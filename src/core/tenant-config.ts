// Configuração white-label por estabelecimento, guardada como JSON no tenant.
// O estabelecimento só ajusta isto (+ nome, logo, cor) — o resto do SaaS é igual para todos.
import { z } from "zod";
import { CURRENCIES, PAYMENT_METHODS } from "./types";

export const paymentOptionSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  /** id de um adapter registrado em src/adapters/payments/registry.ts */
  provider: z.string(),
  enabled: z.boolean().default(true),
  /** Moedas aceitas para este método */
  currencies: z.array(z.enum(CURRENCIES)).default(["PYG"]),
});

export const paymentConfigSchema = z.object({
  options: z.array(paymentOptionSchema).default([]),
  /** Chave Pix (para turistas brasileiros), exibida pelo adapter pix_manual */
  pixKey: z.string().optional(),
  pixHolder: z.string().optional(),
  /** Dados de transferência bancária (PY) */
  bankInfo: z.string().optional(),
  /** Credenciais por gateway (ex: { bancard: { publicKey, privateKey } }) — nunca enviar ao browser */
  credentials: z.record(z.string(), z.record(z.string(), z.string())).default({}),
});
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;
export type PaymentOption = z.infer<typeof paymentOptionSchema>;

export const fiscalConfigSchema = z.object({
  /** id de um adapter em src/adapters/fiscal/registry.ts */
  provider: z.string().default("manual"),
  /** Emitir documento automaticamente quando o pedido for pago */
  autoIssue: z.boolean().default(false),
  timbrado: z.string().optional(),
  establishment: z.string().default("001"),
  expeditionPoint: z.string().default("001"),
});
export type FiscalConfig = z.infer<typeof fiscalConfigSchema>;

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  options: [
    { method: "CASH", provider: "cash", enabled: true, currencies: ["PYG", "USD", "BRL"] },
    { method: "CARD", provider: "pos", enabled: true, currencies: ["PYG"] },
    { method: "PIX", provider: "pix_manual", enabled: true, currencies: ["BRL"] },
    { method: "TRANSFER", provider: "transfer_manual", enabled: false, currencies: ["PYG"] },
  ],
  credentials: {},
};

function safeJson(s: string | null | undefined): unknown {
  try {
    return s ? JSON.parse(s) : {};
  } catch {
    return {};
  }
}

export function parsePaymentConfig(raw: string | null | undefined): PaymentConfig {
  const r = paymentConfigSchema.safeParse(safeJson(raw));
  if (!r.success) return DEFAULT_PAYMENT_CONFIG;
  if (r.data.options.length === 0) return { ...r.data, options: DEFAULT_PAYMENT_CONFIG.options };
  return r.data;
}

export function parseFiscalConfig(raw: string | null | undefined): FiscalConfig {
  const r = fiscalConfigSchema.safeParse(safeJson(raw));
  return r.success ? r.data : fiscalConfigSchema.parse({});
}

/** Versão segura para enviar ao navegador (sem credenciais). */
export function publicPaymentConfig(cfg: PaymentConfig) {
  return {
    // Gateway online sem credencial não aparece para o cliente (evita pedido que não consegue pagar)
    options: cfg.options.filter((o) => o.enabled && (o.provider !== "mercadopago" || !!cfg.credentials.mercadopago?.accessToken)),
    pixKey: cfg.pixKey,
    pixHolder: cfg.pixHolder,
    bankInfo: cfg.bankInfo,
  };
}
export type PublicPaymentConfig = ReturnType<typeof publicPaymentConfig>;
