// Cálculo (e recálculo) da taxa de delivery. Puro e testável.
//
// A DISTÂNCIA vem de um DistanceProvider (src/adapters/distance). Hoje usamos
// linha reta (haversine) x fator de ruas; depois pode-se plugar Google/Mapbox/OSRM.

export type DeliveryRules = {
  baseFeePyg: number;
  perKmPyg: number;
  maxKm: number;
  freeOverPyg: number | null;
  /** passo de arredondamento em minor units (PYG 500; BRL 50 = R$ 0,50) */
  roundStep?: number;
};

export type DeliveryQuote =
  | { ok: true; feePyg: number; distanceKm: number; free: boolean }
  | { ok: false; reason: "OUT_OF_RANGE" | "NO_LOCATION"; distanceKm?: number };

/** Arredonda taxas para múltiplos de Gs. 500 (troco prático). */
export function roundFee(v: number, step = 500): number {
  return Math.ceil(v / step) * step;
}

export function quoteDelivery(
  distanceKm: number | null,
  subtotalPyg: number,
  rules: DeliveryRules,
): DeliveryQuote {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return { ok: false, reason: "NO_LOCATION" };
  const d = Math.round(distanceKm * 10) / 10;
  if (d > rules.maxKm) return { ok: false, reason: "OUT_OF_RANGE", distanceKm: d };
  if (rules.freeOverPyg != null && subtotalPyg >= rules.freeOverPyg) {
    return { ok: true, feePyg: 0, distanceKm: d, free: true };
  }
  const fee = roundFee(rules.baseFeePyg + rules.perKmPyg * d, rules.roundStep ?? 500);
  return { ok: true, feePyg: fee, distanceKm: d, free: false };
}
