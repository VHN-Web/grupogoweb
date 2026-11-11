// Webhook do Instagram (app da Meta da GoWeb, um endereço para todas as contas).
// GET = verificação (hub.challenge); POST = mensagens, assinadas com X-Hub-Signature-256 (app secret).
import { NextResponse, after } from "next/server";
import { handleIgWebhook, igSignatureOk, igVerifyChallenge } from "@/services/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const ch = await igVerifyChallenge(u.searchParams.get("hub.mode"), u.searchParams.get("hub.verify_token"), u.searchParams.get("hub.challenge"));
  return ch ? new Response(ch, { status: 200 }) : new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await igSignatureOk(raw, req.headers.get("x-hub-signature-256")))) return NextResponse.json({ error: "signature" }, { status: 401 });
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  // responde na hora (a Meta reenvia se demorar) e processa depois
  after(async () => {
    await handleIgWebhook(body).catch((e) => console.error("[instagram webhook]", e));
  });
  return NextResponse.json({ ok: true });
}
