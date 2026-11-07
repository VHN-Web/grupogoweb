import { CORE_INFO, MODULE_INFO } from "./modules";
// Nome do plano no idioma do visitante (os nomes são cadastrados uma vez no admin).
const PT: Record<string, string> = {
  mensual: "Mensal",
  "anual completo": "Anual Completo",
  anual: "Anual",
  semestral: "Semestral",
  trimestral: "Trimestral",
};
const ES: Record<string, string> = {
  mensal: "Mensual",
  "anual completo": "Anual Completo",
};

export function planName(name: string, locale: "es" | "pt"): string {
  const k = name.trim().toLowerCase();
  return (locale === "pt" ? PT[k] : ES[k]) ?? name;
}

/** Tradução das linhas de recursos padrão dos planos (o que não estiver aqui aparece como cadastrado). */
const FEATURE_PT: Record<string, string> = {
  "Menú QR y pedidos ilimitados": "Cardápio QR e pedidos ilimitados",
  "Caja, stock y comprobantes": "Caixa, estoque e comprovantes",
  "Pagos en Gs., US$ y R$": "Pagamentos por Pix, cartão e dinheiro",
  "Dominio propio opcional (adicional)": "Domínio próprio opcional (adicional)",
  "100% de las funciones": "100% dos recursos",
  "Implementación prioritaria": "Implantação prioritária",
  "Soporte por WhatsApp": "Suporte por WhatsApp",
  "Todo del plan Mensual": "Tudo do plano Mensal",
  "Sugerencias inteligentes de venta": "Sugestões inteligentes de venda",
  "Carritos abandonados + cupones": "Carrinhos abandonados + cupons",
  "Ofertas relámpago": "Ofertas relâmpago",
  "Agenda con confirmación por WhatsApp": "Agenda com confirmação por WhatsApp",
  "Equipo con login y permisos": "Equipe com login e permissões",
  "Informe de cierre de caja por e-mail/WhatsApp": "Relatório de fechamento de caixa por e-mail/WhatsApp",
  "Cartera de clientes y origen de las ventas": "Carteira de clientes e origem das vendas",
  "Kit de divulgación + tienda optimizada para Google": "Kit de divulgação + loja otimizada para o Google",
  "Reseñas en Google y Vitrina de la ciudad (opcionales)": "Avaliações no Google e Vitrine da cidade (opcionais)",
  "Campañas de reactivación por WhatsApp": "Campanhas de reativação no WhatsApp",
  "Recomendá y ganá": "Indique e ganhe",
  "Tarjeta de fidelidad / cashback": "Cartão fidelidade / cashback",
  "Cupón de cumpleaños automático": "Cupom de aniversário automático",
};

/** Recursos de Crescimento adicionados aos planos (cadastrados em PT). */
export const GROWTH_PLAN_FEATURES = {
  base: ["Carteira de clientes e origem das vendas", "Kit de divulgação + loja otimizada para o Google", "Avaliações no Google e Vitrine da cidade (opcionais)"],
  pro: ["Campanhas de reativação no WhatsApp", "Indique e ganhe", "Cartão fidelidade / cashback", "Cupom de aniversário automático"],
};

/** Acrescenta as linhas que faltam (idempotente; compara nos dois idiomas). */
export function withGrowthFeatures(features: string | null, pro: boolean): string {
  const lines = (features ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const has = new Set(lines.map((l) => planFeature(l, "pt")));
  const add = (pro ? GROWTH_PLAN_FEATURES.pro : GROWTH_PLAN_FEATURES.base).filter((f) => !has.has(f));
  return [...lines, ...add].join("\n");
}
// Plano personalizado: núcleo e módulos
FEATURE_PT[CORE_INFO.es] = CORE_INFO.pt;
for (const m of Object.values(MODULE_INFO)) FEATURE_PT[m.es] = m.pt;
const FEATURE_ES: Record<string, string> = Object.fromEntries(Object.entries(FEATURE_PT).map(([es, pt]) => [pt, es]));

/** Funciona nos dois sentidos: o plano pode estar cadastrado em espanhol ou em português. */
export function planFeature(f: string, locale: "es" | "pt"): string {
  const k = f.trim();
  return locale === "pt" ? (FEATURE_PT[k] ?? f) : (FEATURE_ES[k] ?? f);
}

/** Converte nome e recursos cadastrados em espanhol para português (migração do admin). */
export function planToPt(p: { name: string; features: string | null }) {
  return {
    name: planName(p.name, "pt"),
    features: p.features == null ? null : p.features.split("\n").map((l) => planFeature(l, "pt")).join("\n"),
  };
}
