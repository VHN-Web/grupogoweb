import { NextResponse } from "next/server";
import { getPlatformAdmin } from "@/lib/auth";
import { removePushSub, savePushSub, vapidKeys } from "@/services/push";

// Inscrição do aparelho para receber notificações do CRM.
export async function GET() {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: (await vapidKeys()).pub });
}

export async function POST(req: Request) {
  const a = await getPlatformAdmin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { subscription?: { endpoint: string; keys: { p256dh: string; auth: string } }; device?: string } | null;
  if (!body?.subscription) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    await savePushSub(a.id ?? "platform", body.subscription, body.device);
  } catch {
    return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await removePushSub(body.endpoint);
  return NextResponse.json({ ok: true });
}
