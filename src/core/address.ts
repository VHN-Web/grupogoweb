// Endereço de entrega estruturado (checkout): CEP com preenchimento automático (Brasil), número da casa, bairro,
// e a busca da coordenada a partir do endereço digitado (para a loja calcular a entrega e o motoboy achar a casa).
// Regras PURAS: validação, montagem do texto, consulta ao geocodificador e leitura das respostas das APIs.

export type AddressParts = {
  cep: string; // só Brasil (8 dígitos)
  street: string;
  number: string;
  noNumber: boolean; // "sem número" (S/N)
  complement: string;
  neighborhood: string;
  city: string;
  state: string; // UF
  reference: string;
};

export const EMPTY_ADDRESS: AddressParts = { cep: "", street: "", number: "", noNumber: false, complement: "", neighborhood: "", city: "", state: "", reference: "" };

export const onlyDigits = (v: string) => v.replace(/\D/g, "");
export const isValidCep = (v: string) => /^\d{8}$/.test(onlyDigits(v)) && !/^(\d)\1{7}$/.test(onlyDigits(v));
export function formatCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const clean = (v: unknown, max = 120) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Mínimo para tentar achar o endereço e fazer o pedido: rua, número (ou "sem número") e cidade (ou CEP). */
export function addressReady(p: AddressParts, country: string) {
  const hasPlace = country === "BR" ? !!p.city.trim() || isValidCep(p.cep) : !!p.city.trim() || !!p.neighborhood.trim();
  return p.street.trim().length >= 3 && (p.noNumber || !!p.number.trim()) && hasPlace;
}

/** Texto único salvo no pedido e mostrado à loja/motoboy. Ex.: "Rua X, 123, apto 2 - Boa Viagem - Recife/PE - CEP 51020-000 (Ref.: perto da padaria)". */
export function composeAddress(p: AddressParts, country: string) {
  const pt = country === "BR";
  const num = p.noNumber ? "S/N" : clean(p.number, 12);
  const first = [clean(p.street), num, clean(p.complement, 60)].filter(Boolean).join(", ");
  const place = [clean(p.city, 60), clean(p.state, 2).toUpperCase()].filter(Boolean).join("/");
  const parts = [first, clean(p.neighborhood, 60), place, pt && isValidCep(p.cep) ? `CEP ${formatCep(p.cep)}` : ""].filter(Boolean).join(" - ");
  const ref = clean(p.reference, 100);
  return (ref ? `${parts} (${pt ? "Ref." : "Ref."}: ${ref})` : parts).slice(0, 200);
}

/** Consultas ao geocodificador, da mais precisa para a mais aproximada (para sempre achar algo útil). */
export function geocodeQueries(p: AddressParts, country: string) {
  const cc = country === "PY" ? "py" : "br";
  const street = clean(p.street);
  const num = p.noNumber ? "" : clean(p.number, 12);
  const city = clean(p.city, 60);
  const state = clean(p.state, 40);
  const cep = isValidCep(p.cep) ? formatCep(p.cep) : "";
  const q: { params: Record<string, string>; precision: "exact" | "street" | "area" }[] = [];
  if (street && city) q.push({ params: { street: `${num ? `${num} ` : ""}${street}`, city, ...(state ? { state } : {}), countrycodes: cc }, precision: num ? "exact" : "street" });
  if (street && city && num) q.push({ params: { street, city, ...(state ? { state } : {}), countrycodes: cc }, precision: "street" });
  if (cep) q.push({ params: { postalcode: cep, countrycodes: cc }, precision: "area" });
  if (p.neighborhood.trim() && city) q.push({ params: { q: `${clean(p.neighborhood, 60)}, ${city}${state ? `, ${state}` : ""}`, countrycodes: cc }, precision: "area" });
  return q;
}

// ---------------------------------------------------------------- leitura das APIs
/** ViaCEP: {cep, logradouro, bairro, localidade, uf} ou {erro: true}. */
export function parseViaCep(j: unknown): Partial<AddressParts> | null {
  const o = (j ?? {}) as Record<string, unknown>;
  if (o.erro || !o.localidade) return null;
  return { cep: onlyDigits(clean(o.cep, 9)), street: clean(o.logradouro), neighborhood: clean(o.bairro, 60), city: clean(o.localidade, 60), state: clean(o.uf, 2) };
}

/** BrasilAPI CEP v2: {cep, street, neighborhood, city, state, location: {coordinates: {latitude, longitude}}}. */
export function parseBrasilApi(j: unknown): { parts: Partial<AddressParts>; coords: { lat: number; lng: number } | null } | null {
  const o = (j ?? {}) as Record<string, unknown>;
  if (!o.city) return null;
  const c = ((o.location as Record<string, unknown> | undefined)?.coordinates ?? {}) as Record<string, unknown>;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  return {
    parts: { cep: onlyDigits(clean(o.cep, 9)), street: clean(o.street), neighborhood: clean(o.neighborhood, 60), city: clean(o.city, 60), state: clean(o.state, 2) },
    coords: Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null,
  };
}

/** Nominatim (OpenStreetMap) /search: lista com {lat, lon}. */
export function parseNominatimSearch(j: unknown): { lat: number; lng: number } | null {
  const first = Array.isArray(j) ? (j[0] as Record<string, unknown> | undefined) : undefined;
  const lat = Number(first?.lat);
  const lng = Number(first?.lon);
  return first && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Nominatim /reverse: {address: {road, house_number, suburb|neighbourhood, city|town, state, postcode}}. */
export function parseNominatimReverse(j: unknown): Partial<AddressParts> | null {
  const a = ((j ?? {}) as { address?: Record<string, unknown> }).address;
  if (!a) return null;
  const iso = clean(a["ISO3166-2-lvl4"], 10); // "BR-PE"
  return {
    street: clean(a.road ?? a.pedestrian ?? a.footway),
    number: clean(a.house_number, 12),
    neighborhood: clean(a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district, 60),
    city: clean(a.city ?? a.town ?? a.village ?? a.municipality, 60),
    state: iso.includes("-") ? iso.split("-")[1] : clean(a.state, 40),
    cep: onlyDigits(clean(a.postcode, 10)).slice(0, 8),
  };
}

/** Junta o que veio da API sem apagar o que o cliente já digitou. */
export function mergeAddress(cur: AddressParts, found: Partial<AddressParts>, overwrite = false): AddressParts {
  const out = { ...cur };
  for (const k of ["cep", "street", "number", "neighborhood", "city", "state"] as const) {
    const v = found[k];
    if (v && (overwrite || !cur[k].trim())) out[k] = v;
  }
  return out;
}

/** Bairro a partir do texto do endereço (pedidos antigos, só texto): "Rua X, 1 - Boa Viagem - Recife/PE" → "Boa Viagem". */
export function neighborhoodFromText(address: string | null | undefined) {
  const parts = (address ?? "").split(" - ").map((s) => s.trim());
  return parts.length >= 3 && !/^CEP\b/i.test(parts[1]) && !parts[1].includes("/") ? parts[1].slice(0, 60) : null;
}
