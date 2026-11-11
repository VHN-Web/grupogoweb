// =============================================================================
// Asaas API v3 — cliente HTTP (conta principal da GoWeb e subcontas dos lojistas)
// =============================================================================
// Autenticação: header `access_token` com a chave da conta (principal ou subconta).
// ASAAS_API_BASE (env) só para testes locais com um Asaas simulado.
// Nunca registrar a chave em log.
// =============================================================================
import { ASAAS_BASE, type AsaasEnv } from "@/core/asaas";
import { assertTestCredential } from "@/lib/sandbox";

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export type AsaasAuth = { env: AsaasEnv; apiKey: string };

const base = (env: AsaasEnv) => (process.env.ASAAS_API_BASE ?? ASAAS_BASE[env]).replace(/\/$/, "");

export async function asaas<T = Record<string, unknown>>(auth: AsaasAuth, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  if (!auth.apiKey) throw new AsaasError("Asaas não configurado", 0, "not_configured");
  // prévia (homologação): só conta sandbox do Asaas — nunca cobra nem cria subconta de verdade
  try {
    assertTestCredential("asaas", auth.env);
  } catch {
    throw new AsaasError("Ambiente de teste: use uma conta sandbox do Asaas (a da produção fica bloqueada).", 0, "sandbox");
  }
  let res: Response;
  try {
    res = await fetch(`${base(auth.env)}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { access_token: auth.apiKey, "content-type": "application/json", "user-agent": "GoWeb" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
    });
  } catch {
    throw new AsaasError("Não foi possível falar com o Asaas agora.", 0, "network");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const err = (data as { errors?: { code?: string; description?: string }[] } | null)?.errors?.[0];
    if (res.status === 401) throw new AsaasError("Chave do Asaas inválida ou sem permissão.", 401, "unauthorized");
    throw new AsaasError(err?.description ?? `Asaas respondeu ${res.status}.`, res.status, err?.code);
  }
  return data as T;
}

// ---------------- tipos usados
export type AsaasPayment = {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType: string;
  invoiceUrl?: string;
  externalReference?: string | null;
  creditCard?: { creditCardNumber?: string; creditCardBrand?: string; creditCardToken?: string } | null;
};

// ---------------- conta
export const myAccount = (a: AsaasAuth) => asaas<{ name?: string; email?: string; cpfCnpj?: string }>(a, "/myAccount/commercialInfo");
export const wallets = (a: AsaasAuth) => asaas<{ data: { id: string }[] }>(a, "/wallets");
export const balance = (a: AsaasAuth) => asaas<{ balance: number }>(a, "/finance/balance");
export const accountStatus = (a: AsaasAuth) => asaas<{ general?: string; commercialInfo?: string; bankAccountInfo?: string; documentation?: string }>(a, "/myAccount/status");
export const accountDocuments = (a: AsaasAuth) =>
  asaas<{ data?: { id: string; title?: string; status?: string; onboardingUrl?: string | null }[] }>(a, "/myAccount/documents");

// ---------------- webhooks
export const WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
] as const;

export function webhookSpec(url: string, email: string, authToken: string) {
  return { name: "GoWeb", url, email, enabled: true, interrupted: false, apiVersion: 3, authToken, sendType: "SEQUENTIALLY", events: [...WEBHOOK_EVENTS] };
}
export const createWebhook = (a: AsaasAuth, spec: ReturnType<typeof webhookSpec>) => asaas<{ id: string }>(a, "/webhooks", { body: spec });
export const updateWebhook = (a: AsaasAuth, id: string, spec: ReturnType<typeof webhookSpec>) => asaas<{ id: string }>(a, `/webhooks/${encodeURIComponent(id)}`, { method: "PUT", body: spec });

// ---------------- clientes / cobranças
export async function ensureCustomer(a: AsaasAuth, c: { name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference?: string }) {
  const doc = c.cpfCnpj.replace(/\D/g, "");
  const found = await asaas<{ data: { id: string }[] }>(a, `/customers?cpfCnpj=${doc}&limit=1`);
  if (found.data?.[0]?.id) return found.data[0].id;
  const created = await asaas<{ id: string }>(a, "/customers", {
    body: { name: c.name, cpfCnpj: doc, email: c.email ?? undefined, mobilePhone: c.mobilePhone ?? undefined, externalReference: c.externalReference, notificationDisabled: true },
  });
  return created.id;
}

export type NewPayment = {
  customer: string;
  billingType: "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED";
  value: number; // reais
  dueDate: string; // AAAA-MM-DD
  description?: string;
  externalReference?: string;
  creditCardToken?: string;
  remoteIp?: string;
  split?: { walletId: string; fixedValue: number }[];
};
export const createPayment = (a: AsaasAuth, p: NewPayment) => asaas<AsaasPayment>(a, "/payments", { body: p, timeoutMs: 60_000 });
export const getPayment = (a: AsaasAuth, id: string) => asaas<AsaasPayment>(a, `/payments/${encodeURIComponent(id)}`);
export const deletePayment = (a: AsaasAuth, id: string) => asaas(a, `/payments/${encodeURIComponent(id)}`, { method: "DELETE" });
export const pixQrCode = (a: AsaasAuth, id: string) => asaas<{ encodedImage: string; payload: string; expirationDate?: string }>(a, `/payments/${encodeURIComponent(id)}/pixQrCode`);

// ---------------- subcontas
export type NewSubaccount = {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string;
  companyType?: string;
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  postalCode: string;
  webhooks?: ReturnType<typeof webhookSpec>[];
};
export const createSubaccount = (a: AsaasAuth, s: NewSubaccount) => asaas<{ id: string; walletId: string; apiKey: string }>(a, "/accounts", { body: s, timeoutMs: 60_000 });

// ---------------- repasse do saldo da subconta para a chave Pix do lojista
export const transferPix = (a: AsaasAuth, t: { value: number; pixAddressKey: string; pixAddressKeyType: string; description?: string }) =>
  asaas<{ id: string; status: string }>(a, "/transfers", { body: { ...t, operationType: "PIX" } });
