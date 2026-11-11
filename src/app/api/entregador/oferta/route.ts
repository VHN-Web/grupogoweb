// Botões da tela cheia "Nova entrega" do app Android: pegar entrega livre ou recusar a que foi passada.
import { NextResponse } from "next/server";
import { getCourier } from "@/lib/courier-auth";
import { claimDelivery, CourierError, declineDelivery } from "@/services/courier-app";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getCourier();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { orderId?: unknown; action?: unknown } | null;
  const orderId = typeof body?.orderId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.orderId) ? body.orderId : null;
  if (!orderId || (body?.action !== "claim" && body?.action !== "decline")) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    if (body.action === "claim") await claimDelivery(s.courier, orderId);
    else await declineDelivery(s.courier, orderId);
  } catch (e) {
    if (e instanceof CourierError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
