// =============================================================================
// PONTO DE EXTENSÃO: Distância para delivery
// =============================================================================
// Padrão: linha reta (haversine) x fator 1.3 (aprox. de ruas), sem API key.
// Futuro: GoogleDistanceProvider / MapboxDistanceProvider / OSRM self-hosted.
// =============================================================================
export type LatLng = { lat: number; lng: number };

export interface DistanceProvider {
  readonly id: string;
  distanceKm(from: LatLng, to: LatLng): Promise<number>;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const straightLineProvider: DistanceProvider = {
  id: "straight_line",
  async distanceKm(from, to) {
    return haversineKm(from, to) * 1.3;
  },
};

export function getDistanceProvider(): DistanceProvider {
  // TODO: escolher por env (DISTANCE_PROVIDER=google) quando houver outros adapters
  return straightLineProvider;
}
