// Cliente HTTP do Open Delivery (chamadas da GoWeb → API do app de delivery).
// Token OAuth2 client_credentials (form-urlencoded), escopo único "od.all"; Keeta exige X-App-Signature
// (HMAC-SHA256 do corpo com o client secret) em toda chamada — ligado por canal em `signRequests`.
import { odSign } from "@/core/opendelivery";
import { sandboxBlocks } from "@/lib/sandbox";

export class OdHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type OdCreds = { baseUrl: string; clientId: string; clientSecret: string; signRequests: boolean; merchantId: string; appId?: string | null };

export const isLocal = (u: URL) => u.hostname === "localhost" || u.hostname === "127.0.0.1";
const trim = (u: string) => u.replace(/\/+$/, "");
const TIMEOUT = 15_000;

async function readError(res: Response) {
  const txt = await res.text().catch(() => "");
  try {
    const j = JSON.parse(txt);
    return String(j.title || j.message || j.error_description || j.error || txt).slice(0, 300);
  } catch {
    return txt.slice(0, 300) || res.statusText;
  }
}

/** POST /oauth/token → { token, expiresIn (s) } */
export async function odToken(c: OdCreds): Promise<{ token: string; expiresIn: number }> {
  if (sandboxBlocks("delivery", null, "oauth")) throw new OdHttpError(503, "Ambiente de teste: apps de delivery desligados (99Food/Keeta reais não são chamados).");
  const body = new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "client_credentials" }).toString();
  const res = await fetch(`${trim(c.baseUrl)}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...(c.signRequests ? { "X-App-Signature": odSign(body, c.clientSecret) } : {}) },
    body,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new OdHttpError(res.status, `Falha ao autenticar no app (${res.status}): ${await readError(res)}`);
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; accessToken?: string; expires_in?: number; expiresIn?: number };
  const token = j.access_token ?? j.accessToken;
  if (!token) throw new OdHttpError(502, "O app não devolveu o token de acesso");
  return { token, expiresIn: Number(j.expires_in ?? j.expiresIn ?? 3600) || 3600 };
}

/** Chamada autenticada. Devolve o JSON (ou null em 202/204). */
export async function odCall<T = unknown>(
  c: OdCreds,
  token: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; data: T | null }> {
  if (sandboxBlocks("delivery", null, `${method} ${path.split("?")[0]}`)) throw new OdHttpError(503, "Ambiente de teste: apps de delivery desligados (99Food/Keeta reais não são chamados).");
  const body = opts.body === undefined ? (method === "GET" ? undefined : "") : JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/json",
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
    ...(c.signRequests ? { "X-App-Signature": odSign(body ?? "", c.clientSecret) } : {}),
    ...(c.appId ? { "X-App-Id": c.appId } : {}),
    ...opts.headers,
  };
  const url = /^https?:\/\//.test(path) ? path : `${trim(c.baseUrl)}${path}`;
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT) });
  if (res.status === 202 || res.status === 204) return { status: res.status, data: null };
  if (!res.ok) throw new OdHttpError(res.status, `${method} ${path.split("?")[0]} → ${res.status}: ${await readError(res)}`);
  const txt = await res.text();
  return { status: res.status, data: txt ? (JSON.parse(txt) as T) : null };
}

/** Busca um recurso por URL absoluta (orderURL dos eventos), com o mesmo token. */
export async function odGetUrl<T = unknown>(c: OdCreds, token: string, url: string): Promise<T> {
  const base = trim(c.baseUrl);
  // segurança: só segue URLs do próprio app (mesmo host da API)
  const u = new URL(url, base);
  if (u.host !== new URL(base).host) throw new OdHttpError(400, "orderURL fora do domínio do app");
  if (u.protocol !== "https:" && !isLocal(u)) throw new OdHttpError(400, "orderURL precisa ser HTTPS");
  const { data } = await odCall<T>(c, token, "GET", u.toString());
  if (!data) throw new OdHttpError(404, "Pedido não encontrado no app");
  return data;
}
