// Temas do site do estabelecimento (os "modelos" apresentados ao cliente).
// Cada tema define cores, fontes, o estilo do banner e o layout do cardápio.
// A cor de destaque vem de tenant.primaryColor (o tema sugere uma padrão).

export type ThemeId = "classic" | "burger" | "restaurant" | "cafe" | "store" | "bar" | "barber" | "tech" | "perfume";
export type HeroStyle = "classic" | "promo" | "circle" | "card" | "showcase" | "glow" | "pole" | "grid" | "luxe";

export type Theme = {
  id: ThemeId;
  label: string; // pt (admin da plataforma)
  segment: string; // pt
  labelEs: string; // es (painel do estabelecimento)
  segmentEs: string;
  hero: HeroStyle;
  layout: "list" | "grid";
  featured: boolean; // carrossel "Lo más pedido"
  dark: boolean;
  colors: {
    bg: string;
    fg: string;
    surface: string;
    muted: string;
    line: string;
    heroBg: string;
    heroFg: string;
    heroAlt: string; // forma/círculo/brilho do banner
    tiles: string[]; // fundos das imagens dos produtos
  };
  accent: string; // sugestão de cor de destaque
  accentFg: string; // texto sobre o destaque
  fonts: { heading: string; body: string; google: string; headingUpper?: boolean; headingItalic?: boolean };
  radius: number;
};

const g = (q: string) => `https://fonts.googleapis.com/css2?${q}&display=swap`;

export const THEMES: Record<ThemeId, Theme> = {
  classic: {
    id: "classic",
    labelEs: "Clásico",
    segmentEs: "Cualquier negocio",
    label: "Clássico",
    segment: "Qualquer negócio",
    hero: "classic",
    layout: "list",
    featured: false,
    dark: false,
    colors: { bg: "#FAF8F5", fg: "#16130F", surface: "#FFFFFF", muted: "#6F675C", line: "#EBE6DF", heroBg: "#16130F", heroFg: "#FFFFFF", heroAlt: "#2A2723", tiles: ["#F3EEE6"] },
    accent: "#16130F",
    accentFg: "#FFFFFF",
    fonts: { heading: "'DM Sans', Inter, sans-serif", body: "'DM Sans', Inter, sans-serif", google: g("family=DM+Sans:wght@400;500;700") },
    radius: 18,
  },
  burger: {
    id: "burger",
    labelEs: "Hamburguesería",
    segmentEs: "Hamburguesas, lomitos, comida rápida",
    label: "Hamburgueria / Lanchonete",
    segment: "Hambúrguer, lanches, fast food",
    hero: "promo",
    layout: "list",
    featured: false,
    dark: true,
    colors: { bg: "#121212", fg: "#FFFFFF", surface: "#1E1E1E", muted: "#A9A9A9", line: "#2A2A2A", heroBg: "#E63946", heroFg: "#FFFFFF", heroAlt: "rgba(0,0,0,0.08)", tiles: ["#2A2416", "#2A1A1A", "#16202A"] },
    accent: "#FFC20E",
    accentFg: "#121212",
    fonts: { heading: "Anton, Impact, sans-serif", body: "Inter, sans-serif", google: g("family=Anton&family=Inter:wght@400;600;700"), headingUpper: true },
    radius: 18,
  },
  restaurant: {
    id: "restaurant",
    labelEs: "Restaurante",
    segmentEs: "Restaurante, pizzería, cantina",
    label: "Restaurante",
    segment: "Restaurante, pizzaria, cantina",
    hero: "circle",
    layout: "grid",
    featured: false,
    dark: false,
    colors: { bg: "#F7F1E5", fg: "#2B211B", surface: "#FFFFFF", muted: "#6E6255", line: "#EADFCF", heroBg: "#2F4A34", heroFg: "#F7F1E5", heroAlt: "#B5482F", tiles: ["#F1D9C7", "#E5E9DD", "#EBD9DC"] },
    accent: "#B5482F",
    accentFg: "#FFFFFF",
    fonts: { heading: "'Playfair Display', Georgia, serif", body: "'DM Sans', Inter, sans-serif", google: g("family=Playfair+Display:ital,wght@0,700;0,800;1,700&family=DM+Sans:wght@400;500;700"), headingItalic: true },
    radius: 18,
  },
  cafe: {
    id: "cafe",
    labelEs: "Cafetería",
    segmentEs: "Café, panadería, confitería",
    label: "Cafeteria / Padaria",
    segment: "Café, padaria, confeitaria",
    hero: "card",
    layout: "list",
    featured: true,
    dark: false,
    colors: { bg: "#F4E9DE", fg: "#4B2E1F", surface: "#FFFFFF", muted: "#8A6A55", line: "#E6D6C6", heroBg: "#E8B4A0", heroFg: "#4B2E1F", heroAlt: "#F4E9DE", tiles: ["#F6DCCF", "#EFE0CC"] },
    accent: "#4B2E1F",
    accentFg: "#FFFFFF",
    fonts: { heading: "'Playfair Display', Georgia, serif", body: "'DM Sans', Inter, sans-serif", google: g("family=Playfair+Display:wght@700;800&family=Pacifico&family=DM+Sans:wght@400;500;700") },
    radius: 22,
  },
  store: {
    id: "store",
    labelEs: "Tienda",
    segmentEs: "Ropa, calzados, accesorios",
    label: "Loja",
    segment: "Moda, calçados, acessórios, varejo",
    hero: "showcase",
    layout: "grid",
    featured: false,
    dark: false,
    colors: { bg: "#FFFFFF", fg: "#0E0E10", surface: "#FFFFFF", muted: "#6B6B6B", line: "#EDEDED", heroBg: "#0E0E10", heroFg: "#FFFFFF", heroAlt: "#E4405F", tiles: ["#FBE7EB", "#E7EDF5", "#F1F1F1", "#F6EEDC"] },
    accent: "#0E0E10",
    accentFg: "#FFFFFF",
    fonts: { heading: "Syne, Inter, sans-serif", body: "'DM Sans', Inter, sans-serif", google: g("family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700") },
    radius: 18,
  },
  bar: {
    id: "bar",
    labelEs: "Bar",
    segmentEs: "Bar, pub, cervecería, tragos",
    label: "Bar / Cervejaria",
    segment: "Bar, pub, cervejaria, drinks",
    hero: "glow",
    layout: "list",
    featured: false,
    dark: true,
    colors: { bg: "#0F2A22", fg: "#F3EAD3", surface: "#173A2F", muted: "#9DB5A9", line: "#25483C", heroBg: "#173A2F", heroFg: "#F3EAD3", heroAlt: "rgba(242,169,0,0.35)", tiles: ["#173A2F"] },
    accent: "#F2A900",
    accentFg: "#0F2A22",
    fonts: { heading: "'Bebas Neue', Impact, sans-serif", body: "'DM Sans', Inter, sans-serif", google: g("family=Bebas+Neue&family=DM+Sans:wght@400;500;700"), headingUpper: true },
    radius: 16,
  },
  barber: {
    id: "barber",
    labelEs: "Barbería",
    segmentEs: "Barbería, peluquería, estética masculina",
    label: "Barbearia",
    segment: "Barbearia, salão, estética masculina",
    hero: "pole",
    layout: "list",
    featured: true,
    dark: true,
    colors: { bg: "#141414", fg: "#EFE7DA", surface: "#1E1E1E", muted: "#A39B8F", line: "#2C2A27", heroBg: "#1B1A18", heroFg: "#EFE7DA", heroAlt: "#B3261E", tiles: ["#24211D", "#1F2328", "#2A1F1C"] },
    accent: "#D4A657",
    accentFg: "#141414",
    fonts: { heading: "Oswald, Impact, sans-serif", body: "Inter, sans-serif", google: g("family=Oswald:wght@500;600;700&family=Inter:wght@400;600;700"), headingUpper: true },
    radius: 10,
  },
  tech: {
    id: "tech",
    labelEs: "Tecnología",
    segmentEs: "Informática, celulares, gamer, accesorios",
    label: "Informática / Tecnologia",
    segment: "Informática, celulares, games, acessórios",
    hero: "grid",
    layout: "grid",
    featured: true,
    dark: true,
    colors: { bg: "#0B0F17", fg: "#E6EDF7", surface: "#121826", muted: "#8A97AD", line: "#1E2738", heroBg: "#0B0F17", heroFg: "#E6EDF7", heroAlt: "#22D3EE", tiles: ["#111B2B", "#161229", "#0F1F24"] },
    accent: "#22D3EE",
    accentFg: "#0B0F17",
    fonts: { heading: "'Space Grotesk', Inter, sans-serif", body: "Inter, sans-serif", google: g("family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600;700") },
    radius: 14,
  },
  perfume: {
    id: "perfume",
    labelEs: "Perfumería",
    segmentEs: "Perfumes, cosméticos, belleza",
    label: "Perfumaria / Cosméticos",
    segment: "Perfumes, cosméticos, beleza",
    hero: "luxe",
    layout: "grid",
    featured: false,
    dark: false,
    colors: { bg: "#FBF7F3", fg: "#2A1E22", surface: "#FFFFFF", muted: "#8A7A7E", line: "#EFE5DE", heroBg: "#2A1E22", heroFg: "#F7EDE6", heroAlt: "#C9A24A", tiles: ["#F6E6EC", "#F3ECE1", "#EAE6F2"] },
    accent: "#8C3B5A",
    accentFg: "#FFFFFF",
    fonts: { heading: "'Cormorant Garamond', Georgia, serif", body: "Jost, Inter, sans-serif", google: g("family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600&family=Jost:wght@400;500;600"), headingItalic: true },
    radius: 4,
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function getTheme(id: string | null | undefined): Theme {
  return THEMES[(id as ThemeId) ?? "classic"] ?? THEMES.classic;
}

/** Texto legível sobre uma cor (preto ou branco), pela luminância. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const [r, gg, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  return L > 0.4 ? "#121212" : "#FFFFFF";
}

/** Variáveis CSS do tema (usadas com a classe .th). */
export function themeVars(themeId: string | null | undefined, accent: string): Record<string, string> {
  const t = getTheme(themeId);
  return {
    "--bg": t.colors.bg,
    "--fg": t.colors.fg,
    "--surface": t.colors.surface,
    "--muted": t.colors.muted,
    "--line": t.colors.line,
    "--brand": accent,
    "--brand-fg": readableOn(accent),
    "--font-h": t.fonts.heading,
    "--font-b": t.fonts.body,
  };
}
