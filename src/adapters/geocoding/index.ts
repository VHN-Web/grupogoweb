// =============================================================================
// PONTO DE EXTENSÃO: endereço ↔ coordenada (checkout com entrega).
//   CEP (Brasil): ViaCEP → reserva BrasilAPI (que às vezes traz a coordenada).
//   Endereço → coordenada e coordenada → endereço: Nominatim (OpenStreetMap), grátis, com política de uso
//   (máx. 1 requisição/s, User-Agent identificado, cache). Para volume alto, troque por Google/Mapbox aqui
//   (GEOCODER_URL aponta para outro Nominatim, ex.: próprio ou pago). O resto do sistema não muda.
// Env opcionais: GEOCODER_URL, GEOCODER_EMAIL (contato exigido pela política do OSM), VIACEP_URL, BRASILAPI_URL (testes).
// =============================================================================
import { geocodeQueries, isValidCep, onlyDigits, parseBrasilApi, parseNominatimReverse, parseNominatimSearch, parseViaCep, type AddressParts } from "@/core/address";

const NOMINATIM = () => (process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const UA = () => `GoWeb/1.0 (${process.env.GEOCODER_EMAIL ?? "suporte@goweboficial.com"})`;

// cache simples em memória (a mesma rua/CEP se repete muito numa cidade)
const cache = new Map<string, { at: number; v: unknown }>();
const TTL = 24 * 3600_000;
function cached<T>(key: string): T | undefined {
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return c.v as T;
  return undefined;
}
function remember<T>(key: string, v: T) {
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), v });
  return v;
}

// política do Nominatim: no máximo 1 requisição por segundo (por instância)
let last = 0;
async function osm(path: string, params: Record<string, string>) {
  const wait = last + 1100 - Date.now();
  last = Math.max(Date.now(), last + 1100);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const u = new URL(`${NOMINATIM()}${path}`);
  for (const [k, v] of Object.entries({ format: "jsonv2", "accept-language": "pt-BR,es", ...params })) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { "user-agent": UA(), accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  return res.json();
}

/** Endereço de um CEP (+ coordenada, quando a BrasilAPI tiver). null = CEP não existe. */
export async function lookupCep(cep: string): Promise<{ parts: Partial<AddressParts>; coords: { lat: number; lng: number } | null } | null> {
  const d = onlyDigits(cep);
  if (!isValidCep(d)) return null;
  const hit = cached<ReturnType<typeof parseBrasilApi>>(`cep:${d}`);
  if (hit !== undefined) return hit;
  try {
    const r = await fetch(`${process.env.VIACEP_URL ?? "https://viacep.com.br"}/ws/${d}/json/`, { signal: AbortSignal.timeout(6000) });
    const v = r.ok ? parseViaCep(await r.json()) : null;
    if (v) return remember(`cep:${d}`, { parts: v, coords: null });
  } catch {}
  try {
    const r = await fetch(`${process.env.BRASILAPI_URL ?? "https://brasilapi.com.br"}/api/cep/v2/${d}`, { signal: AbortSignal.timeout(6000) });
    return remember(`cep:${d}`, r.ok ? parseBrasilApi(await r.json()) : null);
  } catch {
    return null;
  }
}

export type Geo = { lat: number; lng: number; precision: "exact" | "street" | "area" };

/** Coordenada do endereço digitado: tenta do mais preciso (rua + número) ao aproximado (CEP, bairro). */
export async function geocodeAddress(p: AddressParts, country: string): Promise<Geo | null> {
  for (const q of geocodeQueries(p, country)) {
    const key = `geo:${JSON.stringify(q.params)}`;
    let hit = cached<{ lat: number; lng: number } | null>(key);
    if (hit === undefined) {
      try {
        hit = remember(key, parseNominatimSearch(await osm("/search", { ...q.params, limit: "1" })));
      } catch {
        hit = null;
      }
    }
    if (hit) return { ...hit, precision: q.precision };
  }
  // último recurso no Brasil: coordenada do CEP (BrasilAPI)
  if (country === "BR" && isValidCep(p.cep)) {
    const c = await lookupCep(p.cep);
    if (c?.coords) return { ...c.coords, precision: "area" };
  }
  return null;
}

/** Endereço aproximado de uma coordenada (quando o cliente compartilha a localização). */
export async function reverseGeocode(lat: number, lng: number): Promise<Partial<AddressParts> | null> {
  const key = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
  const hit = cached<Partial<AddressParts> | null>(key);
  if (hit !== undefined) return hit;
  try {
    return remember(key, parseNominatimReverse(await osm("/reverse", { lat: String(lat), lon: String(lng), zoom: "18", addressdetails: "1" })));
  } catch {
    return null;
  }
}
