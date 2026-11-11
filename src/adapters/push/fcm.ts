import "server-only";
// Firebase Cloud Messaging (HTTP v1) — notificações do app Android do entregador com o app fechado
// e o motoboy offline. Sem FCM_SERVICE_ACCOUNT o adapter fica desligado (o app ainda avisa sozinho
// enquanto o motoboy está online, pelo retorno do /api/entregador/ping).
// FCM_SERVICE_ACCOUNT = JSON da conta de serviço do Firebase (texto puro ou em base64).
import { createSign } from "node:crypto";

type Account = { projectId: string; email: string; key: string };
let account: Account | null | undefined;
let token: { value: string; exp: number } | null = null;

function readAccount(): Account | null {
  if (account !== undefined) return account;
  const raw = process.env.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return (account = null);
  try {
    const j = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as { project_id?: string; client_email?: string; private_key?: string };
    account = j.project_id && j.client_email && j.private_key ? { projectId: j.project_id, email: j.client_email, key: j.private_key.replace(/\\n/g, "\n") } : null;
  } catch {
    account = null;
  }
  if (!account) console.error("[fcm] FCM_SERVICE_ACCOUNT inválido");
  return account;
}

export function fcmConfigured() {
  return !!readAccount();
}

async function accessToken(a: Account) {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: a.email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(a.key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  if (!r.ok) throw new Error(`fcm auth ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in?: number };
  token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** "gone" = aparelho desinstalou/token inválido (apagar a inscrição). */
export type FcmResult = "ok" | "gone" | "error";

/** Mensagem só de dados com prioridade alta: o app mostra a notificação mesmo fechado. */
export async function sendFcm(deviceToken: string, data: Record<string, string>): Promise<FcmResult> {
  const a = readAccount();
  if (!a) return "error";
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(a.projectId)}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken(a)}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token: deviceToken, data, android: { priority: "high", ttl: "43200s" } } }),
    });
    if (r.ok) return "ok";
    const text = await r.text().catch(() => "");
    if (r.status === 404 || /UNREGISTERED|registration token/i.test(text)) return "gone";
    if (r.status === 401) token = null;
    console.error("[fcm]", r.status, text.slice(0, 300));
    return "error";
  } catch (e) {
    console.error("[fcm]", e);
    return "error";
  }
}
