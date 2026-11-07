// Chamados de suporte GoWeb: prioridade, prazos (SLA) e protocolo. Lógica pura — testada em support.test.ts.

export const PRIORITIES = ["urgente", "alta", "normal", "baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof STATUSES)[number];
export const CATEGORIES = ["problema", "duvida", "alteracao", "financeiro", "sugestao"] as const;
export type Category = (typeof CATEGORIES)[number];

type Txt = { es: string; pt: string };

/** Prazos em horas corridas: primeira resposta e solução. */
export const SLA: Record<Priority, { first: number; resolve: number; label: Txt; impact: Txt }> = {
  urgente: { first: 1, resolve: 8, label: { es: "Urgente", pt: "Urgente" }, impact: { es: "Mi tienda dejó de vender", pt: "Minha loja parou de vender" } },
  alta: { first: 4, resolve: 24, label: { es: "Alta", pt: "Alta" }, impact: { es: "Molesta, pero se puede usar", pt: "Atrapalha, mas dá para usar" } },
  normal: { first: 8, resolve: 48, label: { es: "Normal", pt: "Normal" }, impact: { es: "Duda o ajuste", pt: "Dúvida ou ajuste" } },
  baixa: { first: 24, resolve: 96, label: { es: "Baja", pt: "Baixa" }, impact: { es: "Sugerencia, sin apuro", pt: "Sugestão, sem pressa" } },
};

export const CATEGORY_LABELS: Record<Category, Txt> = {
  problema: { es: "Algo no funciona", pt: "Algo não funciona" },
  duvida: { es: "Duda sobre cómo usar", pt: "Dúvida de como usar" },
  alteracao: { es: "Pedido de cambio en mi sitio", pt: "Pedido de alteração no meu site" },
  financeiro: { es: "Facturas y pagos", pt: "Faturas e pagamentos" },
  sugestao: { es: "Sugerencia", pt: "Sugestão" },
};

export const STATUS_LABELS: Record<TicketStatus, Txt> = {
  OPEN: { es: "Abierto", pt: "Aberto" },
  IN_PROGRESS: { es: "En atención", pt: "Em atendimento" },
  WAITING_CUSTOMER: { es: "Esperando tu respuesta", pt: "Aguardando sua resposta" },
  RESOLVED: { es: "Resuelto", pt: "Resolvido" },
  CLOSED: { es: "Cerrado", pt: "Encerrado" },
};

const H = 3600e3;

export function slaDue(priority: Priority, openedAt: Date) {
  const s = SLA[priority];
  return { firstResponseDueAt: new Date(openedAt.getTime() + s.first * H), resolutionDueAt: new Date(openedAt.getTime() + s.resolve * H) };
}

export type SlaState = "ok" | "risco" | "atrasado" | "cumprido" | "violado";

/** Situação de um prazo: cumprido (no prazo), violado (feito depois), ok, risco (≤ 25% do prazo restante) ou atrasado. */
export function slaState(dueAt: Date, doneAt: Date | null, openedAt: Date, now = new Date()): SlaState {
  if (doneAt) return doneAt.getTime() <= dueAt.getTime() ? "cumprido" : "violado";
  if (now.getTime() > dueAt.getTime()) return "atrasado";
  const total = dueAt.getTime() - openedAt.getTime();
  return dueAt.getTime() - now.getTime() <= total * 0.25 ? "risco" : "ok";
}

/** Protocolo legível: GW-AAAAMMDD-XXXX (XXXX sem letras confusas). */
export function makeProtocol(d: Date, rnd: () => number = Math.random) {
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const tag = Array.from({ length: 4 }, () => A[Math.floor(rnd() * A.length)]).join("");
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `GW-${ymd}-${tag}`;
}

/** Texto curto do prazo restante/estourado, ex.: "faltam 3 h", "atrasado 2 h". */
export function remaining(dueAt: Date, now = new Date(), locale: "es" | "pt" = "pt") {
  const ms = dueAt.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const v = abs >= 864e5 ? `${Math.round(abs / 864e5)} d` : abs >= H ? `${Math.round(abs / H)} h` : `${Math.max(1, Math.round(abs / 6e4))} min`;
  if (ms >= 0) return locale === "pt" ? `faltam ${v}` : `faltan ${v}`;
  return locale === "pt" ? `atrasado ${v}` : `atrasado ${v}`;
}

export const isOpenStatus = (s: TicketStatus) => s !== "RESOLVED" && s !== "CLOSED";
