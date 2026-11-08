// CRM de prospecção da GoWeb (uso dos sócios). Regras puras — testadas em crm.test.ts.

export const CRM_STATUSES = ["NEW", "CONTACT", "DEMO", "PROPOSAL", "WON", "LOST"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];
export const CRM_STATUS_LABEL: Record<CrmStatus, string> = {
  NEW: "Novo lead",
  CONTACT: "Em contato",
  DEMO: "Demo agendada",
  PROPOSAL: "Proposta enviada",
  WON: "Fechado",
  LOST: "Perdido",
};
export const CRM_STATUS_COLOR: Record<CrmStatus, string> = { NEW: "#1F7FD8", CONTACT: "#22A8B8", DEMO: "#F2C14E", PROPOSAL: "#A970FF", WON: "#3CC46B", LOST: "#8a857b" };

export const SCORES = ["OURO", "PRATA", "BRONZE", "DESQ"] as const;
export type Score = (typeof SCORES)[number];
export const SCORE_LABEL: Record<Score, string> = { OURO: "Ouro", PRATA: "Prata", BRONZE: "Bronze", DESQ: "Desqualificado" };
export const SCORE_COLOR: Record<Score, string> = { OURO: "#F2C14E", PRATA: "#AEB8C4", BRONZE: "#CD8A4A", DESQ: "#E0614A" };

export const CHANNELS = ["whatsapp", "call", "instagram", "visit", "email"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", call: "Ligação", instagram: "Direct", visit: "Visita", email: "E-mail" };

// ---------------------------------------------------------------- detector de concorrentes / link da bio
export const COMPETITORS: { domain: string; name: string }[] = [
  { domain: "anota.ai", name: "Anota AI" },
  { domain: "menudino", name: "MenuDino" },
  { domain: "instadelivery", name: "InstaDelivery" },
  { domain: "saipos", name: "Saipos" },
  { domain: "goomer", name: "Goomer" },
  { domain: "trinks", name: "Trinks" },
  { domain: "booksy", name: "Booksy" },
  { domain: "neemo", name: "Neemo" },
  { domain: "pedir.delivery", name: "Pedir Delivery" },
  { domain: "cardapioweb", name: "Cardápio Web" },
  { domain: "consumer.com.br", name: "Consumer" },
  { domain: "deliverydireto", name: "Delivery Direto" },
  { domain: "aiqfome", name: "aiqfome" },
];
const MANUAL = ["wa.me", "api.whatsapp.com", "whatsapp.com", "linktr.ee", "linktree", "bio.link", "beacons.ai", "instagram.com", "facebook.com", "fb.com", "linkme", "taplink", "drive.google.com", ".pdf"];

export type LinkKind = "competitor" | "ifood" | "manual" | "own_site" | "none";
export function detectLink(raw: string | null | undefined): { kind: LinkKind; competitor?: string; label: string } {
  const u = (raw ?? "").trim().toLowerCase();
  if (!u) return { kind: "none", label: "Sem site nem link — atendimento manual" };
  const c = COMPETITORS.find((x) => u.includes(x.domain));
  if (c) return { kind: "competitor", competitor: c.name, label: `Já usa ${c.name} (concorrente)` };
  if (u.includes("ifood")) return { kind: "ifood", label: "Vende pelo iFood (paga comissão por pedido)" };
  if (MANUAL.some((m) => u.includes(m))) return { kind: "manual", label: "Atendimento manual (WhatsApp/Linktree/rede social)" };
  return { kind: "own_site", label: "Tem site próprio" };
}

// ---------------------------------------------------------------- score de qualificação
export type ScoreInput = { website?: string | null; reviews?: number | null; phone?: string | null; instagram?: string | null };
export function scoreLead(i: ScoreInput): { score: Score; points: number; reasons: string[]; linkKind: LinkKind; competitor?: string } {
  const link = detectLink(i.website);
  const reasons: string[] = [link.label];
  if (link.kind === "competitor") return { score: "DESQ", points: 0, reasons, linkKind: link.kind, competitor: link.competitor };
  let p = 0;
  if (link.kind === "none" || link.kind === "manual") p += 3;
  else if (link.kind === "ifood") p += 2;
  const r = i.reviews ?? null;
  if (r !== null) {
    if (r >= 30 && r <= 500) {
      p += 3;
      reasons.push(`${r} avaliações (faixa ideal 30–500)`);
    } else if (r > 500) {
      p += 2;
      reasons.push(`${r} avaliações (negócio grande)`);
    } else reasons.push(`Só ${r} avaliações (pouco movimento)`);
  }
  if (i.phone) p += 1;
  else reasons.push("Sem telefone");
  if (i.instagram) p += 1;
  const score: Score = p >= 6 ? "OURO" : p >= 4 ? "PRATA" : "BRONZE";
  return { score, points: p, reasons, linkKind: link.kind };
}

// ---------------------------------------------------------------- dados
/** Telefone BR → E.164 (+55DDDNÚMERO) ou null. */
export function normalizeBrPhone(raw: string | null | undefined) {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  return `+55${d}`;
}
export const cleanInstagram = (s: string | null | undefined) =>
  (s ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase() || null;

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Chave para não duplicar: telefone; senão Instagram; senão nome+cidade. */
export function dedupeKey(l: { phone?: string | null; instagram?: string | null; name: string; city?: string | null; neighborhood?: string | null }) {
  if (l.phone) return `tel:${l.phone}`;
  if (l.instagram) return `ig:${l.instagram}`;
  return `nm:${slugify(l.name)}:${slugify(l.city || l.neighborhood || "")}`;
}

export const leadCode = (n: number) => `LEAD-${String(n).padStart(3, "0")}`;

// status/score vindos da planilha antiga
export function statusFromText(s: string | null | undefined): CrmStatus {
  const t = (s ?? "").toLowerCase();
  if (t.includes("contato")) return "CONTACT";
  if (t.includes("demo")) return "DEMO";
  if (t.includes("proposta")) return "PROPOSAL";
  if (t.includes("fechad") || t.includes("ganh")) return "WON";
  if (t.includes("perdid")) return "LOST";
  return "NEW";
}
export function scoreFromText(s: string | null | undefined): Score | null {
  const t = (s ?? "").toLowerCase();
  if (t.startsWith("ouro")) return "OURO";
  if (t.startsWith("prata")) return "PRATA";
  if (t.startsWith("bronze")) return "BRONZE";
  if (t.startsWith("desq")) return "DESQ";
  return null;
}

// ---------------------------------------------------------------- CSV
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === "," || ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** CSV → objetos usando o cabeçalho (aceita nomes em inglês ou português). */
export function csvToRecords(text: string) {
  const [head, ...rest] = parseCsv(text.replace(/^﻿/, ""));
  if (!head) return [];
  const alias: Record<string, string> = {
    nome: "name", estabelecimento: "name", categoria: "category", segmento: "category", bairro: "neighborhood", cidade: "city", endereco: "address", endereço: "address",
    telefone: "phone", whatsapp: "phone", instagram: "instagram", email: "email", "e-mail": "email", dor: "pain", pitch: "pitch", score: "score", status: "status",
    responsavel: "owner", responsável: "owner", site: "website", website: "website", avaliacoes: "reviews", avaliações: "reviews", notas: "notes", observacoes: "notes", followupdate: "followUpDate",
  };
  const keys = head.map((h) => {
    const k = h.trim().replace(/^"|"$/g, "");
    const low = k.toLowerCase();
    return alias[low] ?? k;
  });
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])) as Record<string, string>);
}

export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

// ---------------------------------------------------------------- config
export type CrmConfig = {
  cities: string[];
  categories: string[];
  perRun: number; // leads por busca
  goals: { contacts: number; demos: number };
  model: string;
  sheetId: string | null;
  geminiKeySealed: string | null;
  vapidPublic: string | null;
  vapidPrivateSealed: string | null;
  huntEnabled: boolean;
  cursor: number; // próxima combinação cidade×categoria
};
export const DEFAULT_CRM: CrmConfig = {
  cities: ["Recife - PE", "Olinda - PE", "Abreu e Lima - PE", "João Pessoa - PB"],
  categories: ["Hamburgueria", "Pizzaria", "Açaiteria", "Lanchonete", "Marmitaria", "Barbearia", "Pet shop", "Confeitaria"],
  perRun: 8,
  goals: { contacts: 30, demos: 2 },
  model: "gemini-2.5-flash",
  sheetId: "1KYqdv5IsGc61K5s86K-Y1I21jtJvvwwIzzQzLgMy2tg",
  geminiKeySealed: null,
  vapidPublic: null,
  vapidPrivateSealed: null,
  huntEnabled: true,
  cursor: 0,
};
export function parseCrmConfig(raw: string | null | undefined): CrmConfig {
  let j: Partial<CrmConfig> = {};
  try {
    j = JSON.parse(raw || "{}") ?? {};
  } catch {}
  const list = (v: unknown, d: string[]) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 50) : d);
  const n = (v: unknown, d: number, min: number, max: number) => {
    const x = Math.round(Number(v));
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d;
  };
  return {
    cities: list(j.cities, DEFAULT_CRM.cities),
    categories: list(j.categories, DEFAULT_CRM.categories),
    perRun: n(j.perRun, DEFAULT_CRM.perRun, 1, 20),
    goals: { contacts: n(j.goals?.contacts, DEFAULT_CRM.goals.contacts, 1, 500), demos: n(j.goals?.demos, DEFAULT_CRM.goals.demos, 0, 50) },
    model: typeof j.model === "string" && /^[a-z0-9.\-]+$/i.test(j.model) ? j.model : DEFAULT_CRM.model,
    sheetId: j.sheetId === undefined ? DEFAULT_CRM.sheetId : j.sheetId && /^[A-Za-z0-9_-]{20,}$/.test(j.sheetId) ? j.sheetId : null,
    geminiKeySealed: j.geminiKeySealed ?? null,
    vapidPublic: j.vapidPublic ?? null,
    vapidPrivateSealed: j.vapidPrivateSealed ?? null,
    huntEnabled: j.huntEnabled ?? true,
    cursor: n(j.cursor, 0, 0, 1_000_000),
  };
}

/** Próximas combinações cidade × categoria para a busca (gira a cada execução). */
export function nextHuntTargets(cfg: Pick<CrmConfig, "cities" | "categories" | "cursor">, count = 2) {
  const combos = cfg.cities.flatMap((c) => cfg.categories.map((k) => ({ city: c, category: k })));
  if (!combos.length) return { targets: [], cursor: 0 };
  const targets = Array.from({ length: Math.min(count, combos.length) }, (_, i) => combos[(cfg.cursor + i) % combos.length]);
  return { targets, cursor: (cfg.cursor + targets.length) % combos.length };
}

// ---------------------------------------------------------------- datas (horário de Brasília)
const BR_OFFSET = -3 * 3600_000;
/** Início do dia em Brasília (como Date UTC). */
export function brDayStart(d = new Date()) {
  const local = new Date(d.getTime() + BR_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BR_OFFSET);
}
export function brWeekStart(d = new Date()) {
  const s = brDayStart(d);
  const dow = new Date(s.getTime() + BR_OFFSET).getUTCDay(); // 0 = domingo
  return new Date(s.getTime() - ((dow + 6) % 7) * 86400_000); // segunda-feira
}
export function brMonthStart(d = new Date()) {
  const local = new Date(d.getTime() + BR_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - BR_OFFSET);
}
/** "2026-11-08" + "14:30" (Brasília) → Date */
export function brDateTime(day: string, time = "09:00") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  return new Date(`${day}T${t}:00-03:00`);
}
export const brDayInput = (d: Date) => new Date(d.getTime() + BR_OFFSET).toISOString().slice(0, 10);
export const brTimeInput = (d: Date) => new Date(d.getTime() + BR_OFFSET).toISOString().slice(11, 16);

export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

/** Tempo trabalhado na jornada (desconta pausas). */
export function journeySeconds(j: { startedAt: Date; endedAt: Date | null; pauseStartedAt: Date | null; pausedSeconds: number }, now = new Date()) {
  const end = j.endedAt ?? now;
  const pausing = j.pauseStartedAt && !j.endedAt ? Math.max(0, (now.getTime() - j.pauseStartedAt.getTime()) / 1000) : 0;
  return Math.max(0, Math.floor((end.getTime() - j.startedAt.getTime()) / 1000 - j.pausedSeconds - pausing));
}

// ---------------------------------------------------------------- playbook (scripts)
export type Niche = "food" | "beauty" | "health" | "pet" | "retail" | "services";
export function nicheOf(category: string | null | undefined): Niche {
  const c = (category ?? "").toLowerCase();
  if (/barb|sal[aã]o|est[eé]tica|unha|beleza|cabel|spa/.test(c)) return "beauty";
  if (/cl[ií]nica|odonto|dent|m[eé]dic|fisio|psic|nutri|sa[uú]de/.test(c)) return "health";
  if (/pet|veterin/.test(c)) return "pet";
  if (/loja|moda|roupa|cal[çc]ado|perfum|cosm[eé]t|inform[aá]tica|celular|presente|[oó]tica/.test(c)) return "retail";
  if (/burg|pizz|lanch|a[çc]a[ií]|marmit|restaur|pastel|tapioc|confeit|doce|padaria|caf[eé]|bar\b|boteco|bebida|adega|hot ?dog|sorvet|espet|comida|hortifruti|cozinha/.test(c)) return "food";
  return "services";
}
const NICHE_HOOK: Record<Niche, { gain: string; feature: string }> = {
  food: { gain: "receber os pedidos organizados e sem comissão por pedido", feature: "cardápio digital com QR, pedidos no WhatsApp, delivery com taxa por distância e impressão na cozinha" },
  beauty: { gain: "parar de perder cliente esperando resposta para marcar horário", feature: "agenda online em que o cliente escolhe o horário, com confirmação no WhatsApp" },
  health: { gain: "organizar os agendamentos e reduzir faltas", feature: "agenda online com confirmação automática no WhatsApp e página com a sua marca" },
  pet: { gain: "agendar banho e tosa sem troca de mensagens e vender ração pelo link", feature: "agenda de banho e tosa e catálogo de produtos com pedido pelo WhatsApp" },
  retail: { gain: "vender pelo link na bio sem montar loja virtual cara", feature: "catálogo com fotos, carrinho e pedido direto no WhatsApp" },
  services: { gain: "profissionalizar o atendimento e receber pedidos organizados", feature: "página com a sua marca, catálogo de serviços e agenda online" },
};

export const SCRIPT_CHANNELS = ["whatsapp", "instagram", "email", "followup"] as const;
export type ScriptChannel = (typeof SCRIPT_CHANNELS)[number];
export const SCRIPT_CHANNEL_LABEL: Record<ScriptChannel, string> = { whatsapp: "WhatsApp", instagram: "Direct", email: "E-mail", followup: "Follow-up" };

export function buildScript(ch: ScriptChannel, l: { name: string; neighborhood?: string | null; category?: string | null; pain?: string | null; pitch?: string | null }, seller: string) {
  const h = NICHE_HOOK[nicheOf(l.category)];
  const where = l.neighborhood ? ` aí no ${l.neighborhood}` : "";
  const pain = l.pain ? `\n\nVi que ${l.pain.charAt(0).toLowerCase()}${l.pain.slice(1).replace(/\.$/, "")}.` : "";
  const pitch = l.pitch ? ` ${l.pitch.replace(/\.$/, "")}.` : "";
  const first = seller.split(" ")[0];
  if (ch === "whatsapp")
    return `Oi, tudo bem? Aqui é ${first}, da GoWeb. Conheço o trabalho da ${l.name}${where}.${pain}\n\nA GoWeb ajuda a ${h.gain}: ${h.feature}.${pitch}\n\nPosso te mostrar em 15 minutos como ficaria com a marca de vocês? Na contratação paga só a implantação; a primeira mensalidade vence 30 dias depois que tudo estiver funcionando.`;
  if (ch === "instagram")
    return `Oi, pessoal da ${l.name}! 👋 Sou ${first}, da GoWeb. Adorei o perfil de vocês.\n\nAjudamos negócios${where} a ${h.gain}, com ${h.feature}.\n\nPosso mandar um exemplo de como ficaria o de vocês?`;
  if (ch === "email")
    return `Assunto: ${l.name} recebendo pedidos sem comissão\n\nOlá, equipe da ${l.name}!${pain}\n\nSou ${first}, da GoWeb. Montamos para negócios como o de vocês ${h.feature} — tudo com a marca da ${l.name}.${pitch}\n\nNa contratação vocês pagam só a implantação, e a primeira mensalidade vence 30 dias depois da entrega.\n\nPodemos marcar uma demonstração de 15 minutos esta semana?\n\n${first} · GoWeb · goweboficial.com`;
  return `Oi! Passando para retomar nossa conversa sobre a GoWeb para a ${l.name}. Consigo te mostrar funcionando em 15 minutos — qual o melhor horário para você hoje ou amanhã?`;
}

/** Notas de 0 a 1 para as metas do dia. */
export function goalPct(value: number, goal: number) {
  return goal > 0 ? Math.min(1, value / goal) : 1;
}
