// Posição do GPS do entregador (enviada pelo app a cada poucos segundos enquanto ele está online).
import { NextResponse } from "next/server";
import { getCourier } from "@/lib/courier-auth";
import { myActiveDeliveries, recordPing } from "@/services/courier-app";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getCourier();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const r = await recordPing(s.courier, body);
  if (!r.ok) return NextResponse.json({ error: "bad point" }, { status: 400 });
  // o app compara com o que está na tela e recarrega quando chega entrega nova
  const mine = await myActiveDeliveries(s.courier);
  return NextResponse.json({ ok: true, online: s.courier.online, deliveries: mine.map((o) => `${o.id}:${o.status}`).join(",") });
}
