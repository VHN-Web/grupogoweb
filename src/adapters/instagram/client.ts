// =============================================================================
// Instagram API with Instagram Login (oficial da Meta) — cliente HTTP.
// Login: api.instagram.com/oauth/access_token → token curto → graph.instagram.com/access_token (60 dias)
//        → graph.instagram.com/refresh_access_token (renova antes de vencer).
// Mensagens: POST graph.instagram.com/me/messages · webhooks: POST /me/subscribed_apps?subscribed_fields=messages.
// IG_GRAPH_BASE / IG_OAUTH_BASE (env) só para testes. Regras puras em core/instagram.ts.
// =============================================================================
import { FB_GRAPH_VERSION, igText, parseDebugToken, parseLongToken, parseShortToken } from "@/core/instagram";
import { sandboxBlocks } from "@/lib/sandbox";

const GRAPH = () => (process.env.IG_GRAPH_BASE ?? "https://graph.instagram.com").replace(/\/$/, "");
const OAUTH = () => (process.env.IG_OAUTH_BASE ?? "https://api.instagram.com").replace(/\/$/, "");
const TIMEOUT = 20_000;
/** Login unificado (apps novos): mesma API do Instagram, servida em graph.facebook.com. FB_GRAPH_BASE só para testes. */
const FB = () => (process.env.FB_GRAPH_BASE ?? `https://graph.facebook.com/${FB_GRAPH_VERSION}`).replace(/\/$/, "");

/** Por onde a conta conversa: "instagram" (login do Instagram, graph.instagram.com) ou "facebook" (login unificado). */
export type IgVia = { api: "instagram" | "facebook"; igUserId: string };
const host = (via?: IgVia) => (via?.api === "facebook" ? FB() : GRAPH());

export class IgError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code: number | null = null,
  ) {
    super(message);
  }
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

function fail(res: Response, j: Record<string, unknown>, what: string): never {
  const e = (j.error ?? {}) as { message?: string; code?: number };
  const msg = e.message ?? (j.error_message as string | undefined) ?? (j.raw as string | undefined) ?? String(res.status);
  // o código da Meta vai no texto (#10, #551…) para quem trata o erro decidir (sem permissão, fora da janela, etc.)
  throw new IgError(`Instagram (${what}): ${e.code ? `(#${e.code}) ` : ""}${msg}`, res.status, e.code ?? null);
}

/** Código do login → token curto + id do usuário + permissões dadas. */
export async function igExchangeCode(o: { appId: string; appSecret: string; redirectUri: string; code: string }) {
  const res = await fetch(`${OAUTH()}/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: o.appId, client_secret: o.appSecret, grant_type: "authorization_code", redirect_uri: o.redirectUri, code: o.code }).toString(),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "login");
  const t = parseShortToken(j);
  if (!t) throw new IgError("Instagram (login): resposta sem token");
  return t;
}

/** Token curto → token de 60 dias (só no servidor: leva o app secret). */
export async function igLongToken(appSecret: string, shortToken: string) {
  const u = new URL(`${GRAPH()}/access_token`);
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", appSecret);
  u.searchParams.set("access_token", shortToken);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "token");
  const t = parseLongToken(j, Date.now());
  if (!t) throw new IgError("Instagram (token): resposta sem token");
  return t;
}

/** Renova o token de 60 dias (precisa ter mais de 24 h e não ter vencido). */
export async function igRefreshToken(token: string) {
  const u = new URL(`${GRAPH()}/refresh_access_token`);
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "renovação");
  const t = parseLongToken(j, Date.now());
  if (!t) throw new IgError("Instagram (renovação): resposta sem token");
  return t;
}

/** Conta conectada: user_id (= entry.id dos webhooks) e @. */
export async function igMe(token: string) {
  const u = new URL(`${GRAPH()}/me`);
  u.searchParams.set("fields", "user_id,username,name");
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "conta");
  const id = j.user_id ?? j.id;
  if (id == null) throw new IgError("Instagram (conta): sem id");
  return { userId: String(id), username: typeof j.username === "string" ? j.username : null, name: typeof j.name === "string" ? j.name : null };
}

/** Liga os avisos (webhook) de mensagens desta conta para o app da GoWeb. */
export async function igSubscribe(token: string, via?: IgVia) {
  if (sandboxBlocks("instagram", null, "subscribed_apps")) return; // prévia: não mexe na conta real
  const u = new URL(`${host(via)}/${via?.api === "facebook" ? encodeURIComponent(via.igUserId) : "me"}/subscribed_apps`);
  u.searchParams.set("subscribed_fields", "messages");
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { method: "POST", signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "webhook");
}

/** Desliga os avisos (ao desconectar). Falha aqui não impede desconectar. */
export async function igUnsubscribe(token: string, via?: IgVia) {
  if (sandboxBlocks("instagram", null, "subscribed_apps delete")) return;
  const u = new URL(`${host(via)}/${via?.api === "facebook" ? encodeURIComponent(via.igUserId) : "me"}/subscribed_apps`);
  u.searchParams.set("access_token", token);
  await fetch(u, { method: "DELETE", signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
}

/** Nome/@ de quem escreveu (para a caixa de entrada). null se a Meta não liberar. */
export async function igProfile(token: string, igsid: string, via?: IgVia) {
  const u = new URL(`${host(via)}/${encodeURIComponent(igsid)}`);
  u.searchParams.set("fields", "name,username");
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
  if (!res?.ok) return null;
  const j = await readJson(res);
  return { name: typeof j.name === "string" ? j.name : null, username: typeof j.username === "string" ? j.username : null };
}

/** Responde no Direct. Devolve o id da mensagem. */
export async function igSendText(token: string, recipientIgsid: string, text: string, via?: IgVia): Promise<string | null> {
  if (sandboxBlocks("instagram", recipientIgsid, text)) return `sandbox-${Date.now()}`; // prévia: simula o envio
  const res = await fetch(`${host(via)}/${via?.api === "facebook" ? encodeURIComponent(via.igUserId) : "me"}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientIgsid }, message: { text: igText(text) } }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "envio");
  return typeof j.message_id === "string" ? j.message_id : null;
}

// ---------------------------------------------------------------- publicação (Assessoria GoWeb, autonomia)
/**
 * Publica uma foto no feed: cria o contêiner (a Meta busca a imagem JPEG na URL pública) e publica.
 * Exige instagram_business_content_publish. Limite da Meta: 100 publicações pela API a cada 24 h por conta.
 */
export async function igPublishImage(token: string, igUserId: string, imageUrl: string, caption: string, api: IgVia["api"] = "instagram"): Promise<string> {
  if (sandboxBlocks("instagram", igUserId, `post: ${caption.slice(0, 80)}`)) return `sandbox-${Date.now()}`; // prévia: nunca publica
  const root = api === "facebook" ? FB() : GRAPH();
  const base = `${root}/${encodeURIComponent(igUserId)}`;
  const create = await fetch(`${base}/media`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl, caption }),
    signal: AbortSignal.timeout(60_000),
  });
  const c = await readJson(create);
  if (!create.ok) fail(create, c, "contêiner do post");
  const creationId = typeof c.id === "string" ? c.id : null;
  if (!creationId) throw new IgError("Instagram (contêiner do post): sem id");
  // imagem costuma ficar pronta na hora; confere o status algumas vezes antes de publicar
  for (let i = 0; i < 5; i++) {
    const st = await fetch(`${root}/${encodeURIComponent(creationId)}?fields=status_code`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
    const j = st?.ok ? await readJson(st) : {};
    if (j.status_code === "FINISHED" || !st?.ok) break;
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") throw new IgError(`Instagram (post): a Meta não aceitou a imagem (${String(j.status_code)})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const pub = await fetch(`${base}/media_publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ creation_id: creationId }),
    signal: AbortSignal.timeout(60_000),
  });
  const p = await readJson(pub);
  if (!pub.ok) fail(pub, p, "publicação");
  if (typeof p.id !== "string") throw new IgError("Instagram (publicação): sem id");
  return p.id;
}

// ---------------------------------------------------------------- login unificado (apps novos da Meta)
/** Código do Login do Facebook para Empresas → token (de usuário do sistema; normalmente não expira). */
export async function fbExchangeCode(o: { appId: string; appSecret: string; redirectUri: string; code: string }) {
  const u = new URL(`${FB()}/oauth/access_token`);
  u.searchParams.set("client_id", o.appId);
  u.searchParams.set("client_secret", o.appSecret);
  u.searchParams.set("redirect_uri", o.redirectUri);
  u.searchParams.set("code", o.code);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "login");
  if (typeof j.access_token !== "string") throw new IgError("Instagram (login): resposta sem token");
  return j.access_token;
}

/** Quais permissões e contas do Instagram o token recebeu (granular_scopes). */
export async function fbDebugToken(token: string, appId: string, appSecret: string) {
  const u = new URL(`${FB()}/debug_token`);
  u.searchParams.set("input_token", token);
  u.searchParams.set("access_token", `${appId}|${appSecret}`);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "permissões");
  return parseDebugToken(j);
}

/** Reserva: contas do Instagram ligadas ao usuário do sistema, quando o debug_token não lista nenhuma. */
export async function fbAssignedIgAccounts(token: string): Promise<string[]> {
  const u = new URL(`${FB()}/me/assigned_instagram_accounts`);
  u.searchParams.set("fields", "id");
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => null);
  if (!res?.ok) return [];
  const j = await readJson(res);
  return Array.isArray(j.data) ? (j.data as { id?: unknown }[]).map((x) => String(x?.id ?? "")).filter(Boolean) : [];
}

/** @ e nome da conta profissional do Instagram (login unificado). */
export async function fbIgAccount(token: string, igUserId: string) {
  const u = new URL(`${FB()}/${encodeURIComponent(igUserId)}`);
  u.searchParams.set("fields", "id,username,name");
  u.searchParams.set("access_token", token);
  const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT) });
  const j = await readJson(res);
  if (!res.ok) fail(res, j, "conta");
  return { userId: String(j.id ?? igUserId), username: typeof j.username === "string" ? j.username : null, name: typeof j.name === "string" ? j.name : null };
}
