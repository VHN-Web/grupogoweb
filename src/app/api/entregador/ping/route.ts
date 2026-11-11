// Posição do GPS do entregador (enviada pelo app a cada poucos segundos enquanto ele está online).
// O app Android também usa a resposta para avisar "nova entrega"/"entrega livre" com o app fechado.
import { NextResponse } from "next/server";
import { getCourier } from "@/lib/courier-auth";
import { myActiveDeliveries, openDeliveries, recordPing } from "@/services/courier-app";
import { getRegion } from "@/core/region";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getCourier();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const r = await recordPing(s.courier, body);
  if (!r.ok) return NextResponse.json({ error: "bad point" }, { status: 400 });
  const [mine, open] = await Promise.all([myActiveDeliveries(s.courier), s.courier.online ? openDeliveries(s.courier) : Promise.resolve([])]);
  return NextResponse.json({
    ok: true,
    online: s.courier.online,
    // o app compara com o que está na tela e recarrega quando chega entrega nova
    deliveries: mine.map((o) => `${o.id}:${o.status}`).join(","),
    mine: mine.map((o) => ({ id: o.id, n: o.number, s: o.status })),
    open: open.map((o) => ({ id: o.id, n: o.number })),
    lang: getRegion(s.tenant.country).locale,
  });
}
