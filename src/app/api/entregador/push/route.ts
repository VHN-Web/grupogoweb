// Inscrição do celular do entregador para notificações (nova entrega, entrega livre).
import { NextResponse } from "next/server";
import { getCourier } from "@/lib/courier-auth";
import { courierActor } from "@/services/courier-app";
import { removePushSub, savePushSub, vapidKeys } from "@/services/push";

export async function GET() {
  if (!(await getCourier())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: (await vapidKeys()).pub });
}

export async function POST(req: Request) {
  const s = await getCourier();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { subscription?: { endpoint: string; keys: { p256dh: string; auth: string } }; device?: string } | null;
  if (!body?.subscription) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    await savePushSub(courierActor(s.courier.id), body.subscription, body.device);
  } catch {
    return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!(await getCourier())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (body?.endpoint) await removePushSub(body.endpoint);
  return NextResponse.json({ ok: true });
}
