// Textos da Assessoria GoWeb (es/pt) usados no servidor e no navegador. Sem dados, só rótulos.
import type { Insight } from "@/core/advisory";

type Pair = { es: string; pt: string };

export const GAP_TEXT: Record<string, Pair> = {
  few_items: { es: "La mayoría de los pedidos lleva un solo producto: hay espacio para combos y adicionales.", pt: "A maioria dos pedidos leva um produto só: tem espaço para combos e adicionais." },
  low_repeat: { es: "Pocos clientes vuelven a pedir dentro de 90 días.", pt: "Poucos clientes voltam a pedir em 90 dias." },
  low_optin: { es: "Pocos clientes aceptaron recibir promociones por WhatsApp.", pt: "Poucos clientes aceitaram receber promoções no WhatsApp." },
  one_source: { es: "Casi todas las ventas vienen de un solo canal.", pt: "Quase todas as vendas vêm de um canal só." },
  weak_slots: { es: "Hay horarios con muy pocos pedidos dentro de tu horario de atención.", pt: "Tem horários com pouquíssimos pedidos dentro do seu horário de atendimento." },
  no_google: { es: "Sin perfil en Google: los clientes cercanos no te encuentran en el mapa.", pt: "Sem perfil no Google: os clientes por perto não acham você no mapa." },
  few_posts: { es: "Instagram con pocas publicaciones por semana.", pt: "Instagram com poucas publicações por semana." },
  few_reviews: { es: "Pocas reseñas en Google (menos de 15).", pt: "Poucas avaliações no Google (menos de 15)." },
};

export const DOW: Record<"es" | "pt", string[]> = {
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  pt: ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
};

export function insightText(i: Insight, locale: "es" | "pt", money: (v: number) => string) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  switch (i.code) {
    case "revenue_up":
      return T(`Las ventas del mes subieron de ${money(i.from)} a ${money(i.to)}.`, `As vendas do mês subiram de ${money(i.from)} para ${money(i.to)}.`);
    case "revenue_down":
      return T(`Las ventas del mes bajaron de ${money(i.from)} a ${money(i.to)}. Revisemos el plan juntos.`, `As vendas do mês caíram de ${money(i.from)} para ${money(i.to)}. Vale revisar o plano.`);
    case "ticket_up":
      return T(`Tu ticket promedio subió de ${money(i.from)} a ${money(i.to)}.`, `Seu ticket médio subiu de ${money(i.from)} para ${money(i.to)}.`);
    case "ticket_down":
      return T(`El ticket promedio bajó de ${money(i.from)} a ${money(i.to)}.`, `O ticket médio caiu de ${money(i.from)} para ${money(i.to)}.`);
    case "repeat_up":
      return T(`Más clientes volvieron: de ${pct(i.from)} a ${pct(i.to)}.`, `Mais clientes voltaram: de ${pct(i.from)} para ${pct(i.to)}.`);
    case "new_up":
      return T(`Clientes nuevos por mes: de ${i.from} a ${i.to}.`, `Clientes novos por mês: de ${i.from} para ${i.to}.`);
    case "weak_up":
      return T(`Los horarios flojos ganaron pedidos: de ${i.from} a ${i.to} por mes.`, `Os horários fracos ganharam pedidos: de ${i.from} para ${i.to} por mês.`);
    default:
      return T("Todavía sin cambios grandes: los primeros resultados suelen aparecer entre la 3.ª y la 6.ª semana.", "Ainda sem mudanças grandes: os primeiros resultados costumam aparecer entre a 3ª e a 6ª semana.");
  }
}

export const PARTNER_TEXT: Record<"none" | "monthly" | "biweekly", Pair> = {
  none: { es: "Seguimiento automático", pt: "Acompanhamento automático" },
  monthly: { es: "Charla mensual de 30 min con un socio", pt: "Conversa mensal de 30 min com um sócio" },
  biweekly: { es: "Seguimiento quincenal con un socio", pt: "Acompanhamento quinzenal com um sócio" },
};

/** Paso a paso para crear el anuncio sin API (el lojista paga directo). */
export const AD_STEPS: Record<"meta" | "google", Pair[]> = {
  meta: [
    { es: "Abrí el Administrador de anuncios de Meta (business.facebook.com/adsmanager) con la cuenta de tu tienda.", pt: "Abra o Gerenciador de Anúncios da Meta (business.facebook.com/adsmanager) com a conta da sua loja." },
    { es: "Creá una campaña con objetivo Tráfico y destino Sitio web.", pt: "Crie uma campanha com objetivo Tráfego e destino Site." },
    { es: "En Público, elegí tu ciudad con el radio indicado abajo.", pt: "Em Público, escolha sua cidade com o raio indicado abaixo." },
    { es: "En Presupuesto y programación, poné el valor por día y solo los días indicados.", pt: "Em Orçamento e programação, coloque o valor por dia e só os dias indicados." },
    { es: "Usá la imagen y el texto de abajo, y pegá el link exacto (así medimos los pedidos).", pt: "Use a imagem e o texto abaixo e cole o link exato (é assim que medimos os pedidos)." },
  ],
  google: [
    { es: "Abrí ads.google.com con la cuenta de tu tienda.", pt: "Abra ads.google.com com a conta da sua loja." },
    { es: "Creá una campaña de Búsqueda con objetivo Tráfico del sitio web.", pt: "Crie uma campanha de Pesquisa com objetivo Tráfego para o site." },
    { es: "Ubicación: tu ciudad con el radio indicado abajo.", pt: "Local: sua cidade com o raio indicado abaixo." },
    { es: "Presupuesto diario: el valor indicado abajo.", pt: "Orçamento diário: o valor indicado abaixo." },
    { es: "URL final: el link exacto de abajo.", pt: "URL final: o link exato abaixo." },
  ],
};
