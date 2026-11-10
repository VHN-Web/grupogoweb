// Cardápio por foto — regras PURAS: o que pedir à IA (visão) e como validar o que ela devolve.
import { MINOR_UNITS } from "./money";
import type { Currency } from "./types";

export type MenuItem = { category: string; name: string; description: string; priceMinor: number };

export function menuPrompt(pt: boolean, currency: Currency): string {
  return pt
    ? `Você recebe a FOTO de um cardápio/tabela de preços de um comércio brasileiro. Transcreva TODOS os itens com preço.
Responda SÓ com JSON neste formato: {"itens":[{"categoria":"Pizzas","nome":"Calabresa","descricao":"molho, mussarela, calabresa","preco":45.9}]}
Regras: preço em ${currency} como número decimal (ponto como separador; "R$ 12,50" → 12.5). Item com vários tamanhos/preços → um item por tamanho, com o tamanho no nome ("Calabresa (grande)"). Use as seções do cardápio como categoria (sem seção: "Cardápio"). Não invente itens, descrições ou preços; ilegível = não inclua. Mantenha a grafia do cardápio.`
    : `Recibís la FOTO de un menú/lista de precios de un comercio. Transcribí TODOS los ítems con precio.
Respondé SOLO con JSON: {"itens":[{"categoria":"Pizzas","nome":"Calabresa","descricao":"salsa, muzzarella","preco":45000}]}
Reglas: precio en ${currency} como número. Ítem con varios tamaños → un ítem por tamaño con el tamaño en el nombre. Usá las secciones como categoría (sin sección: "Menú"). No inventes nada; ilegible = no incluir.`;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lê o JSON da IA (aceita ```json … ```), valida e tira repetidos. */
export function parseMenuJson(raw: string, currency: Currency, fallbackCategory = "Cardápio"): MenuItem[] {
  const txt = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  let j: unknown;
  try {
    j = JSON.parse(txt);
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      j = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(j) ? j : ((j as { itens?: unknown; items?: unknown })?.itens ?? (j as { items?: unknown })?.items);
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: MenuItem[] = [];
  for (const it of list.slice(0, 300)) {
    const o = (it ?? {}) as Record<string, unknown>;
    const name = clean(o.nome ?? o.name, 120);
    const priceRaw = typeof o.preco === "string" ? Number(String(o.preco).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : Number(o.preco ?? o.price);
    if (!name || !Number.isFinite(priceRaw) || priceRaw <= 0) continue;
    const priceMinor = Math.round(priceRaw * MINOR_UNITS[currency]);
    if (priceMinor > 100_000_000) continue;
    const category = clean(o.categoria ?? o.category, 60) || fallbackCategory;
    const key = `${category.toLowerCase()}|${name.toLowerCase()}|${priceMinor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ category, name, description: clean(o.descricao ?? o.description, 400), priceMinor });
  }
  return out;
}

/** Resumo para o lojista: "23 produtos em 5 categorias (Pizzas 12, Bebidas 6…)". */
export function menuSummary(items: MenuItem[]): string {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.category, (by.get(i.category) ?? 0) + 1);
  const cats = [...by.entries()].map(([c, n]) => `${c} ${n}`).slice(0, 6).join(", ");
  return `${items.length} produto(s) em ${by.size} categoria(s)${cats ? ` (${cats}${by.size > 6 ? "…" : ""})` : ""}`;
}
