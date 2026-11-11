// =============================================================================
// Assessoria GoWeb (complemento opcional de crescimento, qualquer plano) — regras PURAS.
// Diagnóstico da loja, divisão do investimento (assessoria GoWeb × verba sugerida de anúncios),
// entregas por faixa, metas e faixas de resultado (estimativas, nunca garantia), calendário de conteúdo,
// tarefas de anúncio orientado (o lojista paga a Meta/Google direto — sem API de anúncios), insights,
// agenda (.ics / link do Google Agenda) e regras da publicação automática no Instagram.
// Valores em unidade menor da moeda base da loja (BRL = centavos, PYG = guaraníes).
// =============================================================================

export type BaseCurrency = "BRL" | "PYG";

// ---------------------------------------------------------------- configuração (Admin → Planos → Assessoria)
export type Tier = { from: number; postsPerWeek: number; adPlans: boolean; campaigns: boolean; partner: "none" | "monthly" | "biweekly" };
export type Pricing = {
  minimum: number; // assessoria mínima por mês
  rate1: number; // % sobre o que passa do mínimo até `cut`
  cut: number;
  rate2: number; // % sobre o que passa de `cut`
  sliderMax: number; // fim da barrinha (acima disso o lojista digita; não há teto)
  step: number;
  adsMinimum: number; // abaixo disso não sugerimos anúncio (só ações orgânicas)
  discount6: number; // desconto na assessoria (fração) para 6 meses
  discount12: number;
  tiers: Tier[]; // por valor da assessoria, ordem crescente de `from`
};
export type AdvisoryConfig = {
  enabled: boolean; // complemento visível para os lojistas
  pricing: Partial<Record<BaseCurrency, Pricing>>; // moeda sem preço = complemento não aparece naquele país
  aiMonthlyPerStore: number; // gerações de IA (legendas/roteiros) por loja por mês
  igPublishEnabled: boolean; // publicação automática: só depois que a Meta aprovar instagram_business_content_publish
};

const TIERS_BRL: Tier[] = [
  { from: 0, postsPerWeek: 2, adPlans: false, campaigns: false, partner: "none" },
  { from: 15000, postsPerWeek: 3, adPlans: true, campaigns: true, partner: "none" },
  { from: 40000, postsPerWeek: 5, adPlans: true, campaigns: true, partner: "monthly" },
  { from: 100000, postsPerWeek: 7, adPlans: true, campaigns: true, partner: "biweekly" },
];

/** Sugestão aprovada no documento (Brasil). Paraguai sem preço até o dono definir em Gs. */
export const DEFAULT_ADVISORY: AdvisoryConfig = {
  enabled: false,
  pricing: {
    BRL: { minimum: 9700, rate1: 0.2, cut: 200000, rate2: 0.12, sliderMax: 500000, step: 1000, adsMinimum: 15000, discount6: 0.05, discount12: 0.1, tiers: TIERS_BRL },
  },
  aiMonthlyPerStore: 120,
  igPublishEnabled: false,
};

const num = (v: unknown, def: number, min = 0, max = 1e12) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};
const int = (v: unknown, def: number, min = 0, max = 1e12) => Math.round(num(v, def, min, max));

function parsePricing(raw: unknown, def: Pricing | undefined): Pricing | undefined {
  if (!raw || typeof raw !== "object") return def;
  const o = raw as Record<string, unknown>;
  // sem padrão (ex.: Paraguai): faixas proporcionais ao mínimo informado (1,5×, 4× e 10× — mesma escala do Brasil)
  const min0 = int(o.minimum, def?.minimum ?? 0, 1);
  const d = def ?? { minimum: min0, rate1: 0.2, cut: min0 * 20, rate2: 0.12, sliderMax: min0 * 50, step: Math.max(1, Math.round(min0 / 10)), adsMinimum: min0 * 1.5, discount6: 0.05, discount12: 0.1, tiers: TIERS_BRL.map((t, i) => ({ ...t, from: Math.round([0, 1.5, 4, 10][i] * min0) })) };
  const minimum = min0;
  const cut = Math.max(minimum, int(o.cut, d.cut || minimum));
  const tiersRaw = Array.isArray(o.tiers) ? o.tiers : d.tiers;
  const tiers = tiersRaw
    .map((t, i) => {
      const x = (t ?? {}) as Record<string, unknown>;
      const dt = d.tiers[i] ?? d.tiers[d.tiers.length - 1];
      const partner = x.partner === "monthly" || x.partner === "biweekly" || x.partner === "none" ? x.partner : dt.partner;
      return { from: int(x.from, dt.from), postsPerWeek: int(x.postsPerWeek, dt.postsPerWeek, 0, 14), adPlans: typeof x.adPlans === "boolean" ? x.adPlans : dt.adPlans, campaigns: typeof x.campaigns === "boolean" ? x.campaigns : dt.campaigns, partner };
    })
    .sort((a, b) => a.from - b.from);
  if (!tiers.length || !minimum) return def;
  tiers[0].from = 0;
  return {
    minimum,
    rate1: num(o.rate1, d.rate1, 0, 1),
    cut,
    rate2: num(o.rate2, d.rate2, 0, 1),
    sliderMax: Math.max(minimum * 2, int(o.sliderMax, d.sliderMax || minimum * 20)),
    step: Math.max(1, int(o.step, d.step)),
    adsMinimum: int(o.adsMinimum, d.adsMinimum),
    discount6: num(o.discount6, d.discount6, 0, 0.5),
    discount12: num(o.discount12, d.discount12, 0, 0.5),
    tiers,
  };
}

export function parseAdvisory(raw: string | null | undefined): AdvisoryConfig {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const pr = (j.pricing && typeof j.pricing === "object" ? j.pricing : {}) as Record<string, unknown>;
  const pricing: AdvisoryConfig["pricing"] = {};
  for (const c of ["BRL", "PYG"] as const) {
    const p = c in pr ? (pr[c] === null ? undefined : parsePricing(pr[c], DEFAULT_ADVISORY.pricing[c])) : DEFAULT_ADVISORY.pricing[c];
    if (p) pricing[c] = p;
  }
  return {
    enabled: j.enabled === true,
    pricing,
    aiMonthlyPerStore: int(j.aiMonthlyPerStore, DEFAULT_ADVISORY.aiMonthlyPerStore, 0, 100000),
    igPublishEnabled: j.igPublishEnabled === true,
  };
}

/** O complemento aparece para esta loja? (conferido no servidor em toda tela e ação) */
export function advisoryAvailable(cfg: AdvisoryConfig, t: { currency: string; demo: boolean }): { ok: true; pricing: Pricing } | { ok: false; reason: "off" | "no_price" } {
  if (!cfg.enabled && !t.demo) return { ok: false, reason: "off" };
  const p = cfg.pricing[t.currency as BaseCurrency];
  if (!p) return { ok: false, reason: "no_price" };
  return { ok: true, pricing: p };
}

// ---------------------------------------------------------------- divisão do valor
export const DURATIONS = [3, 6, 12] as const;
export type Duration = (typeof DURATIONS)[number];
export const isDuration = (n: number): n is Duration => (DURATIONS as readonly number[]).includes(n);

export type Split = {
  total: number; // o que o lojista escolheu investir por mês
  feeBase: number; // assessoria antes do desconto de prazo
  fee: number; // assessoria a pagar por mês
  discount: number; // valor do desconto por mês
  ads: number; // verba sugerida de anúncios (paga direto à Meta/Google)
  adsTooSmall: boolean; // abaixo do mínimo útil: plano sem anúncio
  tier: Tier;
  feePct: number; // % do total que fica com a GoWeb (antes do desconto)
};

/** Assessoria = mínimo + rate1 × (parte até `cut`) + rate2 × (parte acima de `cut`). Sem teto. */
export function splitInvestment(totalRaw: number, months: number, p: Pricing): Split {
  const total = Math.max(p.minimum, Math.round(totalRaw));
  const mid = Math.max(0, Math.min(total, p.cut) - p.minimum);
  const high = Math.max(0, total - p.cut);
  const feeBase = Math.min(total, Math.round(p.minimum + p.rate1 * mid + p.rate2 * high));
  const d = months >= 12 ? p.discount12 : months >= 6 ? p.discount6 : 0;
  const discount = Math.round(feeBase * d);
  const ads = total - feeBase;
  return { total, feeBase, fee: feeBase - discount, discount, ads, adsTooSmall: ads < p.adsMinimum, tier: tierFor(feeBase, p), feePct: total ? feeBase / total : 1 };
}

export function tierFor(fee: number, p: Pricing): Tier {
  let t = p.tiers[0];
  for (const x of p.tiers) if (fee >= x.from) t = x;
  return t;
}

/** Valor digitado/arrastado → múltiplo do passo, nunca abaixo do mínimo. */
export const snapTotal = (v: number, p: Pricing) => Math.max(p.minimum, Math.round(v / p.step) * p.step);

// ---------------------------------------------------------------- objetivos
export const OBJECTIVES = ["revenue", "ticket", "new", "return", "weak", "google"] as const;
export type Objective = (typeof OBJECTIVES)[number];
export const OBJECTIVE_LABELS: Record<Objective, { es: string; pt: string }> = {
  revenue: { es: "Facturar más", pt: "Faturar mais" },
  ticket: { es: "Subir el ticket promedio", pt: "Aumentar o ticket médio" },
  new: { es: "Traer clientes nuevos", pt: "Trazer clientes novos" },
  return: { es: "Que el cliente vuelva", pt: "Fazer o cliente voltar" },
  weak: { es: "Llenar los horarios flojos", pt: "Encher os horários fracos" },
  google: { es: "Aparecer en Google y Maps", pt: "Aparecer no Google e no Maps" },
};
export function parseObjectives(raw: unknown): Objective[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return [...new Set(arr.map((x) => String(x).trim()).filter((x): x is Objective => (OBJECTIVES as readonly string[]).includes(x)))].slice(0, 3);
}

// ---------------------------------------------------------------- diagnóstico
/** Respostas do formulário (o que o sistema não sabe sozinho). */
export type SelfReport = {
  hasInstagram: boolean;
  followers: number | null;
  postsPerWeek: number | null;
  hasGoogleProfile: boolean;
  googleRating: number | null; // 4.6
  googleReviews: number | null;
  profitPerOrderPct: number | null; // lucro médio por pedido (% do ticket) — usado no alerta do anúncio
};

/** Números da loja nos últimos 90 dias (calculados pelo serviço, sempre filtrando pelo tenant). */
export type StoreMetrics = {
  days: number; // janela (90)
  orders: number;
  revenue: number;
  itemsPerOrder: number; // média de itens por pedido
  customers: number; // clientes identificados (com WhatsApp)
  newCustomers: number; // primeira compra dentro da janela
  repeatCustomers: number; // clientes com 2+ pedidos na janela
  bySlot: number[]; // 7×24 pedidos por dia da semana (0 = domingo) e hora, no fuso da loja
  bySource: Record<string, number>;
  topProducts: { id: string; name: string; qty: number }[];
  optInCustomers: number;
};

export const FRONTS = ["ticket", "frequency", "acquisition", "weak", "presence"] as const;
export type Front = (typeof FRONTS)[number];
export const FRONT_LABELS: Record<Front, { es: string; pt: string }> = {
  ticket: { es: "Ticket promedio", pt: "Ticket médio" },
  frequency: { es: "Frecuencia", pt: "Frequência" },
  acquisition: { es: "Clientes nuevos", pt: "Clientes novos" },
  weak: { es: "Horarios flojos", pt: "Horários fracos" },
  presence: { es: "Presencia digital", pt: "Presença digital" },
};

export type Diagnosis = {
  score: number; // 0–100
  fronts: Record<Front, number>; // 0–100 cada
  ticket: number; // ticket médio
  monthlyRevenue: number;
  monthlyOrders: number;
  repeatRate: number; // fração de clientes que voltaram
  newPerMonth: number;
  weakSlots: { dow: number; hour: number }[]; // até 3 janelas fracas dentro do horário de movimento
  peakSlots: { dow: number; hour: number }[];
  enoughData: boolean; // ≥ 30 pedidos na janela: libera faixas em dinheiro
  gaps: string[]; // códigos do que falta (UI traduz)
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const MIN_ORDERS_FOR_ESTIMATE = 30;

/** Janelas de 1 h com movimento: ordena por volume. Fracas = abaixo de 35% da média entre as que têm pedido. */
export function slots(bySlot: number[]) {
  const all = bySlot.map((n, i) => ({ dow: Math.floor(i / 24), hour: i % 24, n })).filter((s) => s.n > 0);
  if (!all.length) return { peak: [] as { dow: number; hour: number }[], weak: [] as { dow: number; hour: number }[] };
  const avg = all.reduce((a, s) => a + s.n, 0) / all.length;
  const peak = [...all].sort((a, b) => b.n - a.n || a.dow - b.dow || a.hour - b.hour).slice(0, 3);
  const weak = all.filter((s) => s.n <= avg * 0.35).sort((a, b) => a.n - b.n || a.dow - b.dow || a.hour - b.hour).slice(0, 3);
  return { peak: peak.map(({ dow, hour }) => ({ dow, hour })), weak: weak.map(({ dow, hour }) => ({ dow, hour })) };
}

export function diagnose(m: StoreMetrics, r: SelfReport): Diagnosis {
  const months = Math.max(1, m.days / 30);
  const ticket = m.orders ? Math.round(m.revenue / m.orders) : 0;
  const repeatRate = m.customers ? m.repeatCustomers / m.customers : 0;
  const newPerMonth = Math.round(m.newCustomers / months);
  const { peak, weak } = slots(m.bySlot);
  const gaps: string[] = [];

  // ticket: itens por pedido (1 item = espaço para combo/adicional)
  const ticketScore = clamp(Math.round(((m.itemsPerOrder - 1) / 1.5) * 100));
  if (m.itemsPerOrder < 1.8) gaps.push("few_items");
  // frequência: 35%+ de recompra é ótimo para delivery/restaurante pequeno
  const freqScore = clamp(Math.round((repeatRate / 0.35) * 100));
  if (repeatRate < 0.2) gaps.push("low_repeat");
  if (m.optInCustomers < m.customers * 0.3) gaps.push("low_optin");
  // aquisição: clientes novos/mês e diversidade de origem
  const sources = Object.entries(m.bySource).filter(([k, v]) => k !== "direto" && v > 0).length;
  const acqScore = clamp(Math.round(Math.min(1, newPerMonth / 40) * 70 + Math.min(3, sources) * 10));
  if (sources <= 1) gaps.push("one_source");
  // horários fracos: quanto do movimento fica concentrado nos picos
  const total = m.bySlot.reduce((a, b) => a + b, 0);
  const top = [...m.bySlot].sort((a, b) => b - a).slice(0, 6).reduce((a, b) => a + b, 0);
  const weakScore = total ? clamp(Math.round((1 - top / total) * 130)) : 0;
  if (weak.length) gaps.push("weak_slots");
  // presença: Instagram ativo + Google
  let pres = 0;
  if (r.hasInstagram) pres += 20;
  if ((r.postsPerWeek ?? 0) >= 3) pres += 20;
  else if ((r.postsPerWeek ?? 0) >= 1) pres += 10;
  if (r.hasGoogleProfile) pres += 25;
  if ((r.googleRating ?? 0) >= 4.5) pres += 15;
  else if ((r.googleRating ?? 0) >= 4) pres += 8;
  if ((r.googleReviews ?? 0) >= 50) pres += 20;
  else if ((r.googleReviews ?? 0) >= 15) pres += 10;
  if (!r.hasGoogleProfile) gaps.push("no_google");
  if (!r.hasInstagram || (r.postsPerWeek ?? 0) < 2) gaps.push("few_posts");
  if ((r.googleReviews ?? 0) < 15) gaps.push("few_reviews");
  const fronts: Record<Front, number> = { ticket: ticketScore, frequency: freqScore, acquisition: acqScore, weak: weakScore, presence: clamp(pres) };
  const score = Math.round(FRONTS.reduce((a, f) => a + fronts[f], 0) / FRONTS.length);
  return {
    score,
    fronts,
    ticket,
    monthlyRevenue: Math.round(m.revenue / months),
    monthlyOrders: Math.round(m.orders / months),
    repeatRate,
    newPerMonth,
    weakSlots: weak,
    peakSlots: peak,
    enoughData: m.orders >= MIN_ORDERS_FOR_ESTIMATE,
    gaps,
  };
}

// ---------------------------------------------------------------- metas e faixas de resultado (estimativas)
/**
 * Premissas conservadoras, mostradas na tela junto com o resultado:
 *  - ticket: +4% a +10% com combos/adicionais sugeridos
 *  - frequência: +2 a +6 pontos de recompra com campanhas de volta (só clientes com opt-in)
 *  - horários fracos: +3% a +8% dos pedidos com oferta no horário
 *  - anúncios: custo por pedido entre 25% e 60% do ticket médio (faixa de mercado para delivery local)
 *  - presença digital: não entra na faixa em dinheiro (efeito lento e difícil de atribuir)
 */
export const ASSUMPTIONS = {
  ticketUp: [0.04, 0.1],
  repeatUpPts: [0.02, 0.06],
  weakUp: [0.03, 0.08],
  costPerOrderOfTicket: [0.6, 0.25], // [pior, melhor]
} as const;

export type Goals = {
  ticket: { from: number; to: number } | null;
  repeatRate: { from: number; to: number } | null;
  newPerMonth: { from: number; to: number } | null;
  reviews: { from: number; to: number } | null;
  postsPerWeek: number;
};

export type Estimate = { monthlyLow: number; monthlyHigh: number; adsOrdersLow: number; adsOrdersHigh: number } | null;

export function goalsFor(d: Diagnosis, objectives: Objective[], s: Split, r: SelfReport): Goals {
  const has = (o: Objective) => objectives.includes(o) || objectives.includes("revenue");
  return {
    ticket: has("ticket") && d.ticket ? { from: d.ticket, to: Math.round(d.ticket * (1 + ASSUMPTIONS.ticketUp[0] + (ASSUMPTIONS.ticketUp[1] - ASSUMPTIONS.ticketUp[0]) / 2)) } : null,
    repeatRate: has("return") ? { from: d.repeatRate, to: Math.min(0.9, d.repeatRate + 0.04) } : null,
    newPerMonth: has("new") || !s.adsTooSmall ? { from: d.newPerMonth, to: d.newPerMonth + (s.adsTooSmall || !d.ticket ? 3 : Math.max(3, Math.round(s.ads / (d.ticket * 0.45) / 2))) } : null,
    reviews: objectives.includes("google") ? { from: r.googleReviews ?? 0, to: (r.googleReviews ?? 0) + 10 } : null,
    postsPerWeek: s.tier.postsPerWeek,
  };
}

/** Ganho mensal possível (faixa), só com dados suficientes. Anúncio só conta se houver verba útil. */
export function estimate(d: Diagnosis, objectives: Objective[], s: Split): Estimate {
  if (!d.enoughData || !d.ticket) return null;
  const all = objectives.includes("revenue");
  const on = (o: Objective) => all || objectives.includes(o);
  const base = d.monthlyRevenue;
  let low = 0;
  let high = 0;
  if (on("ticket")) {
    low += base * ASSUMPTIONS.ticketUp[0];
    high += base * ASSUMPTIONS.ticketUp[1];
  }
  if (on("return")) {
    const perCustomerMonth = d.monthlyOrders ? base / Math.max(1, d.monthlyOrders) : d.ticket;
    const customers = d.monthlyOrders; // aproximação: 1 pedido ≈ 1 cliente/mês
    low += customers * ASSUMPTIONS.repeatUpPts[0] * perCustomerMonth;
    high += customers * ASSUMPTIONS.repeatUpPts[1] * perCustomerMonth;
  }
  if (on("weak") && d.weakSlots.length) {
    low += base * ASSUMPTIONS.weakUp[0];
    high += base * ASSUMPTIONS.weakUp[1];
  }
  let adsLow = 0;
  let adsHigh = 0;
  if (!s.adsTooSmall && (on("new") || all)) {
    adsLow = Math.floor(s.ads / (d.ticket * ASSUMPTIONS.costPerOrderOfTicket[0]));
    adsHigh = Math.floor(s.ads / (d.ticket * ASSUMPTIONS.costPerOrderOfTicket[1]));
    low += adsLow * d.ticket;
    high += adsHigh * d.ticket;
  }
  return { monthlyLow: Math.round(low), monthlyHigh: Math.round(high), adsOrdersLow: adsLow, adsOrdersHigh: adsHigh };
}

// ---------------------------------------------------------------- plano mês a mês
export const ACTIONS = ["combo", "addon", "free_delivery", "winback", "loyalty", "birthday", "flash_offer", "ads", "google_profile", "review_ask", "posts", "referral"] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_LABELS: Record<Action, { es: string; pt: string }> = {
  combo: { es: "Combo con los más vendidos", pt: "Combo com os mais vendidos" },
  addon: { es: "Sugerir adicional en el carrito", pt: "Sugerir adicional no carrinho" },
  free_delivery: { es: "Envío gratis desde un mínimo", pt: "Frete grátis a partir de um mínimo" },
  winback: { es: "Campaña para quien no pide hace 30 días", pt: "Campanha para quem sumiu há 30 dias" },
  loyalty: { es: "Fidelidad (sellos o cashback)", pt: "Fidelidade (selos ou cashback)" },
  birthday: { es: "Saludo y cupón de cumpleaños", pt: "Parabéns e cupom de aniversário" },
  flash_offer: { es: "Oferta relámpago en el horario flojo", pt: "Oferta relâmpago no horário fraco" },
  ads: { es: "Anuncio orientado (vos pagás a Meta/Google)", pt: "Anúncio orientado (você paga a Meta/Google)" },
  google_profile: { es: "Perfil de Google y Maps completo", pt: "Perfil do Google e Maps completo" },
  review_ask: { es: "Pedir reseña después de la entrega", pt: "Pedir avaliação depois da entrega" },
  posts: { es: "Calendario de posteos", pt: "Calendário de posts" },
  referral: { es: "Recomendá y ganá", pt: "Indique e ganhe" },
};
/** Ações que dependem do GoInteligence (sem o plano viram sugestão de upgrade). */
export const PRO_ACTIONS: ReadonlySet<Action> = new Set(["winback", "loyalty", "birthday", "flash_offer", "referral"]);

export type MonthPlan = { month: number; actions: Action[] };

export function buildPlan(o: { objectives: Objective[]; months: number; split: Split; diagnosis: Diagnosis }): MonthPlan[] {
  const want = (x: Objective) => o.objectives.includes(x) || o.objectives.includes("revenue");
  const queue: Action[] = [];
  const push = (...a: Action[]) => a.forEach((x) => !queue.includes(x) && queue.push(x));
  // primeiro o que tem efeito rápido e custo zero
  if (want("google") || o.diagnosis.gaps.includes("no_google")) push("google_profile");
  if (want("ticket")) push("combo", "addon");
  if (want("new") && !o.split.adsTooSmall && o.split.tier.adPlans) push("ads");
  if (want("return")) push("winback");
  if (want("weak") && o.diagnosis.weakSlots.length) push("flash_offer");
  if (want("google")) push("review_ask");
  if (want("ticket")) push("free_delivery");
  if (want("return")) push("loyalty", "birthday");
  if (want("new")) push("referral");
  push("review_ask");
  const months = Math.max(1, Math.min(12, o.months));
  const perMonth = Math.max(2, Math.ceil(queue.length / Math.min(months, 3)));
  const out: MonthPlan[] = [];
  const active: Action[] = ["posts"];
  for (let m = 1; m <= months; m++) {
    for (const a of queue.splice(0, perMonth)) active.push(a);
    out.push({ month: m, actions: [...active] });
  }
  return out;
}

// ---------------------------------------------------------------- calendário de conteúdo
export const THEMES = ["product", "combo", "behind", "review", "weak_offer", "question", "date"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, { es: string; pt: string }> = {
  product: { es: "Producto destacado", pt: "Produto em destaque" },
  combo: { es: "Combo", pt: "Combo" },
  behind: { es: "Detrás de escena", pt: "Bastidores" },
  review: { es: "Opinión de cliente", pt: "Avaliação de cliente" },
  weak_offer: { es: "Oferta del horario flojo", pt: "Oferta do horário fraco" },
  question: { es: "Pregunta para la comunidad", pt: "Pergunta para o público" },
  date: { es: "Fecha especial", pt: "Data comemorativa" },
};

/** Dias da semana preferidos para N posts (0 = domingo): espalha começando na sexta, quando o delivery mais vende. */
const DAY_ORDER = [5, 2, 0, 3, 6, 1, 4];
export function postDays(perWeek: number) {
  return DAY_ORDER.slice(0, Math.max(0, Math.min(7, perWeek))).sort((a, b) => a - b);
}

/** Hora sugerida: 1 h antes do pico daquele dia (ou do pico geral); sem dados, 11h. */
export function postHour(dow: number, peaks: { dow: number; hour: number }[]) {
  const p = peaks.find((x) => x.dow === dow) ?? peaks[0];
  return p ? Math.max(8, Math.min(21, p.hour - 1)) : 11;
}

export type Slot = { date: string; hour: number; theme: Theme; productId: string | null };

/**
 * Posts das próximas `weeks` semanas a partir de `startDate` (AAAA-MM-DD no fuso da loja).
 * Tema gira sem repetir em sequência; produto gira entre os mais vendidos.
 */
export function contentSlots(o: { startDate: string; weeks: number; perWeek: number; peaks: { dow: number; hour: number }[]; hasWeak: boolean; products: string[] }): Slot[] {
  const days = postDays(o.perWeek);
  if (!days.length) return [];
  const themes: Theme[] = ["product", "combo", "behind", "review", "question", ...(o.hasWeak ? (["weak_offer"] as Theme[]) : [])];
  const out: Slot[] = [];
  const start = Date.parse(`${o.startDate}T12:00:00Z`);
  let k = 0;
  for (let i = 0; i < o.weeks * 7; i++) {
    const d = new Date(start + i * 86_400_000);
    const dow = d.getUTCDay();
    if (!days.includes(dow)) continue;
    const theme = themes[k % themes.length];
    const needsProduct = theme === "product" || theme === "combo" || theme === "weak_offer";
    out.push({ date: d.toISOString().slice(0, 10), hour: postHour(dow, o.peaks), theme, productId: needsProduct && o.products.length ? o.products[k % o.products.length] : null });
    k++;
  }
  return out;
}

/** Legenda pronta (sem IA) — base para o lojista editar ou para a IA melhorar. */
export function fallbackCaption(o: { theme: Theme; store: string; product?: string | null; link: string; pt: boolean }) {
  const T = (es: string, pt: string) => (o.pt ? pt : es);
  const p = o.product ?? T("nuestro favorito", "nosso queridinho");
  const body: Record<Theme, string> = {
    product: T(`Hoy el protagonista es ${p}. ¿Ya lo probaste?`, `Hoje o destaque é ${p}. Já provou?`),
    combo: T(`Combo pensado para vos: ${p} con lo que más piden. Pedí en un clic.`, `Combo pensado pra você: ${p} com o que mais pedem. Peça em um clique.`),
    behind: T(`Así preparamos cada pedido en ${o.store}. Hecho con cuidado, del pedido a tu casa.`, `É assim que preparamos cada pedido na ${o.store}. Feito com carinho, do pedido até a sua casa.`),
    review: T(`Lo que dicen nuestros clientes nos motiva todos los días. ¡Gracias!`, `O que nossos clientes dizem motiva a gente todo dia. Obrigado!`),
    weak_offer: T(`Solo hoy, en este horario: ${p} con precio especial.`, `Só hoje, neste horário: ${p} com preço especial.`),
    question: T(`¿Qué no puede faltar en tu pedido? Contanos en los comentarios.`, `O que não pode faltar no seu pedido? Conta pra gente nos comentários.`),
    date: T(`Fecha especial pide algo especial. Pedí el tuyo.`, `Data especial pede algo especial. Peça o seu.`),
  };
  return `${body[o.theme]}\n\n${T("Pedí por el link de la bio", "Peça pelo link da bio")}: ${o.link}`;
}

/** Instagram: legenda até 2.200 caracteres e até 30 hashtags. */
export const IG_CAPTION_MAX = 2200;
export function igCaption(text: string) {
  let n = 0;
  const cleaned = text.replace(/#[\p{L}\p{N}_]+/gu, (h) => (++n <= 30 ? h : "")).trim();
  return [...cleaned].length <= IG_CAPTION_MAX ? cleaned : `${[...cleaned].slice(0, IG_CAPTION_MAX - 1).join("").trimEnd()}…`;
}

// ---------------------------------------------------------------- anúncio orientado (sem API)
/** Código da origem do anúncio: ?origem=anuncio-<semana>-<dia> (vai para orders.campaign). */
export const campaignCode = (kind: "anuncio" | "post", week: number, dow: number) => `${kind}-s${week}-${["dom", "seg", "ter", "qua", "qui", "sex", "sab"][dow]}`;

/** Guarda só códigos nossos (anuncio-…, post-…) de ?origem=; o resto continua só na origem normalizada. */
export function campaignOf(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toLowerCase().trim();
  return /^(anuncio|post)-[a-z0-9-]{1,30}$/.test(s) ? s : null;
}

export type AdTask = { week: number; dow: number; days: number[]; budgetPerDay: number; totalBudget: number; productId: string | null; radiusKm: number; code: string; network: "meta" | "google" };

/**
 * Uma campanha por semana nos 2 dias de mais movimento (onde o anúncio rende mais pedidos), dentro do raio de entrega.
 * Verba do mês dividida pelas semanas; Google só para quem marcou "aparecer no Google" (1 em cada 4 semanas).
 */
export function adTasks(o: { weeks: number; adsMonthly: number; peaks: { dow: number; hour: number }[]; products: string[]; radiusKm: number; google: boolean }): AdTask[] {
  if (o.adsMonthly <= 0 || o.weeks <= 0) return [];
  const peakDays = [...new Set(o.peaks.map((p) => p.dow))];
  const days = (peakDays.length ? peakDays : [5, 6]).slice(0, 2).sort((a, b) => a - b);
  if (days.length === 1) days.push(days[0] === 6 ? 5 : 6);
  days.sort((a, b) => a - b);
  const perWeek = Math.floor((o.adsMonthly * 12) / 52);
  const out: AdTask[] = [];
  for (let w = 1; w <= o.weeks; w++) {
    const budgetPerDay = Math.floor(perWeek / days.length);
    out.push({
      week: w,
      dow: days[0],
      days,
      budgetPerDay,
      totalBudget: budgetPerDay * days.length,
      productId: o.products.length ? o.products[(w - 1) % o.products.length] : null,
      radiusKm: Math.max(1, Math.round(o.radiusKm)),
      code: campaignCode("anuncio", w, days[0]),
      network: o.google && w % 4 === 0 ? "google" : "meta",
    });
  }
  return out;
}

/** Resultado do anúncio com os pedidos reais do link. Alerta quando o custo por pedido passa do lucro por pedido. */
export function adResult(o: { spent: number; orders: number; revenue: number; ticket: number; profitPct: number | null }) {
  const cpo = o.orders ? Math.round(o.spent / o.orders) : null;
  const profitPerOrder = o.profitPct != null ? Math.round(o.ticket * o.profitPct) : null;
  const roas = o.spent ? o.revenue / o.spent : null;
  const verdict: "good" | "watch" | "stop" | "none" = !o.spent ? "none" : !o.orders ? "stop" : profitPerOrder != null ? (cpo! <= profitPerOrder * 0.6 ? "good" : cpo! <= profitPerOrder ? "watch" : "stop") : roas! >= 4 ? "good" : roas! >= 2 ? "watch" : "stop";
  return { cpo, roas, verdict };
}

// ---------------------------------------------------------------- insights (regras, sem IA)
export type Period = { orders: number; revenue: number; ticket: number; repeatRate: number; newCustomers: number; weakOrders: number };
export type Insight = { code: "ticket_up" | "ticket_down" | "revenue_up" | "revenue_down" | "repeat_up" | "new_up" | "weak_up" | "steady"; from: number; to: number };

/** Compara o período antes do plano com o atual (já normalizados para o mesmo número de dias). */
export function insights(before: Period, now: Period): Insight[] {
  const out: Insight[] = [];
  const pct = (a: number, b: number) => (a ? (b - a) / a : b ? 1 : 0);
  if (before.revenue && Math.abs(pct(before.revenue, now.revenue)) >= 0.05) out.push({ code: now.revenue > before.revenue ? "revenue_up" : "revenue_down", from: before.revenue, to: now.revenue });
  if (before.ticket && Math.abs(pct(before.ticket, now.ticket)) >= 0.03) out.push({ code: now.ticket > before.ticket ? "ticket_up" : "ticket_down", from: before.ticket, to: now.ticket });
  if (now.repeatRate - before.repeatRate >= 0.02) out.push({ code: "repeat_up", from: before.repeatRate, to: now.repeatRate });
  if (pct(before.newCustomers, now.newCustomers) >= 0.1) out.push({ code: "new_up", from: before.newCustomers, to: now.newCustomers });
  if (pct(before.weakOrders, now.weakOrders) >= 0.1) out.push({ code: "weak_up", from: before.weakOrders, to: now.weakOrders });
  return out.length ? out : [{ code: "steady", from: before.revenue, to: now.revenue }];
}

/** Normaliza um período de `days` dias para 30 dias (comparação justa entre janelas de tamanhos diferentes). */
export function per30(p: Period, days: number): Period {
  const f = days > 0 ? 30 / days : 1;
  return { orders: Math.round(p.orders * f), revenue: Math.round(p.revenue * f), ticket: p.ticket, repeatRate: p.repeatRate, newCustomers: Math.round(p.newCustomers * f), weakOrders: Math.round(p.weakOrders * f) };
}

// ---------------------------------------------------------------- agenda (Google Agenda / .ics)
export type CalEvent = { uid: string; start: Date; minutes: number; title: string; description: string; url?: string };

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
/** Dobra linhas em 75 octetos (RFC 5545). */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(name: string, events: CalEvent[], now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GoWeb//Assessoria//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT6H"];
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.minutes * 60_000);
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@goweboficial.com`, `DTSTAMP:${icsDate(now)}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description + (e.url ? `\n${e.url}` : ""))}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, "TRIGGER:-PT30M", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Link "Adicionar ao Google Agenda" (sem API). */
export function gcalLink(e: CalEvent) {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", e.title);
  u.searchParams.set("dates", `${icsDate(e.start)}/${icsDate(new Date(e.start.getTime() + e.minutes * 60_000))}`);
  u.searchParams.set("details", e.description + (e.url ? `\n${e.url}` : ""));
  return u.toString();
}

// ---------------------------------------------------------------- publicação automática (Instagram)
export type PostState = "draft" | "approved" | "publishing" | "published" | "failed" | "done_manual" | "skipped";

/** Pode publicar sozinho agora? Tudo conferido de novo no servidor na hora de publicar. */
export function canAutoPublish(o: { configOn: boolean; planActive: boolean; autonomy: boolean; status: PostState; scheduledAt: Date; now: number; hasImage: boolean; accountCanPublish: boolean; demo: boolean }): { ok: true } | { ok: false; why: string } {
  if (o.demo) return { ok: false, why: "demo" };
  if (!o.configOn) return { ok: false, why: "publish_off" };
  if (!o.planActive) return { ok: false, why: "plan_inactive" };
  if (!o.autonomy) return { ok: false, why: "autonomy_off" };
  if (o.status !== "approved") return { ok: false, why: "not_approved" };
  if (!o.hasImage) return { ok: false, why: "no_image" };
  if (!o.accountCanPublish) return { ok: false, why: "no_account" };
  if (o.scheduledAt.getTime() > o.now) return { ok: false, why: "not_yet" };
  if (o.now - o.scheduledAt.getTime() > 6 * 3600_000) return { ok: false, why: "too_late" }; // passou muito da hora: não publica atrasado
  return { ok: true };
}

/** Autonomia "todos": posts em rascunho viram aprovados sozinhos 24 h antes (se tiverem imagem e legenda). */
export const autoApproveDue = (scheduledAt: Date, now: number) => scheduledAt.getTime() - now <= 24 * 3600_000;

// ---------------------------------------------------------------- dia/hora no fuso da loja
/** Data local AAAA-MM-DD + hora → instante UTC, no fuso IANA da loja. */
export function zonedToUtc(date: string, hour: number, timeZone: string) {
  const guess = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

/** Dia da semana (0 = domingo) e hora de um instante no fuso da loja. */
export function localSlot(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", weekday: "short", hour: "2-digit" }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0) };
}

export const localDate = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
