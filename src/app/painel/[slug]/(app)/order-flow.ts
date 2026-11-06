import type { Order } from "@/db/schema";
import type { OrderStatus } from "@/core/types";

export function nextStatus(o: Pick<Order, "status" | "type">): OrderStatus | null {
  switch (o.status) {
    case "RECEIVED":
      return "PREPARING";
    case "PREPARING":
      return o.type === "DELIVERY" ? "OUT_FOR_DELIVERY" : "READY";
    case "READY":
    case "OUT_FOR_DELIVERY":
      return "COMPLETED";
    default:
      return null;
  }
}

const NEXT: Partial<Record<OrderStatus, [string, string]>> = {
  PREPARING: ["Preparar", "Preparar"],
  READY: ["Marcar listo", "Marcar pronto"],
  OUT_FOR_DELIVERY: ["Salió a entregar", "Saiu para entrega"],
  COMPLETED: ["Entregado", "Entregue"],
};

export function nextLabel(s: OrderStatus, locale: "es" | "pt"): string {
  const l = NEXT[s];
  return l ? l[locale === "pt" ? 1 : 0] : "";
}
