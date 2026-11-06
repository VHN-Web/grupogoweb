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
};
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
