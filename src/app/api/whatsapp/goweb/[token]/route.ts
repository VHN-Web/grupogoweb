// Webhook da Evolution para o WhatsApp DA GoWeb (Geovana da GoWeb). O segredo vai na URL.
import { NextResponse, after } from "next/server";
import { evoParse } from "@/adapters/whatsapp/evolution";
import { gwByHook, handleGwInbound } from "@/services/goweb-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const cfg = await gwByHook((await params).token);
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ev = evoParse(await req.json().catch(() => null));
  if (ev?.kind === "message") {
    after(() => handleGwInbound({ jid: ev.msg.jid, name: ev.msg.name, text: ev.msg.text, externalId: ev.msg.id, fromMe: ev.msg.fromMe, image: ev.msg.image ?? null }).catch((e) => console.error("[gw-bot evo]", e)));
  }
  return NextResponse.json({ ok: true });
}
