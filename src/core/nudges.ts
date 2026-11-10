// Lembretes automáticos pelo WhatsApp da GoWeb — regras PURAS (quando mandar e o quê).
// Cada lembrete tem uma CHAVE única: o sistema só envia se a chave ainda não foi usada (tabela nudge_log).

const DAY = 86400_000;
export const brHour = (now: Date) => Number(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
/** Só manda mensagem entre 9h e 19h (Brasília). */
export const businessHours = (now: Date) => brHour(now) >= 9 && brHour(now) < 19;
const dayKey = (now: Date) => now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const weekKey = (now: Date) => {
  const d = new Date(now.getTime() - 3 * 3600_000);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}w${Math.floor((d.getTime() - jan1) / (7 * DAY))}`;
};
const first = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "";
const hi = (name: string | null | undefined) => (first(name) ? `Oi, ${first(name)}!` : "Oi!");

// ---------------------------------------------------------------- 10. passo a passo
/** Lembrete do próximo passo: a cada 2 dias, até 45 dias após a entrega, no máx. 8 vezes. */
export function setupNudge(o: { tenantId: string; deliveredAt: Date | null; sent: number; now: Date }): string | null {
  if (!o.deliveredAt) return null;
  const age = (o.now.getTime() - o.deliveredAt.getTime()) / DAY;
  if (age < 0.5 || age > 45 || o.sent >= 8) return null;
  const slot = Math.floor(age / 2); // 1 lembrete a cada 2 dias
  return `setup:${o.tenantId}:${slot}`;
}
export function setupText(o: { contact: string | null; store: string; step: { title: string; how: string }; link: string; done: number; total: number }) {
  return `${hi(o.contact)} Aqui é a Geovana, da GoWeb 💚 A ${o.store} já está com ${o.done} de ${o.total} passos prontos. Próximo: *${o.step.title}*.\n${o.step.how}\n${o.link}\n\nSe quiser, eu te ajudo por aqui — é só responder.`;
}

// ---------------------------------------------------------------- 11. loja parada
export type IdleInput = { tenantId: string; liveSince: Date; lastOrderAt: Date | null; now: Date };
/** Loja no ar há 7+ dias e sem pedido há 7+ dias → 1 aviso por semana. */
export function idleNudge(o: IdleInput): { key: string; days: number } | null {
  const live = (o.now.getTime() - o.liveSince.getTime()) / DAY;
  if (live < 7) return null;
  const since = o.lastOrderAt ?? o.liveSince;
  const days = Math.floor((o.now.getTime() - since.getTime()) / DAY);
  if (days < 7) return null;
  return { key: `idle:${o.tenantId}:${weekKey(o.now)}`, days };
}
const IDLE_TIPS = [
  "coloque o link da loja na bio do Instagram e no status do WhatsApp",
  "imprima o QR do kit de divulgação e cole no balcão e nas embalagens",
  "crie um cupom de primeira compra (ex.: 10% OFF) e divulgue nos grupos do bairro",
  "ligue a Geovana no seu WhatsApp para responder na hora, até de madrugada",
  "peça para os clientes de sempre pedirem pelo site — você não paga comissão",
];
export function idleText(o: { contact: string | null; store: string; days: number; link: string; panel: string; week: number }) {
  const tips = [IDLE_TIPS[o.week % IDLE_TIPS.length], IDLE_TIPS[(o.week + 2) % IDLE_TIPS.length]];
  return `${hi(o.contact)} Notei que a ${o.store} está há ${o.days} dias sem pedidos pelo site. Duas ideias rápidas para esta semana:\n• ${tips[0]};\n• ${tips[1]}.\n\nSeu link: ${o.link}\nKit de divulgação: ${o.panel}/divulgacao\nQuer ajuda? Responda aqui que um sócio te chama. 🙌`;
}

// ---------------------------------------------------------------- 12. cobrança gentil
export type InvoiceStage = "d-3" | "d0" | "d+1" | "d+3";
/** Etapa do lembrete de uma fatura em aberto (3 dias antes, no dia, 1 e 3 dias depois). */
export function invoiceStage(dueAt: Date, now: Date): InvoiceStage | null {
  const days = Math.floor((new Date(dayKey(now)).getTime() - new Date(dayKey(dueAt)).getTime()) / DAY);
  if (days === -3) return "d-3";
  if (days === 0) return "d0";
  if (days === 1) return "d+1";
  if (days === 3) return "d+3";
  return null;
}
export function invoiceText(o: { contact: string | null; store: string; stage: InvoiceStage; amount: string; due: string; link: string; graceDays: number }) {
  const h = hi(o.contact);
  switch (o.stage) {
    case "d-3":
      return `${h} Passando para lembrar: a mensalidade da ${o.store} (${o.amount}) vence em ${o.due}. Dá para pagar por Pix ou cartão aqui:\n${o.link}\nQualquer dúvida, é só responder. 💚`;
    case "d0":
      return `${h} Hoje vence a mensalidade da ${o.store} (${o.amount}). Pix ou cartão:\n${o.link}\nSe já pagou, pode desconsiderar. 🙏`;
    case "d+1":
      return `${h} A mensalidade da ${o.store} (${o.amount}) venceu ontem e ainda não identificamos o pagamento. Consegue ver hoje?\n${o.link}\nSe estiver com alguma dificuldade, me conta que a gente acha um jeito.`;
    case "d+3":
      return `${h} A mensalidade da ${o.store} (${o.amount}) está em aberto há 3 dias. Para a loja não sair do ar${o.graceDays ? ` (carência de ${o.graceDays} dias)` : ""}, pague por aqui:\n${o.link}\nPrecisa conversar? Responda que um sócio te chama.`;
  }
}

export { dayKey, weekKey };
