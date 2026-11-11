// Acessos ao site oficial e à página de afiliados (tela CRM → Acessos e widget do app).
// Regras puras: qual área conta, o que é robô, de onde veio o visitante e as datas em Brasília.
// Um visitante = hash de IP + navegador + dia (sem cookie, sem dado pessoal guardado).

export type VisitArea = "site" | "afiliados" | "link";

export const VISIT_AREAS: { id: VisitArea; label: string; hint: string }[] = [
  { id: "site", label: "Site oficial", hint: "Início, planos, contratar, shopping e vitrine" },
  { id: "afiliados", label: "Página de afiliados", hint: "Programa de afiliados, cadastro e termos (sem contar afiliado logado)" },
  { id: "link", label: "Links de afiliados", hint: "Quem abriu um link /a/CÓDIGO de um afiliado" },
];

/** Área do caminho (null = não conta: painel, admin, CRM, lojas, APIs…). */
export function visitArea(path: string): VisitArea | null {
  const p = (path.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (p === "/" || /^\/(planos|contratar|shopping|vitrine|escaneou)(\/|$)/.test(p)) return "site";
  if (/^\/afiliados(\/(cadastro|termos|login))?$/.test(p)) return "afiliados";
  if (/^\/a\/[A-Za-z0-9]{3,16}(\/demo)?$/.test(p)) return "link";
  return null;
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\//i;
export function isBot(ua: string | null | undefined) {
  return !ua || ua.length < 20 || BOT.test(ua);
}

export function deviceOf(ua: string | null | undefined): "celular" | "computador" {
  return ua && /mobile|android|iphone|ipad/i.test(ua) ? "celular" : "computador";
}

const KNOWN: [RegExp, string][] = [
  [/instagram/i, "Instagram"],
  [/facebook|fb\.|fbclid/i, "Facebook"],
  [/whatsapp|wa\.me/i, "WhatsApp"],
  [/google\./i, "Google"],
  [/bing\./i, "Bing"],
  [/tiktok/i, "TikTok"],
  [/youtube|youtu\.be/i, "YouTube"],
  [/t\.co|twitter|x\.com/i, "X/Twitter"],
  [/linkedin/i, "LinkedIn"],
];

/** De onde veio: ?origem=/utm_source, senão o site anterior; sem nada = "Direto". */
export function visitSource(opts: { origem?: string | null; utm?: string | null; referrer?: string | null; ownHost?: string | null }) {
  const tag = (opts.origem || opts.utm || "").trim();
  if (tag) {
    const k = KNOWN.find(([re]) => re.test(tag));
    return k ? k[1] : tag.replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 30) || "Direto";
  }
  let host = "";
  try {
    host = opts.referrer ? new URL(opts.referrer).hostname.replace(/^www\./, "") : "";
  } catch {}
  if (!host || (opts.ownHost && host === opts.ownHost.replace(/^www\./, ""))) return "Direto";
  const k = KNOWN.find(([re]) => re.test(host));
  return k ? k[1] : host.slice(0, 40);
}

// ---------------------------------------------------------------- datas (Brasília, UTC-3)
const BR = -3 * 3600_000;
/** "2026-11-11" no horário de Brasília. */
export function brDayKey(d = new Date()) {
  return new Date(d.getTime() + BR).toISOString().slice(0, 10);
}
/** Últimos `n` dias (do mais antigo para hoje). */
export function lastDays(n: number, now = new Date()) {
  return Array.from({ length: n }, (_, i) => brDayKey(new Date(now.getTime() - (n - 1 - i) * 86400_000)));
}

export type DayCount = { day: string; area: VisitArea; visitors: number; views: number };

/** Junta as linhas do banco em séries por área para o gráfico (dias sem acesso = 0). */
export function visitSeries(rows: DayCount[], days: string[]) {
  const out = {} as Record<VisitArea, { visitors: number[]; views: number[]; totalVisitors: number; totalViews: number }>;
  for (const a of VISIT_AREAS) {
    const visitors = days.map((d) => rows.find((r) => r.area === a.id && r.day === d)?.visitors ?? 0);
    const views = days.map((d) => rows.find((r) => r.area === a.id && r.day === d)?.views ?? 0);
    out[a.id] = { visitors, views, totalVisitors: visitors.reduce((s, n) => s + n, 0), totalViews: views.reduce((s, n) => s + n, 0) };
  }
  return out;
}

/** Variação em % (null quando não há base). */
export function deltaPct(now: number, before: number) {
  if (!before) return now ? null : 0;
  return Math.round(((now - before) / before) * 100);
}
