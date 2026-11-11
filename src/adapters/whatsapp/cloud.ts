// =============================================================================
// WhatsApp Cloud API (oficial da Meta) — número da própria loja no WhatsApp Business Platform.
// Credenciais por loja (criptografadas): Phone Number ID, token permanente, App Secret.
// Webhook: GET/POST /api/whatsapp/cloud/{hookToken} (verify token + X-Hub-Signature-256).
// Fora da janela de 24 h só modelos aprovados — a Geovana só responde a quem escreveu.
// GRAPH_API_BASE (env) só para testes.
// =============================================================================
import { createHmac, timingSafeEqual } from "node:crypto";
import { sandboxBlocks } from "@/lib/sandbox";

export class CloudError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code: number | null = null,
  ) {
    super(message);
  }
}
const GRAPH = () => process.env.GRAPH_API_BASE ?? "https://graph.facebook.com/v21.0";

export async function cloudSendText(phoneId: string, token: string, toE164: string, text: string) {
  if (sandboxBlocks("whatsapp", toE164, text)) return `sandbox-${Date.now()}`; // prévia: simula o envio
  const res = await fetch(`${GRAPH()}/${encodeURIComponent(phoneId)}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toE164.replace(/\D/g, ""), type: "text", text: { body: text, preview_url: true } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
    // o código da Meta vai no texto (#131048…) para a proteção da Geovana classificar (core/wa-guard.ts#classifyError)
    throw new CloudError(`WhatsApp oficial: ${j?.error?.code ? `(#${j.error.code}) ` : ""}${j?.error?.message ?? res.status}`, res.status, j?.error?.code ?? null);
  }
  const ok = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  return ok?.messages?.[0]?.id ?? null;
}

export async function cloudCheck(phoneId: string, token: string) {
  const res = await fetch(`${GRAPH()}/${encodeURIComponent(phoneId)}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const j = (await res.json().catch(() => null)) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } } | null;
  if (!res.ok) throw new CloudError(`WhatsApp oficial: ${j?.error?.message ?? res.status}`);
  return { phone: j?.display_phone_number ?? "", name: j?.verified_name ?? "" };
}

export function cloudVerifySignature(raw: string, header: string | null, appSecret: string) {
  if (!header || !appSecret) return false;
  const exp = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(exp);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cloudParse(body: unknown) {
  const out: { id: string; from: string; text: string; name: string | null }[] = [];
  const b = body as { entry?: { changes?: { value?: { contacts?: { profile?: { name?: string }; wa_id?: string }[]; messages?: { id: string; from: string; type: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[] } }[] }[] };
  for (const e of b?.entry ?? [])
    for (const c of e.changes ?? []) {
      const v = c.value;
      for (const m of v?.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? (m.type === "audio" ? "[áudio]" : "");
        const name = v?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name ?? null;
        out.push({ id: m.id, from: m.from, text, name });
      }
    }
  return out;
}
