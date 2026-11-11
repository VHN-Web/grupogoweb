// Notificações personalizadas do CRM: cada sócio escolhe o que quer receber e o horário de silêncio.
// Vale para o app Android (canais com som próprio), o PWA e a central de avisos (/crm/avisos).

export type NotifyCategory = "leads" | "retornos" | "demos" | "vendas" | "suporte" | "whatsapp" | "afiliados" | "acessos" | "homologacao" | "agenda" | "lembretes";

export const NOTIFY_CATEGORIES: { id: NotifyCategory; label: string; hint: string }[] = [
  { id: "leads", label: "Leads novos", hint: "Busca automática, lista de espera e leads passados para você" },
  { id: "retornos", label: "Retornos", hint: "Retorno marcado chegou na hora" },
  { id: "demos", label: "Demonstrações", hint: "Demo agendada por afiliado ou pela Geovana" },
  { id: "vendas", label: "Vendas", hint: "Contrato novo e implantação paga" },
  { id: "suporte", label: "Suporte", hint: "Chamado novo de lojista" },
  { id: "whatsapp", label: "WhatsApp da GoWeb", hint: "Geovana pediu humano ou lead esquentando" },
  { id: "afiliados", label: "Afiliados", hint: "Cadastro e indicações de afiliados" },
  { id: "acessos", label: "Acessos", hint: "Resumo de visitas do site e da página de afiliados" },
  { id: "homologacao", label: "Homologação", hint: "Mudança nova para aprovar, testes concluídos e decisões" },
  { id: "agenda", label: "Agenda", hint: "Compromisso chegando (no tempo que você escolheu)" },
  { id: "lembretes", label: "Lembretes", hint: "Lembretes que você marcou" },
];

export type NotifyPrefs = {
  /** categorias desligadas */
  off: NotifyCategory[];
  /** horário de silêncio em Brasília ("22:00"–"07:00"); null = sem silêncio */
  quietFrom: string | null;
  quietTo: string | null;
  /** no silêncio, avisos de vendas e suporte ainda tocam */
  urgentInQuiet: boolean;
};

export const DEFAULT_NOTIFY: NotifyPrefs = { off: [], quietFrom: null, quietTo: null, urgentInQuiet: true };

const IDS = NOTIFY_CATEGORIES.map((c) => c.id);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCategory(v: unknown): v is NotifyCategory {
  return typeof v === "string" && (IDS as string[]).includes(v);
}

export function parseNotifyPrefs(raw: string | null | undefined): NotifyPrefs {
  let j: Partial<NotifyPrefs> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const off = Array.isArray(j.off) ? [...new Set(j.off.filter(isCategory))] : [];
  const qf = typeof j.quietFrom === "string" && HHMM.test(j.quietFrom) ? j.quietFrom : null;
  const qt = typeof j.quietTo === "string" && HHMM.test(j.quietTo) ? j.quietTo : null;
  return { off, quietFrom: qf && qt ? qf : null, quietTo: qf && qt ? qt : null, urgentInQuiet: j.urgentInQuiet !== false };
}

/** Minutos do dia em Brasília. */
export function brMinutes(d = new Date()) {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export function inQuietHours(p: NotifyPrefs, now = new Date()) {
  if (!p.quietFrom || !p.quietTo) return false;
  const m = brMinutes(now);
  const a = mins(p.quietFrom);
  const b = mins(p.quietTo);
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b; // atravessa a meia-noite (22:00–07:00)
}

/**
 * Entrega o aviso no celular agora? A central de avisos guarda tudo de qualquer jeito;
 * isto decide só o push (som/vibração).
 */
export function shouldPush(p: NotifyPrefs, category: NotifyCategory | null | undefined, now = new Date()) {
  if (category && p.off.includes(category)) return false;
  if (inQuietHours(p, now)) return !!category && p.urgentInQuiet && (category === "vendas" || category === "suporte" || category === "agenda" || category === "lembretes");
  return true;
}
