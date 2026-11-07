// Plano Personalizado: o cliente monta o plano escolhendo módulos. Lógica pura — testada em modules.test.ts.
// Regra: `tenants.modules` / `plans.modules` = null → plano fechado (tudo do plano liberado).
// Lista JSON → só o núcleo + os módulos da lista.
import type { Amounts } from "./billing";
import type { PanelArea } from "./types";

export const MODULES = ["mesas", "delivery", "caixa", "notas", "impressora", "divulgacao", "marketing", "fidelizacao", "agenda", "equipe"] as const;
export type ModuleKey = (typeof MODULES)[number];

type Info = { pt: string; es: string; descPt: string; descEs: string; pro: boolean; areas: PanelArea[] };

/** O que vem sempre (núcleo): loja online, pedidos, produtos e estoque, aparência e configurações. */

export const CORE_INFO = {
  pt: "Loja online + pedidos",
  es: "Tienda online + pedidos",
  descPt: "Cardápio/catálogo com sua marca, pedidos para retirada, produtos e estoque, comprovantes e pagamento online.",
  descEs: "Menú/catálogo con tu marca, pedidos para retirar, productos y stock, comprobantes y pago online.",
};

export const MODULE_INFO: Record<ModuleKey, Info> = {
  mesas: { pt: "Mesas e QR", es: "Mesas y QR", descPt: "QR por mesa e pedidos na mesa.", descEs: "QR por mesa y pedidos en la mesa.", pro: false, areas: ["tables"] },
  delivery: { pt: "Delivery e motoboys", es: "Delivery y repartidores", descPt: "Taxa por distância, cadastro de motoboys e envio da rota pelo WhatsApp.", descEs: "Tarifa por distancia, repartidores y envío de la ruta por WhatsApp.", pro: false, areas: ["couriers"] },
  caixa: { pt: "Caixa (PDV)", es: "Caja (PDV)", descPt: "Abertura e fechamento de caixa, vendas no balcão e troco.", descEs: "Apertura y cierre de caja, ventas en mostrador y vuelto.", pro: false, areas: ["cash"] },
  notas: { pt: "Notas fiscais", es: "Facturas", descPt: "Registro das notas emitidas e recebidas.", descEs: "Registro de facturas emitidas y recibidas.", pro: false, areas: ["fiscal"] },
  impressora: { pt: "Impressora térmica", es: "Impresora térmica", descPt: "Imprime o pedido automaticamente assim que ele chega.", descEs: "Imprime el pedido automáticamente apenas llega.", pro: false, areas: [] },
  divulgacao: { pt: "Clientes e divulgação", es: "Clientes y divulgación", descPt: "Carteira de clientes, origem das vendas, kit com QR e artes, Google e Vitrine da cidade.", descEs: "Cartera de clientes, origen de ventas, kit con QR y artes, Google y Vitrina de la ciudad.", pro: false, areas: ["customers"] },
  marketing: { pt: "Marketing inteligente", es: "Marketing inteligente", descPt: "Cupons, ofertas relâmpago, carrinhos abandonados e sugestões de venda.", descEs: "Cupones, ofertas relámpago, carritos abandonados y sugerencias de venta.", pro: true, areas: ["marketing"] },
  fidelizacao: { pt: "Fidelização", es: "Fidelización", descPt: "Campanhas no WhatsApp, indique e ganhe, cartão fidelidade/cashback e aniversário.", descEs: "Campañas por WhatsApp, recomendá y ganá, fidelidad/cashback y cumpleaños.", pro: true, areas: ["customers"] },
  agenda: { pt: "Agenda online", es: "Agenda online", descPt: "Clientes marcam horário pelo site, com confirmação pelo WhatsApp.", descEs: "Los clientes reservan turno en el sitio, con confirmación por WhatsApp.", pro: true, areas: ["agenda"] },
  equipe: { pt: "Equipe com login", es: "Equipo con login", descPt: "Funcionários com usuário próprio e acesso só ao que você liberar.", descEs: "Empleados con usuario propio y acceso solo a lo que habilites.", pro: true, areas: [] },
};

/** Áreas que dependem de módulo (fora delas, tudo é núcleo). */
const MODULE_AREAS = new Set<PanelArea>(Object.values(MODULE_INFO).flatMap((m) => m.areas));

export type ModulePrices = { enabled: boolean; core: Amounts; setup: Amounts; modules: Record<ModuleKey, Amounts> };

const A = (BRL: number, PYG: number, USD: number): Amounts => ({ BRL, PYG, USD });
/** Preços sugeridos (o admin ajusta em Admin → Planos). Tudo junto ≈ planos fechados; menos módulos = mais barato. */
export const DEFAULT_MODULE_PRICES: ModulePrices = {
  enabled: true,
  core: A(7900, 110000, 1500),
  setup: A(25000, 350000, 5000),
  modules: {
    mesas: A(1900, 25000, 400),
    delivery: A(1900, 25000, 400),
    caixa: A(1900, 25000, 400),
    notas: A(900, 12000, 200),
    impressora: A(900, 12000, 200),
    divulgacao: A(1500, 20000, 300),
    marketing: A(3900, 55000, 800),
    fidelizacao: A(3900, 55000, 800),
    agenda: A(2900, 40000, 600),
    equipe: A(1900, 25000, 400),
  },
};

const money = (v: unknown, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 1e10 ? n : def;
};
const amounts = (v: unknown, def: Amounts): Amounts => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { BRL: money(o.BRL, def.BRL), PYG: money(o.PYG, def.PYG), USD: money(o.USD, def.USD) };
};

export function parseModulePrices(raw: string | null | undefined): ModulePrices {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const D = DEFAULT_MODULE_PRICES;
  const mods = (j.modules && typeof j.modules === "object" ? j.modules : {}) as Record<string, unknown>;
  return {
    enabled: j.enabled !== false,
    core: amounts(j.core, D.core),
    setup: amounts(j.setup, D.setup),
    modules: Object.fromEntries(MODULES.map((m) => [m, amounts(mods[m], D.modules[m])])) as Record<ModuleKey, Amounts>,
  };
}

/** Lista guardada no plano/loja. null = plano fechado (tudo liberado). Ignora valores desconhecidos. */
export function parseModules(raw: string | null | undefined): ModuleKey[] | null {
  if (raw == null || raw === "") return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return MODULES.filter((m) => arr.includes(m));
  } catch {
    return null;
  }
}

export function sanitizeModules(list: unknown[]): ModuleKey[] {
  return MODULES.filter((m) => list.includes(m));
}

export function hasModule(t: { modules?: string | null }, m: ModuleKey): boolean {
  const mods = parseModules(t.modules);
  return mods === null || mods.includes(m);
}

/** Preço mensal do plano personalizado = núcleo + soma dos módulos escolhidos. */
export function customPrice(prices: ModulePrices, selected: ModuleKey[]): Amounts {
  return selected.reduce<Amounts>(
    (acc, m) => ({ BRL: acc.BRL + prices.modules[m].BRL, PYG: acc.PYG + prices.modules[m].PYG, USD: acc.USD + prices.modules[m].USD }),
    { ...prices.core },
  );
}

/** Algum módulo do GoInteligence? Então a loja roda no nível "pro" (restrito aos módulos escolhidos). */
export function needsPro(selected: ModuleKey[]): boolean {
  return selected.some((m) => MODULE_INFO[m].pro);
}

/** A área do painel está contratada? (plano fechado = todas) */
export function areaAllowed(mods: ModuleKey[] | null, area: PanelArea): boolean {
  if (mods === null || !MODULE_AREAS.has(area)) return true;
  return mods.some((m) => MODULE_INFO[m].areas.includes(area));
}

export function modulesLabel(mods: ModuleKey[] | null, locale: "es" | "pt"): string {
  if (mods === null) return locale === "pt" ? "Todos os recursos do plano" : "Todos los recursos del plan";
  const core = locale === "pt" ? CORE_INFO.pt : CORE_INFO.es;
  return [core, ...mods.map((m) => (locale === "pt" ? MODULE_INFO[m].pt : MODULE_INFO[m].es))].join(" · ");
}
