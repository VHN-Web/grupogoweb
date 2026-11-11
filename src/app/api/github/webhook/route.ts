// Webhook do GitHub (Settings → Webhooks do repositório): PR novo, testes concluídos e publicação viram aviso
// no app do CRM (categoria "homologacao"). Assinado com o segredo mostrado em Admin → Homologação.
import { NextResponse, after } from "next/server";
import { githubSignatureOk } from "@/core/homolog";
import { homologConfig, onGithubEvent } from "@/services/homolog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();
  const cfg = await homologConfig();
  if (!githubSignatureOk(raw, req.headers.get("x-hub-signature-256"), cfg.webhookSecret)) return NextResponse.json({ error: "signature" }, { status: 401 });
  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw);
  } catch {}
  after(async () => {
    await onGithubEvent(event, body).catch((e) => console.error("[github webhook]", e));
  });
  return NextResponse.json({ ok: true });
}
