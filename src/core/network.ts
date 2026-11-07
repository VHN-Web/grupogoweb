// Shopping GoWeb (rede de lojas): categorias por modelo de site. Lógica pura.
import type { ThemeId } from "./themes";

export type NetCat = "comida" | "cafe" | "bares" | "beleza" | "moda" | "tecnologia" | "variedades";

export const NET_CATS: { id: NetCat; pt: string; es: string }[] = [
  { id: "comida", pt: "Comida", es: "Comida" },
  { id: "cafe", pt: "Cafés e padarias", es: "Cafés y panaderías" },
  { id: "bares", pt: "Bares", es: "Bares" },
  { id: "beleza", pt: "Beleza e cuidados", es: "Belleza" },
  { id: "moda", pt: "Moda", es: "Moda" },
  { id: "tecnologia", pt: "Tecnologia", es: "Tecnología" },
  { id: "variedades", pt: "Variedades", es: "Variedades" },
];

export function categoryOf(theme: string): NetCat {
  const map: Partial<Record<ThemeId, NetCat>> = { burger: "comida", restaurant: "comida", cafe: "cafe", bar: "bares", barber: "beleza", perfume: "beleza", store: "moda", tech: "tecnologia" };
  return map[theme as ThemeId] ?? "variedades";
}

/** Demonstrações só aparecem enquanto a rede tiver poucas lojas reais (sempre marcadas como demonstração). */
export const MIN_REAL_STORES = 6;
export function includeDemos(realCount: number) {
  return realCount < MIN_REAL_STORES;
}
