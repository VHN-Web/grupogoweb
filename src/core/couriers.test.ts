import { describe, expect, it } from "vitest";
import { courierMessage, courierPayout } from "./couriers";

const T = (_es: string, pt: string) => pt;
const base = { number: "4821", storeName: "Burguer", customerName: "Ana", customerPhone: "+55 81 99999-0000", address: "Rua A, 10", lat: -8.1, lng: -34.9, items: [{ name: "X-Burger", quantity: 2 }], total: "R$ 50,00", collect: null, change: null, notes: null };

describe("motoboys", () => {
  it("mensagem com rota no mapa e itens", () => {
    const m = courierMessage(base, T);
    expect(m).toContain("#4821");
    expect(m).toContain("destination=-8.1,-34.9");
    expect(m).toContain("2× X-Burger");
    expect(m).toContain("Já pago");
  });
  it("cobrança na entrega com troco", () => {
    const m = courierMessage({ ...base, lat: null, lng: null, collect: "R$ 50,00", change: "R$ 50,00" }, T);
    expect(m).toContain("Cobrar: R$ 50,00");
    expect(m).toContain("levar troco");
    expect(m).toContain("maps/search");
  });
  it("acerto: valor combinado por entrega ou soma das taxas", () => {
    expect(courierPayout([{ deliveryFee: 500 }, { deliveryFee: 700 }], 0)).toEqual({ count: 2, fees: 1200, payout: 1200 });
    expect(courierPayout([{ deliveryFee: 500 }, { deliveryFee: 700 }], 800)).toEqual({ count: 2, fees: 1200, payout: 1600 });
  });
});
