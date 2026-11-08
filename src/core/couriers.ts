// Motoboys: mensagem da entrega e acerto do período. Lógica pura — testada em couriers.test.ts.

export type DeliveryInfo = {
  number: string;
  storeName: string;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  items: { name: string; quantity: number }[];
  total: string; // já formatado
  collect: string | null; // valor a cobrar na entrega (null = já pago)
  change: string | null; // troco a levar
  notes: string | null;
};

/** Texto enviado ao motoboy pelo WhatsApp (sem dados de pagamento sensíveis). */
export function courierMessage(d: DeliveryInfo, T: (es: string, pt: string) => string): string {
  const map = d.lat != null && d.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}` : d.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.address)}` : null;
  const lines = [
    `*${T("Entrega", "Entrega")} #${d.number} — ${d.storeName}*`,
    "",
    `${T("Cliente", "Cliente")}: ${d.customerName}${d.customerPhone ? ` · ${d.customerPhone}` : ""}`,
    d.address ? `${T("Dirección", "Endereço")}: ${d.address}` : null,
    map ? `${T("Mapa", "Mapa")}: ${map}` : null,
    "",
    `${T("Pedido", "Itens")}: ${d.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}`,
    d.collect ? `${T("Cobrar", "Cobrar")}: ${d.collect}${d.change ? ` · ${T("llevar vuelto", "levar troco")}: ${d.change}` : ""}` : `${T("Ya pagado", "Já pago")} (${d.total})`,
    d.notes ? `${T("Obs.", "Obs.")}: ${d.notes}` : null,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/** Quanto pagar ao motoboy no período: valor combinado por entrega × entregas (ou taxa cobrada, se não houver valor combinado). */
export function courierPayout(deliveries: { deliveryFee: number }[], feePerDelivery: number) {
  const count = deliveries.length;
  const fees = deliveries.reduce((a, d) => a + d.deliveryFee, 0);
  return { count, fees, payout: feePerDelivery > 0 ? feePerDelivery * count : fees };
}

// ---------------- App do entregador: rastreamento em tempo real ----------------

/** Distância em km entre dois pontos (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minutos estimados até o destino: rua não é linha reta (×1,35) e moto na cidade ~22 km/h. */
export function etaMinutes(km: number, speedMs?: number | null) {
  const kmh = speedMs && speedMs > 3 ? Math.min(45, Math.max(15, speedMs * 3.6)) : 22;
  return Math.max(1, Math.round(((km * 1.35) / kmh) * 60));
}

/** Posição considerada "ao vivo" se chegou nos últimos 3 minutos. */
export const LIVE_MS = 3 * 60_000;
export const isLive = (seen: Date | null | undefined, now = Date.now()) => !!seen && now - new Date(seen).getTime() < LIVE_MS;

/** Valida e limpa um ponto de GPS vindo do celular. */
export function cleanPing(p: unknown): { lat: number; lng: number; accuracy: number | null; heading: number | null; speed: number | null } | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const lat = n(o.lat);
  const lng = n(o.lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const acc = n(o.accuracy);
  const hd = n(o.heading);
  const sp = n(o.speed);
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    accuracy: acc != null && acc >= 0 ? Math.min(acc, 99_999) : null,
    heading: hd != null && hd >= 0 && hd <= 360 ? hd : null,
    speed: sp != null && sp >= 0 && sp < 100 ? sp : null,
  };
}

/** Ganhos do entregador: por entrega = valor combinado ou, sem valor combinado, a taxa cobrada do cliente. */
export function courierEarning(deliveryFee: number, feePerDelivery: number) {
  return feePerDelivery > 0 ? feePerDelivery : deliveryFee;
}

/** Início de hoje / semana (segunda) / mês no fuso informado (minutos de diferença p/ UTC, ex.: -180 = BRT). */
export function periodStarts(now: Date, offsetMin: number) {
  const local = new Date(now.getTime() + offsetMin * 60_000);
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetMin * 60_000;
  const dow = (local.getUTCDay() + 6) % 7; // 0 = segunda
  const week = day - dow * 86_400_000;
  const month = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - offsetMin * 60_000;
  return { day: new Date(day), week: new Date(week), month: new Date(month) };
}
