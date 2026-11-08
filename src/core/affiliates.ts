// Programa de afiliados GoWeb (só Brasil). Lógica pura — testada em affiliates.test.ts.
// Regras combinadas com o Lázaro:
// • comissão sobre a IMPLANTAÇÃO paga (sem domínio), por nível: Bronze 15%, Prata 17%, Ouro 20%, Diamante 22%;
// • quem indicou o afiliado ganha 3% das vendas dele (um nível só — nunca mais que isso);
// • plano anual: +5% sobre a 1ª anuidade paga (só o afiliado que vendeu);
// • sem taxa de entrada, sem meta, sem multa: só recebe sobre venda paga.

export type AffiliateConfig = {
  tiers: { name: string; minSales: number; pctBp: number }[]; // pct em pontos-base (1500 = 15%)
  referrerPctBp: number;
  annualPctBp: number;
  cookieDays: number;
};

export const DEFAULT_AFFILIATE_CONFIG: AffiliateConfig = {
  tiers: [
    { name: "Bronze", minSales: 0, pctBp: 1500 },
    { name: "Prata", minSales: 5, pctBp: 1700 },
    { name: "Ouro", minSales: 15, pctBp: 2000 },
    { name: "Diamante", minSales: 30, pctBp: 2200 },
  ],
  referrerPctBp: 300,
  annualPctBp: 500,
  cookieDays: 60,
};

const bp = (v: unknown, def: number, max = 5000) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : def;
};

export function parseAffiliateConfig(raw: string | null | undefined): AffiliateConfig {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const D = DEFAULT_AFFILIATE_CONFIG;
  const tiersIn = Array.isArray(j.tiers) ? (j.tiers as Record<string, unknown>[]) : [];
  const tiers = D.tiers.map((t, i) => ({ name: t.name, minSales: i === 0 ? 0 : bp(tiersIn[i]?.minSales, t.minSales, 10000), pctBp: bp(tiersIn[i]?.pctBp, t.pctBp) }));
  // níveis sempre em ordem crescente de vendas
  for (let i = 1; i < tiers.length; i++) if (tiers[i].minSales <= tiers[i - 1].minSales) tiers[i].minSales = tiers[i - 1].minSales + 1;
  return { tiers, referrerPctBp: bp(j.referrerPctBp, D.referrerPctBp), annualPctBp: bp(j.annualPctBp, D.annualPctBp), cookieDays: bp(j.cookieDays, D.cookieDays, 365) || D.cookieDays };
}

/** Nível atual pelo total de vendas pagas, e quanto falta para o próximo. */
export function tierFor(sales: number, cfg: AffiliateConfig) {
  let idx = 0;
  cfg.tiers.forEach((t, i) => {
    if (sales >= t.minSales) idx = i;
  });
  const tier = cfg.tiers[idx];
  const next = cfg.tiers[idx + 1] ?? null;
  const progress = next ? (sales - tier.minSales) / (next.minSales - tier.minSales) : 1;
  return { index: idx, tier, next, toNext: next ? next.minSales - sales : 0, progress: Math.max(0, Math.min(1, progress)) };
}

/** Valor da comissão (centavos) — arredonda para baixo, nunca paga a mais. */
export function commission(baseMinor: number, pctBp: number) {
  return Math.floor((Math.max(0, baseMinor) * pctBp) / 10000);
}

export const pctLabel = (pctBp: number) => `${(pctBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// ---------------------------------------------------------------- CPF
export function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}
export function isValidCpf(raw: string) {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(c[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** Código do link: letras/números, 3 a 16, maiúsculo. */
export function normalizeAffCode(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

/** Nome curto para o ranking (privacidade): "João Silva Santos" → "João S." */
export function shortName(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
}

// ---------------------------------------------------------------- Pix "copia e cola" (BR Code estático com valor)
export type PixKeyType = "cpf" | "email" | "phone" | "random";

export function normalizePixKey(type: PixKeyType, key: string): string | null {
  const k = key.trim();
  if (type === "cpf") return isValidCpf(k) ? onlyDigits(k) : null;
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) ? k.toLowerCase() : null;
  if (type === "phone") {
    let d = onlyDigits(k);
    if (d.length === 11) d = `55${d}`;
    return /^55\d{11}$/.test(d) ? `+${d}` : null;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k) ? k.toLowerCase() : null;
}

function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const f = (id: string, v: string) => `${id}${String(v.length).padStart(2, "0")}${v}`;
const ascii = (s: string, n: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, n)
    .trim() || "GOWEB";

/** Gera o Pix "copia e cola" para pagar a comissão (o QR é o mesmo texto). */
export function pixPayload(o: { key: string; name: string; city: string; amountMinor: number; txid?: string }) {
  const mai = f("26", f("00", "br.gov.bcb.pix") + f("01", o.key));
  const amount = (o.amountMinor / 100).toFixed(2);
  const txid = (o.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const body = f("00", "01") + mai + f("52", "0000") + f("53", "986") + f("54", amount) + f("58", "BR") + f("59", ascii(o.name, 25)) + f("60", ascii(o.city, 15)) + f("62", f("05", txid)) + "6304";
  return body + crc16(body);
}

// ---------------------------------------------------------------- gamificação
export type Stats = { clicks7d: number; leads7d: number; scheduled7d: number; salesMonth: number; salesTotal: number; recruits: number; weeksWithSale: number };

export const BADGES: { id: string; title: string; desc: string; done: (s: Stats) => boolean }[] = [
  { id: "first-click", title: "Primeiro clique", desc: "Alguém abriu o seu link", done: (s) => s.clicks7d > 0 || s.salesTotal > 0 },
  { id: "first-sale", title: "Primeira venda", desc: "Fechou o primeiro contrato", done: (s) => s.salesTotal >= 1 },
  { id: "five-month", title: "5 no mês", desc: "5 vendas no mesmo mês", done: (s) => s.salesMonth >= 5 },
  { id: "ten-total", title: "Dezena", desc: "10 vendas no total", done: (s) => s.salesTotal >= 10 },
  { id: "recruiter", title: "Formador", desc: "Trouxe 3 afiliados", done: (s) => s.recruits >= 3 },
  { id: "streak", title: "Sequência", desc: "Vendeu 3 semanas seguidas", done: (s) => s.weeksWithSale >= 3 },
];

export function missions(s: Stats) {
  return [
    { id: "share", title: "Divulgue o seu link", goal: 20, value: s.clicks7d, unit: "cliques" },
    { id: "leads", title: "Cadastre indicações", goal: 5, value: s.leads7d, unit: "indicações" },
    { id: "schedule", title: "Agende demonstrações", goal: 3, value: s.scheduled7d, unit: "agendas" },
  ].map((m) => ({ ...m, pct: Math.min(1, m.value / m.goal), done: m.value >= m.goal }));
}

/** Pontos de experiência: vendas valem muito; agendas e indicações valem um pouco. */
export function xp(o: { sales: number; scheduled: number; leads: number }) {
  return o.sales * 100 + o.scheduled * 15 + o.leads * 5;
}

export const LEAD_STATUSES = ["NEW", "SCHEDULED", "NOT_SCHEDULED", "SIGNED", "WON", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_LABELS: Record<LeadStatus, string> = {
  NEW: "Nova indicação",
  SCHEDULED: "Demonstração agendada",
  NOT_SCHEDULED: "Não agendou",
  SIGNED: "Contratou (aguardando pagamento)",
  WON: "Fechou",
  LOST: "Não fechou",
};
