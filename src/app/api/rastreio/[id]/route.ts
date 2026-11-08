// Rastreio público do pedido de delivery (o id do pedido já é o segredo do link do cliente).
import { trackOrder } from "@/services/courier-app";
import type { MapMarker } from "@/components/maps/LiveMap";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await trackOrder((await params).id);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  const markers: MapMarker[] = [];
  if (d.store) markers.push({ id: "store", kind: "store", ...d.store, label: d.storeName });
  if (d.dest) markers.push({ id: "dest", kind: "dest", ...d.dest });
  if (d.courier) markers.push({ id: "courier", kind: "courier", lat: d.courier.lat, lng: d.courier.lng, heading: d.courier.heading, label: d.courier.name });
  return Response.json({ ...d, markers }, { headers: { "cache-control": "no-store" } });
}
