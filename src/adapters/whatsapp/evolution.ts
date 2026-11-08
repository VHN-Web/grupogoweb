// =============================================================================
// WhatsApp via Evolution API v2 (servidor próprio da GoWeb, uma instância por loja).
// Admin → Configurações → WhatsApp: URL do servidor + chave global (criptografada).
// Webhook de cada instância: /api/whatsapp/evolution/{hookToken}
// Obs.: conexão por QR (WhatsApp Web, não oficial) — risco de bloqueio do número se houver abuso.
// =============================================================================
export class EvolutionError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

type Srv = { url: string; key: string };

async function call<T>(s: Srv, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${s.url.replace(/\/$/, "")}${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { apikey: s.key, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new EvolutionError("Servidor do WhatsApp (Evolution) fora do ar.");
  }
  const text = await res.text();
  let j: unknown = null;
  try {
    j = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const m = (j as { response?: { message?: unknown }; message?: unknown } | null)?.response?.message ?? (j as { message?: unknown } | null)?.message;
    if (res.status === 401 || res.status === 403) throw new EvolutionError("Chave da Evolution inválida.", res.status);
    throw new EvolutionError(`Evolution: ${Array.isArray(m) ? m.join(" ") : String(m ?? res.status)}`, res.status);
  }
  return j as T;
}

export const EVOLUTION_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

/** Cria a instância da loja (com o webhook já apontado) e devolve o token da instância. */
export async function evoCreateInstance(server: Srv, instance: string, webhookUrl: string) {
  const r = await call<{ hash?: { apikey?: string } | string }>(server, "/instance/create", {
    body: {
      instanceName: instance,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
      webhook: { url: webhookUrl, byEvents: false, base64: false, events: EVOLUTION_EVENTS },
    },
  });
  const key = typeof r.hash === "string" ? r.hash : r.hash?.apikey;
  if (!key) throw new EvolutionError("A Evolution não devolveu o token da instância.");
  return key;
}

/** Garante o webhook da instância (ex.: depois de trocar o domínio). */
export const evoSetWebhook = (server: Srv, instance: string, webhookUrl: string) =>
  call(server, `/webhook/set/${encodeURIComponent(instance)}`, { body: { webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: false, events: EVOLUTION_EVENTS } } });

/** QR Code para conectar (base64 de imagem) e código de pareamento. */
export const evoConnect = (server: Srv, instance: string) => call<{ base64?: string; code?: string; pairingCode?: string; count?: number }>(server, `/instance/connect/${encodeURIComponent(instance)}`);

export async function evoState(server: Srv, instance: string) {
  const r = await call<{ instance?: { state?: string } }>(server, `/instance/connectionState/${encodeURIComponent(instance)}`);
  return r.instance?.state ?? "unknown"; // open | connecting | close
}

export const evoLogout = (server: Srv, instance: string) => call(server, `/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" });
export const evoDelete = (server: Srv, instance: string) => call(server, `/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" });

export const evoSendText = (server: Srv, instance: string, toE164: string, text: string) =>
  call<{ key?: { id?: string } }>(server, `/message/sendText/${encodeURIComponent(instance)}`, { body: { number: toE164.replace(/\D/g, ""), text, delay: 1200, linkPreview: true } });

export type Inbound = { id: string; jid: string; fromMe: boolean; text: string; name: string | null };

/** Mensagem recebida/enviada no webhook (texto); null = outro evento. */
export function evoParse(body: unknown): { kind: "message"; msg: Inbound } | { kind: "connection"; state: string } | null {
  const b = body as { event?: string; data?: Record<string, unknown> } | null;
  const ev = (b?.event ?? "").toLowerCase().replace(/_/g, ".");
  if (ev === "connection.update") return { kind: "connection", state: String((b?.data as { state?: string })?.state ?? "") };
  if (ev !== "messages.upsert" || !b?.data) return null;
  const d = (Array.isArray(b.data) ? b.data[0] : b.data) as { key?: { id?: string; remoteJid?: string; fromMe?: boolean }; pushName?: string; message?: Record<string, unknown> };
  const m = d?.message ?? {};
  const text =
    (m.conversation as string) ??
    (m.extendedTextMessage as { text?: string })?.text ??
    (m.imageMessage as { caption?: string })?.caption ??
    (m.buttonsResponseMessage as { selectedDisplayText?: string })?.selectedDisplayText ??
    (m.listResponseMessage as { title?: string })?.title ??
    "";
  if (!d?.key?.remoteJid || !d.key.id) return null;
  const audio = !!m.audioMessage;
  return { kind: "message", msg: { id: d.key.id, jid: d.key.remoteJid, fromMe: !!d.key.fromMe, text: text || (audio ? "[áudio]" : ""), name: d.pushName ?? null } };
}
