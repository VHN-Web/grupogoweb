// Regras puras (testáveis) do GoInteligence: oferta relâmpago, cupons, sugestões e agenda.

// ---------------------------------------------------------------- oferta relâmpago
export type PricedProduct = { pricePyg: number; promoPricePyg: number | null; promoEndsAt: Date | null };

export function promoActive(p: PricedProduct, now = new Date()): boolean {
  return p.promoPricePyg != null && p.promoEndsAt != null && p.promoEndsAt.getTime() > now.getTime() && p.promoPricePyg < p.pricePyg && p.promoPricePyg > 0;
}

/** Preço efetivo (minor units da moeda base): promo se ativa, senão o normal. */
export function effectivePrice(p: PricedProduct, now = new Date()): number {
  return promoActive(p, now) ? p.promoPricePyg! : p.pricePyg;
}

// ---------------------------------------------------------------- cupons
export type CouponLike = {
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  active: boolean;
};

export type CouponCheck = { ok: true; discount: number } | { ok: false; reason: "INACTIVE" | "EXPIRED" | "EXHAUSTED" | "MIN_SUBTOTAL" };

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

export function checkCoupon(c: CouponLike, subtotal: number, now = new Date()): CouponCheck {
  if (!c.active) return { ok: false, reason: "INACTIVE" };
  if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return { ok: false, reason: "EXPIRED" };
  if (c.maxUses != null && c.uses >= c.maxUses) return { ok: false, reason: "EXHAUSTED" };
  if (subtotal < c.minSubtotal) return { ok: false, reason: "MIN_SUBTOTAL" };
  const raw = c.kind === "PERCENT" ? Math.floor((subtotal * Math.min(Math.max(c.value, 0), 90)) / 100) : c.value;
  return { ok: true, discount: Math.max(0, Math.min(raw, subtotal)) };
}

// ---------------------------------------------------------------- sugestões inteligentes
export type SuggestProduct = { id: string; categoryId: string | null; categoryName: string | null; available: boolean; service: boolean };

// Categorias que costumam complementar um pedido (bebida, acompanhamento, sobremesa...)
const COMPLEMENT = /(bebid|drink|refri|gaseos|suco|jugo|chopp|cervej|cervez|papa|batata|porç|porcio|acompa|extra|adicion|sobremes|postre|doce|dulce|salsa|molho|produto|producto|acess|accesor|skincare|maqui)/i;

/**
 * Sugestões por produto: 1) o que mais foi comprado junto (histórico de pedidos);
 * 2) completa com itens de OUTRAS categorias, priorizando as "complementares" e os mais vendidos.
 */
export function buildSuggestions(
  products: SuggestProduct[],
  orders: string[][], // cada pedido = lista de productIds
  limit = 3,
): Record<string, string[]> {
  const avail = products.filter((p) => p.available && !p.service);
  const byId = new Map(products.map((p) => [p.id, p]));
  const sold = new Map<string, number>();
  const pair = new Map<string, Map<string, number>>();
  for (const o of orders) {
    const uniq = [...new Set(o)].filter((id) => byId.has(id));
    for (const a of uniq) {
      sold.set(a, (sold.get(a) ?? 0) + 1);
      for (const b of uniq) {
        if (a === b) continue;
        const m = pair.get(a) ?? new Map<string, number>();
        m.set(b, (m.get(b) ?? 0) + 1);
        pair.set(a, m);
      }
    }
  }
  const out: Record<string, string[]> = {};
  for (const p of products) {
    if (!p.available) continue;
    const picks: string[] = [];
    const together = [...(pair.get(p.id) ?? new Map()).entries()]
      .filter(([id]) => avail.some((x) => x.id === id) && byId.get(id)?.categoryId !== p.categoryId)
      .sort((a, b) => b[1] - a[1]);
    for (const [id] of together) if (picks.length < limit) picks.push(id);
    const rest = avail
      .filter((x) => x.id !== p.id && x.categoryId !== p.categoryId && !picks.includes(x.id))
      .sort((a, b) => {
        const ca = COMPLEMENT.test(a.categoryName ?? "") ? 1 : 0;
        const cb = COMPLEMENT.test(b.categoryName ?? "") ? 1 : 0;
        return cb - ca || (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0);
      });
    // no máximo 1 por categoria no complemento, para variar
    const usedCats = new Set(picks.map((id) => byId.get(id)?.categoryId));
    for (const x of rest) {
      if (picks.length >= limit) break;
      if (usedCats.has(x.categoryId)) continue;
      picks.push(x.id);
      usedCats.add(x.categoryId);
    }
    if (picks.length) out[p.id] = picks;
  }
  return out;
}

// ---------------------------------------------------------------- agenda
export type BookingConfig = {
  enabled: boolean;
  slotMin: number; // intervalo entre horários
  /** horário por dia da semana (0=domingo): "09:00-19:00" ou "" (fechado) */
  hours: string[];
  /** antecedência mínima em minutos */
  leadMin: number;
  /** quantos dias à frente o cliente pode agendar */
  daysAhead: number;
};

export const DEFAULT_BOOKING: BookingConfig = {
  enabled: false,
  slotMin: 30,
  hours: ["", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-14:00"],
  leadMin: 60,
  daysAhead: 14,
};

export function parseBookingConfig(raw: string | null | undefined): BookingConfig {
  try {
    const j = JSON.parse(raw || "{}") as Partial<BookingConfig>;
    const hours = Array.isArray(j.hours) && j.hours.length === 7 ? j.hours.map((h) => (typeof h === "string" ? h : "")) : DEFAULT_BOOKING.hours;
    return {
      enabled: !!j.enabled,
      slotMin: [15, 20, 30, 45, 60].includes(Number(j.slotMin)) ? Number(j.slotMin) : DEFAULT_BOOKING.slotMin,
      hours,
      leadMin: Number.isFinite(Number(j.leadMin)) ? Math.max(0, Number(j.leadMin)) : DEFAULT_BOOKING.leadMin,
      daysAhead: Number.isFinite(Number(j.daysAhead)) ? Math.min(60, Math.max(1, Number(j.daysAhead))) : DEFAULT_BOOKING.daysAhead,
    };
  } catch {
    return DEFAULT_BOOKING;
  }
}

function hm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 ? v : null;
}

/** Diferença (min) entre o horário local do fuso e UTC naquele instante. */
export function tzOffsetMin(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Converte "2026-11-07" + minutos do dia (horário local do fuso) em Date UTC. */
export function localToUtc(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  const off = tzOffsetMin(guess, timeZone);
  return new Date(guess.getTime() - off * 60000);
}

/** Horários livres no dia `date` (YYYY-MM-DD, fuso do estabelecimento) para um serviço de `duration` min. */
export function freeSlots(
  cfg: BookingConfig,
  date: string,
  duration: number,
  busy: { startsAt: Date; durationMin: number }[],
  timeZone: string,
  now = new Date(),
): { label: string; startsAt: Date }[] {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const spec = cfg.hours[weekday] ?? "";
  const [a, b] = spec.split("-");
  const open = a ? hm(a) : null;
  const close = b ? hm(b) : null;
  if (open == null || close == null || close <= open) return [];
  const out: { label: string; startsAt: Date }[] = [];
  for (let t = open; t + duration <= close; t += cfg.slotMin) {
    const start = localToUtc(date, t, timeZone);
    if (start.getTime() < now.getTime() + cfg.leadMin * 60000) continue;
    const end = start.getTime() + duration * 60000;
    const clash = busy.some((x) => {
      const s = x.startsAt.getTime();
      const e = s + x.durationMin * 60000;
      return start.getTime() < e && end > s;
    });
    if (clash) continue;
    out.push({ label: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`, startsAt: start });
  }
  return out;
}

// ---------------------------------------------------------------- WhatsApp (link direto)
export function waLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
