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

export const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  PREPARING: "Preparar",
  READY: "Marcar listo",
  OUT_FOR_DELIVERY: "Salió a entregar",
  COMPLETED: "Entregado",
};
