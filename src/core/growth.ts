// "Crescimento": recursos que ajudam o lojista a conquistar e trazer clientes de volta.
// Lógica pura (sem banco) — testada em growth.test.ts.

// ---------------------------------------------------------------- planos e chaves liga/desliga
/**
 * Onde cada recurso mora:
 *  - BASE (todos os planos): carteira de clientes, origem das vendas, kit de divulgação, SEO local,
 *    pedido de avaliação no Google (opcional) e Vitrine da cidade (opcional).
 *  - GOINTELIGENCE: campanhas de reativação, indique e ganhe, fidelidade/cashback, aniversário (todos opcionais).
 */
export const GROWTH_FEATURES = {
  reviews: { pro: false, optional: true },
  directory: { pro: false, optional: true },
  campaigns: { pro: true, optional: true },
  referral: { pro: true, optional: true },
  loyalty: { pro: true, optional: true },
  birthday: { pro: true, optional: true },
} as const;
export type GrowthFeature = keyof typeof GROWTH_FEATURES;

export type GrowthConfig = {
  reviews: { enabled: boolean; googleUrl: string };
  directory: { enabled: boolean; city: string; category: string };
  campaigns: { enabled: boolean };
  referral: { enabled: boolean; friendPct: number; referrerPct: number };
  loyalty: { enabled: boolean; mode: "stamps" | "cashback"; stamps: number; rewardPct: number; cashbackPct: number };
  birthday: { enabled: boolean; pct: number };
};

export const DEFAULT_GROWTH: GrowthConfig = {
  reviews: { enabled: false, googleUrl: "" },
  directory: { enabled: false, city: "", category: "" },
  campaigns: { enabled: false },
  referral: { enabled: false, friendPct: 10, referrerPct: 10 },
  loyalty: { enabled: false, mode: "stamps", stamps: 10, rewardPct: 50, cashbackPct: 5 },
  birthday: { enabled: false, pct: 15 },
};

const clamp = (n: unknown, min: number, max: number, def: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : def;
};
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Lê o JSON salvo no lojista, sempre devolvendo valores válidos (nunca confia no que veio). */
export function parseGrowth(raw: string | null | undefined): GrowthConfig {
  let j: Record<string, Record<string, unknown>> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const g = (k: string) => (j[k] && typeof j[k] === "object" ? j[k] : {});
  const D = DEFAULT_GROWTH;
  const url = str(g("reviews").googleUrl, 400);
  return {
    reviews: { enabled: g("reviews").enabled === true, googleUrl: /^https:\/\//.test(url) ? url : "" },
    directory: { enabled: g("directory").enabled === true, city: str(g("directory").city, 60), category: str(g("directory").category, 40) },
    campaigns: { enabled: g("campaigns").enabled === true },
    referral: {
      enabled: g("referral").enabled === true,
      friendPct: clamp(g("referral").friendPct, 1, 50, D.referral.friendPct),
      referrerPct: clamp(g("referral").referrerPct, 1, 50, D.referral.referrerPct),
    },
    loyalty: {
      enabled: g("loyalty").enabled === true,
      mode: g("loyalty").mode === "cashback" ? "cashback" : "stamps",
      stamps: clamp(g("loyalty").stamps, 3, 30, D.loyalty.stamps),
      rewardPct: clamp(g("loyalty").rewardPct, 5, 100, D.loyalty.rewardPct),
      cashbackPct: clamp(g("loyalty").cashbackPct, 1, 30, D.loyalty.cashbackPct),
    },
    birthday: { enabled: g("birthday").enabled === true, pct: clamp(g("birthday").pct, 5, 50, D.birthday.pct) },
  };
}

/** O recurso está valendo? (ligado pelo lojista E permitido no plano) */
export function featureOn(cfg: GrowthConfig, f: GrowthFeature, pro: boolean): boolean {
  if (GROWTH_FEATURES[f].pro && !pro) return false;
  return cfg[f].enabled;
}

// ---------------------------------------------------------------- origem das vendas
export const SOURCES = ["mesa", "qr", "instagram", "whatsapp", "google", "facebook", "tiktok", "panfleto", "indicacao", "vitrine", "campanha", "direto"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<Source, { es: string; pt: string }> = {
  mesa: { es: "QR de la mesa", pt: "QR da mesa" },
  qr: { es: "QR impreso", pt: "QR impresso" },
  instagram: { es: "Instagram", pt: "Instagram" },
  whatsapp: { es: "WhatsApp", pt: "WhatsApp" },
  google: { es: "Google", pt: "Google" },
  facebook: { es: "Facebook", pt: "Facebook" },
  tiktok: { es: "TikTok", pt: "TikTok" },
  panfleto: { es: "Volante", pt: "Panfleto" },
  indicacao: { es: "Recomendación", pt: "Indicação" },
  vitrine: { es: "Vitrina de la ciudad", pt: "Vitrine da cidade" },
  campanha: { es: "Campaña", pt: "Campanha" },
  direto: { es: "Directo / sin origen", pt: "Direto / sem origem" },
};

/** Normaliza ?origem= / utm_source para uma origem conhecida. */
export function normalizeSource(raw: string | null | undefined): Source {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "direto";
  if ((SOURCES as readonly string[]).includes(s)) return s as Source;
  if (/^(ig|insta)/.test(s)) return "instagram";
  if (/^(wa|zap|whats)/.test(s)) return "whatsapp";
  if (/^(fb|face|meta)/.test(s)) return "facebook";
  if (/^(goog|gmb|maps)/.test(s)) return "google";
  if (/^(tt|tiktok)/.test(s)) return "tiktok";
  if (/^(flyer|panf|volante|adesivo|display|impresso)/.test(s)) return "panfleto";
  return "direto";
}

// ---------------------------------------------------------------- indicação
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
export function makeCode(len = 6, rnd: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(rnd() * ALPHA.length)];
  return s;
}
export function normalizeRef(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

// ---------------------------------------------------------------- aniversário (só dia e mês)
/** Aceita "25/12", "25-12" ou "2512" → "12-25" (MM-DD). Inválido → null. */
export function parseBirthday(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length !== 4) return null;
  const day = Number(d.slice(0, 2)), month = Number(d.slice(2, 4));
  if (month < 1 || month > 12 || day < 1) return null;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > max) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function formatBirthday(mmdd: string | null | undefined): string {
  if (!mmdd) return "";
  const [m, d] = mmdd.split("-");
  return `${d}/${m}`;
}

// ---------------------------------------------------------------- fidelidade
/** Soma um selo; devolve o novo total e se ganhou a recompensa (zerando o cartão). */
export function addStamp(current: number, needed: number): { stamps: number; reward: boolean } {
  const next = Math.max(0, current) + 1;
  if (next >= needed) return { stamps: next - needed, reward: true };
  return { stamps: next, reward: false };
}
/** Cashback em unidade menor da moeda (arredondado para baixo; mínimo 1). */
export function cashbackValue(totalMinor: number, pct: number): number {
  return Math.max(0, Math.floor((totalMinor * pct) / 100));
}

// ---------------------------------------------------------------- segmentos
export const SEGMENTS = ["all", "new", "loyal", "away30", "away60", "away90", "birthday"] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABELS: Record<Segment, { es: string; pt: string }> = {
  all: { es: "Todos (con permiso)", pt: "Todos (com autorização)" },
  new: { es: "Nuevos (1 compra)", pt: "Novos (1 compra)" },
  loyal: { es: "Fieles (3+ compras)", pt: "Fiéis (3+ compras)" },
  away30: { es: "Sin comprar hace 30+ días", pt: "Sumidos há 30+ dias" },
  away60: { es: "Sin comprar hace 60+ días", pt: "Sumidos há 60+ dias" },
  away90: { es: "Sin comprar hace 90+ días", pt: "Sumidos há 90+ dias" },
  birthday: { es: "Cumpleañeros del mes", pt: "Aniversariantes do mês" },
};

export type ShopperStats = { orders: number; lastOrderAt: Date | null; birthday: string | null };
export function inSegment(s: ShopperStats, seg: Segment, now = new Date()): boolean {
  const days = s.lastOrderAt ? (now.getTime() - s.lastOrderAt.getTime()) / 864e5 : Infinity;
  switch (seg) {
    case "all":
      return true;
    case "new":
      return s.orders === 1;
    case "loyal":
      return s.orders >= 3;
    case "away30":
      return s.orders > 0 && days >= 30;
    case "away60":
      return s.orders > 0 && days >= 60;
    case "away90":
      return s.orders > 0 && days >= 90;
    case "birthday":
      return !!s.birthday && s.birthday.slice(0, 2) === String(now.getMonth() + 1).padStart(2, "0");
  }
}

/** Troca {nome}, {loja}, {link}, {cupom} na mensagem. Primeiro nome apenas. */
export function fillTemplate(tpl: string, v: { nome?: string; loja?: string; link?: string; cupom?: string }) {
  const first = (v.nome ?? "").trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{nome\}/gi, first)
    .replace(/\{loja\}/gi, v.loja ?? "")
    .replace(/\{link\}/gi, v.link ?? "")
    .replace(/\{cupom\}/gi, v.cupom ?? "")
    .slice(0, 1000);
}

// ---------------------------------------------------------------- vitrine da cidade
export function citySlug(city: string): string {
  return city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
