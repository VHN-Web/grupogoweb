// Frota ao vivo da loja (mapa em Motoboys e na tela do pedido).
import { getPanelAccess } from "@/lib/auth";
import { fleet } from "@/services/courier-app";
import type { MapMarker } from "@/components/maps/LiveMap";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const acc = await getPanelAccess((await params).slug);
  if (!acc || !(acc.areas.has("couriers") || acc.areas.has("orders"))) return Response.json({ error: "unauthorized" }, { status: 401 });
  const f = await fleet(acc.tenant.id);
  const markers: MapMarker[] = [];
  if (f.store) markers.push({ id: "store", kind: "store", ...f.store });
  for (const o of f.orders) if (o.dest) markers.push({ id: `o-${o.id}`, kind: "dest", ...o.dest, label: `#${o.number}` });
  for (const c of f.couriers) if (c.pos) markers.push({ id: `c-${c.id}`, kind: "courier", ...c.pos, heading: c.heading, label: c.name.split(" ")[0], muted: !c.online });
  return Response.json({ ...f, markers }, { headers: { "cache-control": "no-store" } });
}
