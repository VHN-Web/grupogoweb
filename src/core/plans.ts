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
export function planFeature(f: string, locale: "es" | "pt"): string {
  return locale === "pt" ? (FEATURE_PT[f.trim()] ?? f) : f;
}
