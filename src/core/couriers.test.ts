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

import { cleanPing, courierEarning, distanceKm, etaMinutes, isLive, periodStarts } from "./couriers";

describe("rastreamento do entregador", () => {
  it("distância e tempo estimado", () => {
    const km = distanceKm({ lat: -8.05, lng: -34.9 }, { lat: -8.06, lng: -34.9 });
    expect(km).toBeGreaterThan(1.0);
    expect(km).toBeLessThan(1.2);
    expect(etaMinutes(km)).toBe(4);
    expect(etaMinutes(0.01)).toBe(1);
  });
  it("valida o ponto do GPS", () => {
    expect(cleanPing({ lat: 0, lng: 0 })).toBeNull();
    expect(cleanPing({ lat: 91, lng: 1 })).toBeNull();
    expect(cleanPing({ lat: "x", lng: 1 })).toBeNull();
    expect(cleanPing({ lat: -8.1234567, lng: -34.9, speed: 5, heading: 400 })).toEqual({ lat: -8.123457, lng: -34.9, accuracy: null, heading: null, speed: 5 });
  });
  it("ao vivo só com posição recente", () => {
    const now = Date.now();
    expect(isLive(new Date(now - 60_000), now)).toBe(true);
    expect(isLive(new Date(now - 10 * 60_000), now)).toBe(false);
    expect(isLive(null, now)).toBe(false);
  });
  it("ganho por entrega e períodos no fuso local", () => {
    expect(courierEarning(800, 0)).toBe(800);
    expect(courierEarning(800, 600)).toBe(600);
    // quarta 2026-11-04 01:00 UTC = terça 22:00 em BRT
    const p = periodStarts(new Date("2026-11-04T01:00:00Z"), -180);
    expect(p.day.toISOString()).toBe("2026-11-03T03:00:00.000Z");
    expect(p.week.toISOString()).toBe("2026-11-02T03:00:00.000Z");
    expect(p.month.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
});

import { parseDispatch, pickCourier } from "./couriers";

describe("atribuição automática", () => {
  const now = Date.now();
  const store = { lat: -8.05, lng: -34.9 };
  const live = new Date(now - 30_000);
  const cfg = parseDispatch(null);
  it("escolhe o online mais perto e equilibra pela carga", () => {
    const list = [
      { id: "longe", online: true, lat: -8.07, lng: -34.9, seenAt: live, load: 0 }, // ~2,2 km
      { id: "perto", online: true, lat: -8.051, lng: -34.9, seenAt: live, load: 0 }, // ~0,1 km
      { id: "offline", online: false, lat: -8.05, lng: -34.9, seenAt: live, load: 0 },
    ];
    expect(pickCourier(list, store, cfg, [], now)?.id).toBe("perto");
    // o mais perto já leva 1 entrega (+1,5 km): o outro (2,2 km) ainda perde
    expect(pickCourier([{ ...list[0] }, { ...list[1], load: 1 }], store, cfg, [], now)?.id).toBe("perto");
    // recusou: vai para o próximo
    expect(pickCourier(list, store, cfg, ["perto"], now)?.id).toBe("longe");
  });
  it("respeita raio, limite de entregas e GPS ao vivo", () => {
    expect(pickCourier([{ id: "a", online: true, lat: -8.2, lng: -34.9, seenAt: live, load: 0 }], store, cfg, [], now)).toBeNull(); // 16 km
    expect(pickCourier([{ id: "a", online: true, lat: -8.05, lng: -34.9, seenAt: live, load: 2 }], store, cfg, [], now)).toBeNull();
    expect(pickCourier([{ id: "a", online: true, lat: -8.05, lng: -34.9, seenAt: new Date(now - 600_000), load: 0 }], store, cfg, [], now)).toBeNull();
    expect(parseDispatch('{"autoAssign":false,"maxKm":8,"maxLoad":3}')).toEqual({ autoAssign: false, maxKm: 8, maxLoad: 3 });
  });
});
