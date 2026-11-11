import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADVISORY,
  adResult,
  adTasks,
  advisoryAvailable,
  buildIcs,
  buildPlan,
  campaignOf,
  canAutoPublish,
  contentSlots,
  diagnose,
  estimate,
  gcalLink,
  goalsFor,
  igCaption,
  insights,
  localSlot,
  parseAdvisory,
  parseObjectives,
  per30,
  snapTotal,
  splitInvestment,
  zonedToUtc,
  type SelfReport,
  type StoreMetrics,
} from "./advisory";

const P = DEFAULT_ADVISORY.pricing.BRL!;

describe("divisão do investimento (tabela do documento aprovado)", () => {
  it.each([
    [9700, 9700, 0],
    [30000, 13760, 16240],
    [60000, 19760, 40240],
    [100000, 27760, 72240],
    [300000, 59760, 240240],
    [1000000, 143760, 856240],
  ])("total %i → assessoria %i, anúncios %i", (total, fee, ads) => {
    const s = splitInvestment(total, 3, P);
    expect(s.fee).toBe(fee);
    expect(s.ads).toBe(ads);
  });
  it("nunca abaixo do mínimo e sem teto", () => {
    expect(splitInvestment(100, 3, P).total).toBe(9700);
    expect(splitInvestment(10_000_000, 3, P).ads).toBeGreaterThan(8_000_000);
  });
  it("desconto só na assessoria: 5% em 6 meses, 10% em 12", () => {
    const s6 = splitInvestment(100000, 6, P);
    const s12 = splitInvestment(100000, 12, P);
    expect(s6.fee).toBe(27760 - Math.round(27760 * 0.05));
    expect(s12.discount).toBe(2776);
    expect(s12.ads).toBe(72240);
  });
  it("faixas de entrega pelo valor da assessoria", () => {
    expect(splitInvestment(9700, 3, P).tier.postsPerWeek).toBe(2);
    expect(splitInvestment(60000, 3, P).tier.adPlans).toBe(true);
    expect(splitInvestment(300000, 3, P).tier.partner).toBe("monthly");
    expect(splitInvestment(1000000, 3, P).tier.partner).toBe("biweekly");
  });
  it("verba pequena demais não vira anúncio", () => {
    expect(splitInvestment(20000, 3, P).adsTooSmall).toBe(true);
    expect(splitInvestment(60000, 3, P).adsTooSmall).toBe(false);
  });
  it("snap no passo", () => expect(snapTotal(12345, P)).toBe(12000));
});

describe("config", () => {
  it("desligada por padrão; Paraguai sem preço", () => {
    const c = parseAdvisory(null);
    expect(c.enabled).toBe(false);
    expect(c.igPublishEnabled).toBe(false);
    expect(c.pricing.PYG).toBeUndefined();
    expect(advisoryAvailable(c, { currency: "BRL", demo: false }).ok).toBe(false);
    expect(advisoryAvailable(c, { currency: "BRL", demo: true }).ok).toBe(true);
    expect(advisoryAvailable({ ...c, enabled: true }, { currency: "PYG", demo: false }).ok).toBe(false);
  });
  it("lê preços do Paraguai e corrige valores ruins", () => {
    const c = parseAdvisory(JSON.stringify({ enabled: true, pricing: { PYG: { minimum: 150000, cut: 3000000, sliderMax: 9000000, step: 10000, adsMinimum: 200000 } }, aiMonthlyPerStore: -5 }));
    expect(c.pricing.PYG?.minimum).toBe(150000);
    expect(c.pricing.BRL?.minimum).toBe(9700);
    expect(c.aiMonthlyPerStore).toBe(120);
    expect(advisoryAvailable(c, { currency: "PYG", demo: false }).ok).toBe(true);
  });
  it("objetivos: só conhecidos, sem repetir, no máximo 3", () => {
    expect(parseObjectives("ticket,ticket,x,new,return,google")).toEqual(["ticket", "new", "return"]);
  });
});

const slotsWith = (entries: [number, number, number][]) => {
  const a = new Array(7 * 24).fill(0);
  for (const [d, h, n] of entries) a[d * 24 + h] = n;
  return a;
};
const metrics = (o: Partial<StoreMetrics> = {}): StoreMetrics => ({
  days: 90,
  orders: 300,
  revenue: 300 * 4500,
  itemsPerOrder: 1.4,
  customers: 180,
  newCustomers: 90,
  repeatCustomers: 27,
  bySlot: slotsWith([
    [5, 20, 40],
    [6, 20, 45],
    [0, 19, 30],
    [2, 15, 2],
    [3, 15, 3],
    [4, 20, 20],
  ]),
  bySource: { instagram: 40, direto: 200 },
  topProducts: [{ id: "p1", name: "X-Burger", qty: 120 }],
  optInCustomers: 30,
  ...o,
});
const report: SelfReport = { hasInstagram: true, followers: 800, postsPerWeek: 1, hasGoogleProfile: false, googleRating: null, googleReviews: 4, profitPerOrderPct: 0.3 };

describe("diagnóstico", () => {
  it("calcula ticket, recompra, janelas e lacunas", () => {
    const d = diagnose(metrics(), report);
    expect(d.ticket).toBe(4500);
    expect(d.monthlyOrders).toBe(100);
    expect(d.repeatRate).toBeCloseTo(0.15);
    expect(d.peakSlots[0]).toEqual({ dow: 6, hour: 20 });
    expect(d.weakSlots.length).toBeGreaterThan(0);
    expect(d.gaps).toContain("no_google");
    expect(d.gaps).toContain("low_repeat");
    expect(d.enoughData).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
  });
  it("sem dados suficientes: sem faixa em dinheiro", () => {
    const d = diagnose(metrics({ orders: 10, revenue: 45000 }), report);
    expect(estimate(d, ["revenue"], splitInvestment(60000, 3, P))).toBeNull();
  });
  it("estimativa cresce com a verba de anúncio e low ≤ high", () => {
    const d = diagnose(metrics(), report);
    const a = estimate(d, ["revenue"], splitInvestment(30000, 3, P))!;
    const b = estimate(d, ["revenue"], splitInvestment(300000, 3, P))!;
    expect(a.monthlyLow).toBeLessThanOrEqual(a.monthlyHigh);
    expect(b.monthlyHigh).toBeGreaterThan(a.monthlyHigh);
    expect(b.adsOrdersHigh).toBeGreaterThan(b.adsOrdersLow);
  });
  it("metas seguem os objetivos", () => {
    const d = diagnose(metrics(), report);
    const g = goalsFor(d, ["ticket", "google"], splitInvestment(9700, 3, P), report);
    expect(g.ticket!.to).toBeGreaterThan(g.ticket!.from);
    expect(g.reviews).toEqual({ from: 4, to: 14 });
    expect(g.repeatRate).toBeNull();
  });
});

describe("plano, calendário e anúncios", () => {
  const d = diagnose(metrics(), report);
  it("plano mês a mês acumula ações e sempre tem posts", () => {
    const plan = buildPlan({ objectives: ["ticket", "new", "google"], months: 3, split: splitInvestment(60000, 3, P), diagnosis: d });
    expect(plan).toHaveLength(3);
    expect(plan[0].actions[0]).toBe("posts");
    expect(plan[0].actions).toContain("google_profile");
    expect(plan[2].actions).toContain("ads");
    expect(plan[2].actions.length).toBeGreaterThanOrEqual(plan[0].actions.length);
  });
  it("sem verba útil não há anúncio no plano", () => {
    const plan = buildPlan({ objectives: ["new"], months: 3, split: splitInvestment(9700, 3, P), diagnosis: d });
    expect(plan.flatMap((m) => m.actions)).not.toContain("ads");
  });
  it("calendário: N posts por semana, produto nos temas de produto", () => {
    const s = contentSlots({ startDate: "2026-11-16", weeks: 2, perWeek: 3, peaks: d.peakSlots, hasWeak: true, products: ["p1", "p2"] });
    expect(s).toHaveLength(6);
    expect(s[0].theme).toBe("product");
    expect(s[0].productId).toBe("p1");
    expect(s.find((x) => x.theme === "behind")?.productId).toBeNull();
    expect(new Set(s.map((x) => new Date(`${x.date}T12:00:00Z`).getUTCDay()))).toEqual(new Set([0, 2, 5]));
  });
  it("anúncios: verba semanal nos dias de pico, código rastreável", () => {
    const t = adTasks({ weeks: 4, adsMonthly: 40240, peaks: d.peakSlots, products: ["p1"], radiusKm: 6.4, google: true });
    expect(t).toHaveLength(4);
    expect(t[0].days).toEqual([5, 6]);
    expect(t[0].totalBudget).toBeLessThanOrEqual(Math.floor((40240 * 12) / 52));
    expect(t[0].code).toBe("anuncio-s1-sex");
    expect(t[3].network).toBe("google");
    expect(t[0].radiusKm).toBe(6);
    expect(adTasks({ weeks: 4, adsMonthly: 0, peaks: [], products: [], radiusKm: 5, google: false })).toEqual([]);
  });
  it("só guarda códigos nossos de origem", () => {
    expect(campaignOf("anuncio-s1-sex")).toBe("anuncio-s1-sex");
    expect(campaignOf("POST-s2-ter")).toBe("post-s2-ter");
    expect(campaignOf("instagram")).toBeNull();
    expect(campaignOf("anuncio-<script>")).toBeNull();
  });
  it("veredito do anúncio pelo lucro por pedido", () => {
    expect(adResult({ spent: 15000, orders: 23, revenue: 138000, ticket: 6000, profitPct: 0.3 }).verdict).toBe("good");
    expect(adResult({ spent: 15000, orders: 2, revenue: 12000, ticket: 6000, profitPct: 0.3 }).verdict).toBe("stop");
    expect(adResult({ spent: 15000, orders: 0, revenue: 0, ticket: 6000, profitPct: null }).verdict).toBe("stop");
    expect(adResult({ spent: 0, orders: 0, revenue: 0, ticket: 6000, profitPct: null }).verdict).toBe("none");
  });
  it("legenda do Instagram: até 30 hashtags e 2.200 caracteres", () => {
    const tags = Array.from({ length: 35 }, (_, i) => `#t${i}`).join(" ");
    expect((igCaption(tags).match(/#/g) ?? []).length).toBe(30);
    expect([...igCaption("a".repeat(3000))].length).toBe(2200);
  });
});

describe("insights", () => {
  it("aponta o que mudou, ou 'estável'", () => {
    const before = { orders: 100, revenue: 450000, ticket: 4500, repeatRate: 0.15, newCustomers: 30, weakOrders: 10 };
    const codes = insights(before, { ...before, revenue: 520000, ticket: 4800, repeatRate: 0.2 }).map((i) => i.code);
    expect(codes).toEqual(["revenue_up", "ticket_up", "repeat_up"]);
    expect(insights(before, before)[0].code).toBe("steady");
  });
  it("normaliza para 30 dias", () => expect(per30({ orders: 15, revenue: 1000, ticket: 1, repeatRate: 0, newCustomers: 3, weakOrders: 0 }, 15).orders).toBe(30));
});

describe("agenda", () => {
  const ev = { uid: "t1", start: new Date("2026-11-20T21:00:00Z"), minutes: 30, title: "Post: Combo, da loja", description: "Linha 1\nLinha 2; fim", url: "https://goweboficial.com/x" };
  it(".ics com CRLF, escapes e alarme", () => {
    const ics = buildIcs("Plano", [ev], new Date("2026-11-11T00:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261120T210000Z");
    expect(ics).toContain("SUMMARY:Post: Combo\\, da loja");
    expect(ics).toContain("Linha 1\\nLinha 2\\; fim");
    expect(ics).toContain("TRIGGER:-PT30M");
    for (const l of ics.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
  });
  it("link do Google Agenda", () => {
    const u = new URL(gcalLink(ev));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("dates")).toBe("20261120T210000Z/20261120T213000Z");
  });
  it("fuso da loja", () => {
    expect(zonedToUtc("2026-11-20", 18, "America/Fortaleza").toISOString()).toBe("2026-11-20T21:00:00.000Z");
    expect(localSlot(new Date("2026-11-20T21:00:00Z"), "America/Fortaleza")).toEqual({ dow: 5, hour: 18 });
  });
});

describe("publicação automática", () => {
  const base = { configOn: true, planActive: true, autonomy: true, status: "approved" as const, scheduledAt: new Date(1000), now: 2000, hasImage: true, accountCanPublish: true, demo: false };
  it("só com tudo certo", () => {
    expect(canAutoPublish(base).ok).toBe(true);
    expect(canAutoPublish({ ...base, configOn: false })).toEqual({ ok: false, why: "publish_off" });
    expect(canAutoPublish({ ...base, demo: true })).toEqual({ ok: false, why: "demo" });
    expect(canAutoPublish({ ...base, status: "draft" })).toEqual({ ok: false, why: "not_approved" });
    expect(canAutoPublish({ ...base, now: 500 })).toEqual({ ok: false, why: "not_yet" });
    expect(canAutoPublish({ ...base, now: 1000 + 7 * 3600_000 })).toEqual({ ok: false, why: "too_late" });
  });
});

describe("config gravada", () => {
  it("moeda gravada como null fica sem preço (não volta ao padrão)", () => {
    const c = parseAdvisory(JSON.stringify({ enabled: true, pricing: { BRL: null, PYG: null } }));
    expect(c.pricing.BRL).toBeUndefined();
    expect(advisoryAvailable(c, { currency: "BRL", demo: false })).toEqual({ ok: false, reason: "no_price" });
  });
});

describe("preço novo sem padrão (Paraguai)", () => {
  it("faixas proporcionais ao mínimo", () => {
    const c = parseAdvisory(JSON.stringify({ enabled: true, pricing: { PYG: { minimum: 150000 } } }));
    const p = c.pricing.PYG!;
    expect(p.tiers.map((t) => t.from)).toEqual([0, 225000, 600000, 1500000]);
    expect(splitInvestment(150000, 3, p).tier.postsPerWeek).toBe(2);
    expect(p.cut).toBe(3000000);
  });
});
