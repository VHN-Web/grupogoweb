// Webhook da WhatsApp Cloud API (oficial). GET = verificação da Meta; POST = mensagens (assinadas).
import { NextResponse, after } from "next/server";
import { cloudParse, cloudVerifySignature } from "@/adapters/whatsapp/cloud";
import { geovanaOf, handleInbound, tenantByHook } from "@/services/geovana";
import { openSecret } from "@/lib/secrets";
import { drainSoon } from "@/services/wa-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await tenantByHook((await params).token);
  const u = new URL(req.url);
  const cfg = t ? geovanaOf(t) : null;
  if (cfg && u.searchParams.get("hub.mode") === "subscribe" && cfg.cloudVerifyToken && u.searchParams.get("hub.verify_token") === cfg.cloudVerifyToken) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await tenantByHook((await params).token);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const raw = await req.text();
  const cfg = geovanaOf(t);
  if (!cloudVerifySignature(raw, req.headers.get("x-hub-signature-256"), openSecret(cfg.cloudAppSecretSealed))) return NextResponse.json({ error: "signature" }, { status: 401 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const msgs = cloudParse(body);
  if (msgs.length)
    after(async () => {
      for (const m of msgs) await handleInbound(t, { jid: m.from, name: m.name, text: m.text, externalId: m.id, fromMe: false }).catch((e) => console.error("[geovana cloud]", e));
      await drainSoon();
    });
  return NextResponse.json({ ok: true });
}
