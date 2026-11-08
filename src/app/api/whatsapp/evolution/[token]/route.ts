// Webhook da Evolution API (instância de cada loja). O segredo da loja vai na URL.
import { NextResponse, after } from "next/server";
import { evoParse } from "@/adapters/whatsapp/evolution";
import { handleInbound, tenantByHook } from "@/services/geovana";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = await tenantByHook((await params).token);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ev = evoParse(await req.json().catch(() => null));
  if (ev?.kind === "message") {
    // responde já para a Evolution e processa a IA em seguida
    after(() => handleInbound(t, { jid: ev.msg.jid, name: ev.msg.name, text: ev.msg.text, externalId: ev.msg.id, fromMe: ev.msg.fromMe }).catch((e) => console.error("[geovana evo]", e)));
  }
  return NextResponse.json({ ok: true });
}
