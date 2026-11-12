// Instagram (Direct) — API oficial da Meta "Instagram API with Instagram Login".
// Conta institucional da GoWeb + contas dos lojistas GoInteligence (validado no servidor, nunca só na tela).
// Regras PURAS: quem pode usar, login OAuth (URL, state), tokens (renovação), leitura dos webhooks, janela de 24 h.
// Docs: developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
import { createHmac, timingSafeEqual } from "node:crypto";

/** Permissões pedidas no login da Geovana (só mensagens: nada de publicar ou ler comentários). */
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;

/** Assessoria GoWeb (autonomia): publicar posts do calendário. Pedido só nesse login, depois da aprovação da Meta. */
export const IG_PUBLISH_SCOPE = "instagram_business_content_publish";

/** Permissões do login: mensagens (Geovana) e/ou publicação (Assessoria). O básico vai sempre. */
export function loginScopes(o: { messages: boolean; publish: boolean }): string[] {
  return ["instagram_business_basic", ...(o.messages ? ["instagram_business_manage_messages"] : []), ...(o.publish ? [IG_PUBLISH_SCOPE] : [])];
}

/** A IA só responde dentro de 24 h da última mensagem do cliente; nunca inicia conversa nem usa a janela humana de 7 dias. */
export const IG_WINDOW_MS = 24 * 3600_000;

/** Token de longa duração vale 60 dias; renova com 10 dias de folga (e só depois de 24 h de vida, regra da Meta). */
export const IG_REFRESH_BEFORE_MS = 10 * 86_400_000;
export const IG_MIN_TOKEN_AGE_MS = 24 * 3600_000;

/** Texto até 1.000 bytes (limite da Meta). Corta em UTF-8 sem quebrar caractere. */
export const IG_MAX_TEXT_BYTES = 1000;

export type IgScope = "goweb" | { tenantId: string };

// ---------------------------------------------------------------- quem pode usar
export type IgTenant = { tier: string | null; demo: boolean; country: string; status?: string | null };

/** Contas dos clientes: só GoInteligence (tier "pro"), nunca demo. Conferido no login, no webhook e em cada envio. */
export function instagramAllowed(t: IgTenant): { ok: true } | { ok: false; reason: string } {
  const pt = t.country !== "PY";
  if (t.demo) return { ok: false, reason: pt ? "Lojas de demonstração não conectam o Instagram." : "Las tiendas de demostración no conectan Instagram." };
  if (t.tier !== "pro") return { ok: false, reason: pt ? "O Instagram com a Geovana faz parte do plano GoInteligence." : "Instagram con la Geovana es parte del plan GoInteligence." };
  return { ok: true };
}

// ---------------------------------------------------------------- login (OAuth)
export function igAuthUrl(o: { appId: string; redirectUri: string; state: string; scopes?: readonly string[] }) {
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", o.appId);
  u.searchParams.set("redirect_uri", o.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", (o.scopes ?? IG_SCOPES).join(","));
  u.searchParams.set("enable_fb_login", "0");
  u.searchParams.set("state", o.state);
  return u.toString();
}

// ---------------------------------------------------------------- login unificado (apps novos da Meta)
/**
 * Apps criados a partir de 2026 não têm mais o "login do Instagram" separado: a Meta obriga o "login unificado"
 * (Login do Facebook para Empresas com uma configuração). A pessoa entra pela janela do Facebook, o app usa o
 * ID e a chave do APP DA META, e a permissão vem da configuração (config_id) — sem lista de escopos na URL.
 * O token é de usuário do sistema (não expira) e as chamadas vão para graph.facebook.com.
 */
export const FB_GRAPH_VERSION = "v25.0";
export const UNIFIED_MESSAGES = "instagram_manage_messages";
export const UNIFIED_PUBLISH = "instagram_content_publish";

export function fbLoginUrl(o: { appId: string; configId: string; redirectUri: string; state: string }) {
  const u = new URL(`https://www.facebook.com/${FB_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", o.appId);
  u.searchParams.set("config_id", o.configId);
  u.searchParams.set("redirect_uri", o.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("override_default_response_type", "true");
  u.searchParams.set("state", o.state);
  return u.toString();
}

/** debug_token do login unificado → permissões dadas e as contas do Instagram liberadas (target_ids). */
export function parseDebugToken(j: unknown): { scopes: string[]; igIds: string[]; expiresAt: Date | null } {
  const d = ((j as { data?: unknown } | null)?.data ?? {}) as { scopes?: unknown; granular_scopes?: unknown; expires_at?: unknown };
  const scopes = Array.isArray(d.scopes) ? d.scopes.map(String) : [];
  const ids: string[] = [];
  if (Array.isArray(d.granular_scopes)) {
    for (const g of d.granular_scopes as { scope?: unknown; target_ids?: unknown }[]) {
      const sc = String(g?.scope ?? "");
      if (!sc.startsWith("instagram_") || !Array.isArray(g.target_ids)) continue;
      for (const t of g.target_ids) if (!ids.includes(String(t))) ids.push(String(t));
    }
  }
  const exp = Number(d.expires_at);
  return { scopes, igIds: ids, expiresAt: Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000) : null };
}

/** O código volta com "#_" no fim (documentado pela Meta). */
export const cleanAuthCode = (code: string) => code.replace(/#_$/, "").trim();

/** state do OAuth: quem pediu + validade (10 min). Selado (criptografado) pelo serviço antes de ir na URL. */
/** purpose: "messages" = Geovana no Direct (padrão) · "publish" = Assessoria publicando o calendário. */
export type IgState = { scope: "goweb" | "store"; tenantId: string | null; actor: string; exp: number; nonce: string; purpose: "messages" | "publish" };

export function makeState(scope: IgScope, actor: string, now: number, nonce: string, purpose: IgState["purpose"] = "messages"): IgState {
  return { scope: scope === "goweb" ? "goweb" : "store", tenantId: scope === "goweb" ? null : scope.tenantId, actor, exp: now + 10 * 60_000, nonce, purpose };
}

export function readState(raw: unknown, now: number): IgState | null {
  const s = raw as Partial<IgState> | null;
  if (!s || (s.scope !== "goweb" && s.scope !== "store") || typeof s.actor !== "string" || typeof s.exp !== "number" || typeof s.nonce !== "string") return null;
  if (s.exp < now) return null;
  if (s.scope === "store" && !s.tenantId) return null;
  const purpose = s.purpose === "publish" && s.scope === "store" ? "publish" : "messages";
  return { scope: s.scope, tenantId: s.scope === "store" ? String(s.tenantId) : null, actor: s.actor, exp: s.exp, nonce: s.nonce, purpose };
}

/** Resposta da troca do código: a Meta já devolveu com e sem o envelope `data: [...]`. */
export function parseShortToken(j: unknown): { token: string; userId: string; permissions: string[] } | null {
  const o = j as { data?: unknown[]; access_token?: unknown; user_id?: unknown; permissions?: unknown } | null;
  const r = (Array.isArray(o?.data) ? o!.data[0] : o) as { access_token?: unknown; user_id?: unknown; permissions?: unknown } | undefined;
  if (!r || typeof r.access_token !== "string" || r.user_id == null) return null;
  const perms = Array.isArray(r.permissions) ? r.permissions.map(String) : typeof r.permissions === "string" ? r.permissions.split(",") : [];
  return { token: r.access_token, userId: String(r.user_id), permissions: perms.map((p) => p.trim()).filter(Boolean) };
}

export function parseLongToken(j: unknown, now: number): { token: string; expiresAt: Date } | null {
  const o = j as { access_token?: unknown; expires_in?: unknown } | null;
  if (!o || typeof o.access_token !== "string") return null;
  const secs = Number(o.expires_in);
  return { token: o.access_token, expiresAt: new Date(now + (Number.isFinite(secs) && secs > 0 ? secs : 60 * 86_400) * 1000) };
}

/** Faltam as permissões de mensagens? (a pessoa pode desmarcar na tela da Meta) */
export const missingScopes = (granted: string[], wanted: readonly string[] = IG_SCOPES) => wanted.filter((s) => !granted.includes(s));

export function tokenNeedsRefresh(t: { expiresAt: Date | null; issuedAt: Date | null }, now: number) {
  if (!t.expiresAt) return false;
  if (t.expiresAt.getTime() <= now) return false; // venceu: só reconectando
  if (t.issuedAt && now - t.issuedAt.getTime() < IG_MIN_TOKEN_AGE_MS) return false;
  return t.expiresAt.getTime() - now <= IG_REFRESH_BEFORE_MS;
}

// ---------------------------------------------------------------- webhook
/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo cru, app secret). */
export function igVerifySignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export type IgEvent = {
  accountId: string; // conta profissional (entry.id) — identifica GoWeb ou a loja
  contactId: string; // IGSID do cliente
  mid: string | null;
  text: string;
  echo: boolean; // enviada pela própria conta (app do Instagram ou nós)
  at: Date;
  hasMedia: boolean;
};

/** Lê o corpo do webhook (object "instagram"). Ignora o que não for mensagem (visto, reação, etc.). */
export function parseIgWebhook(body: unknown): IgEvent[] {
  const b = body as { object?: unknown; entry?: unknown } | null;
  if (!b || b.object !== "instagram" || !Array.isArray(b.entry)) return [];
  const out: IgEvent[] = [];
  for (const e of b.entry as { id?: unknown; messaging?: unknown }[]) {
    const accountId = e?.id != null ? String(e.id) : "";
    if (!accountId || !Array.isArray(e.messaging)) continue;
    for (const m of e.messaging as { sender?: { id?: unknown }; recipient?: { id?: unknown }; timestamp?: unknown; message?: Record<string, unknown> }[]) {
      const msg = m?.message;
      if (!msg || msg.is_deleted || msg.is_unsupported) continue;
      const echo = msg.is_echo === true;
      const sender = m.sender?.id != null ? String(m.sender.id) : "";
      const recipient = m.recipient?.id != null ? String(m.recipient.id) : "";
      const contactId = echo ? recipient : sender;
      if (!contactId || (contactId === accountId && !echo)) continue;
      const text = typeof msg.text === "string" ? msg.text : "";
      const hasMedia = Array.isArray(msg.attachments) && msg.attachments.length > 0;
      if (!text.trim() && !hasMedia) continue;
      const ts = Number(m.timestamp);
      out.push({ accountId, contactId, mid: typeof msg.mid === "string" ? msg.mid : null, text, echo, at: new Date(Number.isFinite(ts) && ts > 0 ? ts : Date.now()), hasMedia });
    }
  }
  return out;
}

// ---------------------------------------------------------------- envio
export const igWindowOpen = (lastInboundAt: Date | null, now: number) => !!lastInboundAt && now - lastInboundAt.getTime() <= IG_WINDOW_MS;

/** Corta em 1.000 bytes UTF-8 (sem quebrar caractere), com reticências se cortou. */
export function igText(text: string) {
  const t = text.trim();
  if (Buffer.byteLength(t, "utf8") <= IG_MAX_TEXT_BYTES) return t;
  let out = "";
  for (const ch of t) {
    if (Buffer.byteLength(out + ch + "…", "utf8") > IG_MAX_TEXT_BYTES) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

/** Canal no registro da proteção (geovana_log) e contato com prefixo, para separar o consumo por canal. */
export const igLogChannel = (scope: IgScope) => (scope === "goweb" ? "ig:goweb" : `ig:store:${scope.tenantId}`);
export const igContact = (igsid: string) => `ig:${igsid}`;
