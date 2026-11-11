// Demonstração montada pela Geovana: ela pesquisa o estabelecimento na internet (Google Maps, Instagram,
// Facebook, iFood, site) e devolve um perfil; daqui sai a loja demo com o nome, o visual do nicho e o cardápio real.
// Regras PURAS: o que pedir à IA, como validar o que ela devolve e qual modelo/tema/atendente usar.
import { parseMenuJson, type MenuItem } from "./menu-import";
import type { ThemeId } from "./themes";
import type { Currency } from "./types";

export type Niche =
  | "hamburgueria" | "lanchonete" | "pizzaria" | "restaurante" | "marmitaria" | "acaiteria" | "cafeteria" | "padaria" | "confeitaria"
  | "bar" | "barbearia" | "salao" | "loja" | "petshop" | "eletronicos" | "perfumaria" | "outro";

export const NICHES: { id: Niche; label: string; theme: ThemeId; preset: string }[] = [
  { id: "hamburgueria", label: "Hamburgueria", theme: "burger", preset: "lanchonete" },
  { id: "lanchonete", label: "Lanchonete", theme: "burger", preset: "lanchonete" },
  { id: "pizzaria", label: "Pizzaria", theme: "restaurant", preset: "pizzaria" },
  { id: "restaurante", label: "Restaurante", theme: "restaurant", preset: "restaurante" },
  { id: "marmitaria", label: "Marmitaria", theme: "restaurant", preset: "restaurante" },
  { id: "acaiteria", label: "Açaiteria / sorveteria", theme: "cafe", preset: "acai" },
  { id: "cafeteria", label: "Cafeteria", theme: "cafe", preset: "restaurante" },
  { id: "padaria", label: "Padaria", theme: "cafe", preset: "restaurante" },
  { id: "confeitaria", label: "Confeitaria / doceria", theme: "cafe", preset: "restaurante" },
  { id: "bar", label: "Bar / boteco", theme: "bar", preset: "restaurante" },
  { id: "barbearia", label: "Barbearia", theme: "barber", preset: "servicos" },
  { id: "salao", label: "Salão de beleza / estética", theme: "barber", preset: "servicos" },
  { id: "loja", label: "Loja", theme: "store", preset: "loja" },
  { id: "petshop", label: "Pet shop", theme: "store", preset: "loja" },
  { id: "eletronicos", label: "Eletrônicos / celulares", theme: "tech", preset: "loja" },
  { id: "perfumaria", label: "Perfumaria / cosméticos", theme: "perfume", preset: "loja" },
  { id: "outro", label: "Outro", theme: "classic", preset: "loja" },
];

export const nicheOf = (id: string | null | undefined) => NICHES.find((n) => n.id === id) ?? NICHES[NICHES.length - 1];

export type StoreProfile = {
  found: boolean;
  name: string;
  niche: Niche;
  tagline: string;
  description: string;
  address: string;
  city: string;
  hours: string;
  rating: number | null;
  reviews: number | null;
  delivery: boolean;
  pickup: boolean;
  dineIn: boolean;
  color: string | null; // cor da marca (#RRGGBB)
  highlights: string[];
  instagram: string;
  website: string;
  menu: MenuItem[];
  menuSource: string; // ifood | site | instagram | google | foto | nenhum
  sources: { title: string; url: string }[];
};

export type ResearchInput = { name: string; city?: string | null; links: string[]; notes?: string | null; country: "BR" | "PY" };

/** Links que o vendedor colou (um por linha / separados por espaço): só http(s), sem repetidos, no máximo 6. */
export function parseLinks(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of (text ?? "").split(/[\s,]+/)) {
    let v = raw.trim();
    if (!v) continue;
    if (/^@[\w.]{2,30}$/.test(v)) v = `https://instagram.com/${v.slice(1)}`;
    else if (!/^https?:\/\//i.test(v) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v)) v = `https://${v}`;
    try {
      const u = new URL(v);
      if (!/^https?:$/.test(u.protocol)) continue;
      const s = u.toString();
      if (!out.includes(s)) out.push(s);
    } catch {}
    if (out.length >= 6) break;
  }
  return out;
}

export function researchPrompt(i: ResearchInput) {
  const pt = i.country === "BR";
  const niches = NICHES.map((n) => n.id).join(", ");
  return `Você é a Geovana, pesquisadora da GoWeb (sistema de cardápio digital, pedidos, agenda e caixa).
Pesquise na internet (Google, Google Maps, Instagram, Facebook, iFood, site próprio) o estabelecimento abaixo e monte o perfil dele para uma DEMONSTRAÇÃO de vendas.

Estabelecimento: ${i.name}
${i.city ? `Cidade: ${i.city}` : ""}
País: ${pt ? "Brasil" : "Paraguai"}
${i.links.length ? `Links informados pelo vendedor (comece por eles):\n${i.links.map((l) => `- ${l}`).join("\n")}` : ""}
${i.notes ? `Observações do vendedor: ${i.notes}` : ""}

Responda SÓ com um JSON (sem texto antes ou depois) neste formato:
{"encontrado":true,"nome":"","nicho":"","slogan":"","descricao":"","endereco":"","cidade":"","horario":"","nota":4.7,"avaliacoes":230,"entrega":true,"retirada":true,"consumoLocal":false,"corPrincipal":"#E4572E","destaques":[""],"instagram":"","site":"","cardapio":[{"categoria":"","nome":"","descricao":"","preco":0}],"cardapioFonte":"","fontes":[{"titulo":"","url":""}]}

Regras:
- "encontrado": false se não tiver certeza de que achou ESTE estabelecimento (mesmo nome e cidade). Nunca misture com outro negócio.
- "nicho": exatamente um destes: ${niches}.
- "slogan": frase curta (até 60 caracteres) no estilo do próprio negócio, em ${pt ? "português" : "espanhol"}.
- "descricao": 2 ou 3 frases sobre o que o negócio oferece e os diferenciais, baseado no que encontrou.
- "horario": como aparece no Google/Instagram (ex.: "Ter a Dom, 18h às 23h"). Vazio se não achar.
- "corPrincipal": a cor dominante da marca (logo, fachada, posts) em hexadecimal. Vazio se não souber.
- "destaques": até 4 pontos fortes reais (ex.: "4,8 no Google com 300 avaliações", "entrega grátis acima de R$ 50").
- "cardapio": itens REAIS com preço REAL encontrados (iFood, site, cardápio postado, Google). Até 60 itens. Preço em ${pt ? "reais" : "guaraníes"} como número ("R$ 32,90" → 32.9). NUNCA invente itens nem preços: sem fonte, deixe a lista vazia.
- "cardapioFonte": ifood, site, instagram, google ou nenhum.
- "fontes": as páginas que você usou (título e URL).`;
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function validColor(v: unknown): string | null {
  const s = clean(v, 9);
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return null;
}

function jsonObject(raw: string): Record<string, unknown> | null {
  const txt = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  for (const candidate of [txt, txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)]) {
    try {
      const j = JSON.parse(candidate);
      if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch {}
  }
  return null;
}

/** Lê e valida o perfil devolvido pela IA. `sources` = fontes que a própria busca do Google informou. */
export function parseProfile(raw: string, i: ResearchInput, currency: Currency, extraSources: { title: string; url: string }[] = []): StoreProfile | null {
  const j = jsonObject(raw);
  if (!j) return null;
  const rating = Number(j.nota);
  const reviews = Number(j.avaliacoes);
  const menu = parseMenuJson(JSON.stringify({ itens: Array.isArray(j.cardapio) ? j.cardapio : [] }), currency, currency === "BRL" ? "Cardápio" : "Menú").slice(0, 120);
  const fromAi = Array.isArray(j.fontes) ? (j.fontes as Record<string, unknown>[]).map((f) => ({ title: clean(f?.titulo ?? f?.title, 120), url: clean(f?.url, 400) })) : [];
  const sources: { title: string; url: string }[] = [];
  for (const s of [...extraSources, ...fromAi]) {
    if (!/^https?:\/\//.test(s.url) || sources.some((x) => x.url === s.url)) continue;
    sources.push({ title: s.title || new URL(s.url).hostname, url: s.url });
    if (sources.length >= 12) break;
  }
  const niche = nicheOf(clean(j.nicho, 20).toLowerCase()).id;
  return {
    found: j.encontrado !== false,
    name: clean(j.nome, 60) || i.name.slice(0, 60),
    niche,
    tagline: clean(j.slogan, 60),
    description: clean(j.descricao, 600),
    address: clean(j.endereco, 200),
    city: clean(j.cidade, 80) || clean(i.city, 80),
    hours: clean(j.horario, 200),
    rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    reviews: Number.isFinite(reviews) && reviews >= 0 ? Math.round(reviews) : null,
    delivery: bool(j.entrega, true),
    pickup: bool(j.retirada, true),
    dineIn: bool(j.consumoLocal, false),
    color: validColor(j.corPrincipal),
    highlights: (Array.isArray(j.destaques) ? j.destaques : []).map((h) => clean(h, 120)).filter(Boolean).slice(0, 4),
    instagram: clean(j.instagram, 80).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/$/, ""),
    website: clean(j.site, 200),
    menu,
    menuSource: menu.length ? clean(j.cardapioFonte, 20).toLowerCase() || "google" : "nenhum",
    sources,
  };
}

/** Cardápio real só entra se tiver o mínimo para a demo fazer sentido; senão fica o de exemplo do modelo. */
export const MIN_REAL_MENU = 3;

/** Modelo demo do mesmo tema e país (senão do país, senão o primeiro). */
export function pickTemplate<T extends { slug: string; theme: string; country: string }>(templates: T[], niche: Niche, country: string): T | null {
  const theme = nicheOf(niche).theme;
  return templates.find((t) => t.theme === theme && t.country === country) ?? templates.find((t) => t.country === country) ?? templates[0] ?? null;
}

/** Endereço da demo: "pizzaria-do-joao-demo". */
export function demoSlug(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);
  return `${base || "loja"}-demo`;
}

/** Banner da demo a partir do perfil: o 1º destaque (ou o item mais pedido) em destaque. */
export function demoBanner(p: StoreProfile, pt: boolean, fmt: (minor: number) => string) {
  const top = p.menu[0];
  return {
    bannerTag: pt ? "PEÇA ONLINE" : "PEDÍ ONLINE",
    bannerTitle: (p.highlights[0] || (top ? top.name : p.tagline) || p.name).slice(0, 60),
    bannerSubtitle: (p.tagline || p.description.split(/(?<=\.)\s/)[0] || "").slice(0, 120) || null,
    bannerHighlight: top ? fmt(top.priceMinor) : null,
  };
}

/** Texto "Sobre a loja" para a Geovana atender como esta loja no simulador. */
export function geovanaAbout(p: StoreProfile, pt: boolean) {
  const parts = [p.description, p.highlights.length ? (pt ? `Destaques: ${p.highlights.join("; ")}.` : `Destacados: ${p.highlights.join("; ")}.`) : "", p.address ? (pt ? `Endereço: ${p.address}.` : `Dirección: ${p.address}.`) : ""];
  return parts.filter(Boolean).join(" ").slice(0, 1500);
}
