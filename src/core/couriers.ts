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
