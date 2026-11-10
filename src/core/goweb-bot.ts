// Geovana da GoWeb — atendente IA no WhatsApp DA PRÓPRIA GoWeb (vendas, CRM, suporte). Regras PURAS.
// A IA conversa normalmente e, quando aprende algo, inclui marcações invisíveis no fim da resposta:
//   [[LEAD: negocio=Pizzaria do Zé; tipo=Pizzaria; cidade=Recife - PE; contato=Zé; dor=paga 27% no iFood]]
//   [[AGENDAR: 2026-11-12 15:00]]            → conversa/demonstração com um sócio
//   [[SUPORTE: alta | Assunto | descrição]]  → chamado (só para lojas clientes)
//   [[HUMANO]]                               → chama um sócio e pausa a IA nessa conversa
// O sistema remove as marcações antes de enviar e executa cada uma.

export type GwBotConfig = {
  enabled: boolean;
  instance: string; // instância na Evolution (gw-goweb-oficial)
  instanceKeySealed: string;
  hookToken: string; // segredo na URL do webhook
  extra: string; // informações extras para a IA (promoção de lançamento, observações)
  hours: string; // horário em que um sócio atende (para agendar)
  pauseMinutes: number; // sócio respondeu pelo celular → IA pausa nessa conversa
  autoFollowUp: boolean; // retorno automático para leads que pararam de responder
  followUpHours: number[]; // depois de quantas horas sem resposta (ex.: 24, 72)
  dailyDigest: boolean; // resumo diário no WhatsApp dos sócios
  partnerPhones: string[]; // WhatsApp dos sócios (E.164) para avisos
};

export const DEFAULT_GW_BOT: GwBotConfig = {
  enabled: false,
  instance: "",
  instanceKeySealed: "",
  hookToken: "",
  extra: "",
  hours: "segunda a sábado, 9h às 18h",
  pauseMinutes: 120,
  autoFollowUp: true,
  followUpHours: [24, 72],
  dailyDigest: true,
  partnerPhones: [],
};

export function parseGwBot(raw: string | null | undefined): GwBotConfig {
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(raw || "{}");
  } catch {}
  const s = (v: unknown, d: string, max: number) => (typeof v === "string" ? v.slice(0, max) : d);
  const pm = Number(o.pauseMinutes);
  const fu = Array.isArray(o.followUpHours) ? o.followUpHours.map(Number).filter((n) => Number.isFinite(n) && n >= 2 && n <= 720).slice(0, 4) : DEFAULT_GW_BOT.followUpHours;
  const phones = Array.isArray(o.partnerPhones) ? o.partnerPhones.map((p) => String(p).replace(/[^\d+]/g, "")).filter((p) => /^\+\d{10,15}$/.test(p)).slice(0, 6) : [];
  return {
    enabled: o.enabled === true,
    instance: s(o.instance, "", 80),
    instanceKeySealed: s(o.instanceKeySealed, "", 500),
    hookToken: s(o.hookToken, "", 80),
    extra: s(o.extra, "", 3000),
    hours: s(o.hours, DEFAULT_GW_BOT.hours, 200),
    pauseMinutes: Number.isFinite(pm) && pm >= 5 && pm <= 1440 ? Math.round(pm) : DEFAULT_GW_BOT.pauseMinutes,
    autoFollowUp: o.autoFollowUp !== false,
    followUpHours: fu.length ? fu.sort((a, b) => a - b) : DEFAULT_GW_BOT.followUpHours,
    dailyDigest: o.dailyDigest !== false,
    partnerPhones: phones,
  };
}

// ---------------------------------------------------------------- origem (panfleto)
export const FLYERS: Record<string, string> = {
  nao: "Panfleto “Não escaneie”",
  aposto: "Panfleto “Aposto que não escaneia”",
  surpresa: "Panfleto “Surpresa”",
  dinheiro: "Panfleto “Quanto fica com o app”",
  panfleto: "Panfleto informativo",
  site: "Site",
};
/** O link de WhatsApp dos panfletos manda "(cód. P-nao)" na 1ª mensagem. */
export function flyerFromText(text: string): string | null {
  const m = text.match(/\bP-(nao|aposto|surpresa|dinheiro|panfleto|site)\b/i);
  return m ? m[1].toLowerCase() : null;
}

// ---------------------------------------------------------------- prompt
export type GwPlan = { name: string; interval: string; priceMinor: number; setupMinor: number; features: string[]; intelligence: boolean };
export type GwContext = {
  now: Date;
  plans: GwPlan[];
  custom: { enabled: boolean; coreMinor: number; setupMinor: number; modules: { name: string; desc: string; priceMinor: number }[] } | null;
  links: { site: string; planos: string; contratar: string; personalizado: string; shopping: string; afiliados: string };
  extra: string;
  hours: string;
  launch: string | null; // "12/11/2026" se ainda não lançou
  store: { name: string; slug: string; plan: string | null } | null; // quem fala é lojista cliente
  affiliate: { name: string; code: string; link: string; tier: string } | null; // quem fala é afiliado
  lead: { name: string; status: string; demoAt: string | null } | null;
  flyer: string | null;
  contactName: string | null;
};

const brl = (minor: number) => `R$ ${(minor / 100).toFixed(2).replace(".", ",").replace(/,00$/, "")}`;
const fmtNow = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function buildGwPrompt(c: GwContext): string {
  const plans = c.plans
    .map((p) => `- ${p.name} (${p.interval === "YEARLY" ? "anual" : "mensal"}): ${brl(p.priceMinor)}${p.interval === "YEARLY" ? "/ano" : "/mês"}${p.setupMinor ? ` + implantação ${brl(p.setupMinor)}` : ""}${p.intelligence ? " · inclui GoInteligence (IA, marketing, fidelização)" : ""}${p.features.length ? `\n  Inclui: ${p.features.slice(0, 10).join("; ")}` : ""}`)
    .join("\n");
  const custom = c.custom?.enabled
    ? `\nPlano personalizado (monte o seu): base "Loja online + pedidos" ${brl(c.custom.coreMinor)}/mês${c.custom.setupMinor ? ` + implantação ${brl(c.custom.setupMinor)}` : ""}, e soma só os módulos que quiser:\n${c.custom.modules.map((m) => `- ${m.name}: +${brl(m.priceMinor)}/mês — ${m.desc}`).join("\n")}\nLink: ${c.links.personalizado}`
    : "";
  const who = c.store
    ? `QUEM ESTÁ FALANDO: lojista CLIENTE da GoWeb — loja "${c.store.name}" (painel: ${c.links.site}/painel/${c.store.slug}${c.store.plan ? `, plano ${c.store.plan}` : ""}). Ajude no SUPORTE. Se não resolver com uma explicação simples, abra chamado com [[SUPORTE: prioridade | assunto | descrição]] (prioridade: baixa, normal, alta ou urgente — urgente só se a loja está sem vender agora).`
    : c.affiliate
      ? `QUEM ESTÁ FALANDO: AFILIADO da GoWeb — ${c.affiliate.name} (nível ${c.affiliate.tier}). Link de indicação dele: ${c.affiliate.link}. Portal com artes, textos e comissões: ${c.links.afiliados}. Ajude a divulgar: explique como usar o link e o kit; dúvidas de pagamento de comissão → [[HUMANO]].`
      : `QUEM ESTÁ FALANDO: possível cliente (dono de comércio)${c.contactName ? `, nome no WhatsApp: ${c.contactName}` : ""}${c.flyer ? `. Chegou pelo ${FLYERS[c.flyer] ?? c.flyer}` : ""}${c.lead ? `. Já está no nosso CRM como "${c.lead.name}" (etapa ${c.lead.status}${c.lead.demoAt ? `, conversa marcada ${c.lead.demoAt}` : ""})` : ""}.`;
  return [
    `Você é a Geovana, atendente da GoWeb no WhatsApp. A GoWeb (${c.links.site}) é uma plataforma brasileira para comércios locais venderem online SEM comissão por pedido: site/cardápio com a marca da loja, pedidos no WhatsApp e no site, mesas com QR, delivery com motoboys e mapa ao vivo, caixa, impressora, cupons, fidelidade e uma IA (a própria Geovana) que atende o WhatsApp da loja. Slogan: "Clique, Conecte, Venda."`,
    `Agora é ${fmtNow(c.now)} (horário de Brasília).${c.launch ? ` Lançamento oficial em ${c.launch}: quem fechar antes já entra na fila de implantação.` : ""}`,
    who,
    `PLANOS (preços reais — nunca invente outro valor nem desconto):\n${plans || "- consulte " + c.links.planos}${custom}\nVer planos: ${c.links.planos} · Contratar: ${c.links.contratar} · Lojas de demonstração: ${c.links.shopping}`,
    c.extra ? `INFORMAÇÕES EXTRAS DA EQUIPE:\n${c.extra}` : "",
    `COMO ATENDER:
- Português do Brasil, simpática e direta, mensagens curtas (WhatsApp: até 4 linhas por mensagem), no máximo 1 emoji.
- Descubra com naturalidade: nome do negócio, tipo (pizzaria, hamburgueria, barbearia…), cidade e o que mais incomoda hoje (comissão do iFood, pedidos bagunçados no WhatsApp, falta de site…). Faça UMA pergunta por vez.
- Assim que souber pelo menos o nome do negócio OU o tipo + cidade, inclua no FIM da resposta: [[LEAD: negocio=…; tipo=…; cidade=Cidade - UF; contato=…; dor=…]] (só os campos que souber; repita quando aprender algo novo).
- Recomende o plano pelo tamanho/tipo do negócio e mande o link certo. Compare com apps de delivery: a GoWeb cobra mensalidade fixa, sem % por pedido.
- Para conversar com um sócio (demonstração ao vivo, dúvidas de contrato): ofereça horário dentro de ${c.hours}. Quando a pessoa CONFIRMAR dia e hora, inclua [[AGENDAR: AAAA-MM-DD HH:MM]] e confirme a data por extenso.
- Se pedirem uma pessoa, reclamarem, ou você não souber responder com segurança: diga que vai chamar um sócio e inclua [[HUMANO]].
- Nunca peça senha, cartão ou dados bancários. Nunca prometa prazo de implantação, funcionalidade ou desconto que não esteja aqui.
- As marcações [[…]] são invisíveis para o cliente: não comente sobre elas.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------- resposta
export type GwLead = { negocio?: string; tipo?: string; cidade?: string; contato?: string; dor?: string };
export type GwReply = { text: string; lead: GwLead | null; schedule: Date | null; support: { priority: "urgente" | "alta" | "normal" | "baixa"; subject: string; body: string } | null; human: boolean };

const PRIO: Record<string, "urgente" | "alta" | "normal" | "baixa"> = { baixa: "baixa", normal: "normal", media: "normal", média: "normal", alta: "alta", urgente: "urgente" };

/** Lê "2026-11-12 15:00" como horário de Brasília. Só aceita futuro próximo (até 60 dias). */
export function parseBrDateTime(raw: string, now: Date): Date | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}:00-03:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime() - 3600_000 || d.getTime() > now.getTime() + 60 * 86400_000) return null;
  return d;
}

export function parseGwReply(raw: string, now: Date): GwReply {
  let lead: GwLead | null = null;
  let schedule: Date | null = null;
  let support: GwReply["support"] = null;
  let human = false;
  const text = raw
    .replace(/\[\[\s*LEAD\s*:([^\]]*)\]\]/gi, (_, body: string) => {
      const l: GwLead = { ...(lead ?? {}) };
      for (const part of body.split(";")) {
        const [k, ...v] = part.split("=");
        const key = k?.trim().toLowerCase();
        const val = v.join("=").trim().slice(0, 200);
        if (val && (key === "negocio" || key === "negócio")) l.negocio = val;
        else if (val && key === "tipo") l.tipo = val;
        else if (val && key === "cidade") l.cidade = val;
        else if (val && key === "contato") l.contato = val;
        else if (val && key === "dor") l.dor = val;
      }
      lead = Object.keys(l).length ? l : lead;
      return "";
    })
    .replace(/\[\[\s*AGENDAR\s*:([^\]]*)\]\]/gi, (_, body: string) => {
      schedule = parseBrDateTime(body, now) ?? schedule;
      return "";
    })
    .replace(/\[\[\s*SUPORTE\s*:([^\]]*)\]\]/gi, (_, body: string) => {
      const [p, subject, ...rest] = body.split("|").map((x) => x.trim());
      if (subject) support = { priority: PRIO[(p ?? "").toLowerCase()] ?? "normal", subject: subject.slice(0, 120), body: (rest.join(" | ") || subject).slice(0, 2000) };
      return "";
    })
    .replace(/\[\[\s*HUMANO\s*\]\]/gi, () => {
      human = true;
      return "";
    })
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, lead, schedule, support, human };
}

/** Link "adicionar ao Google Agenda" para uma conversa marcada (30 min). */
export function googleCalendarLink(title: string, start: Date, details: string): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(start.getTime() + 30 * 60_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(start)}/${f(end)}`, details, ctz: "America/Sao_Paulo" });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ---------------------------------------------------------------- leads esquentando
/** Pontua sinais de compra na conversa (0–100). ≥ 60 = lead quente → avisa os sócios. */
export function heatScore(userMessages: string[]): number {
  const all = userMessages.join(" \n ").toLowerCase();
  let s = 0;
  const has = (re: RegExp) => re.test(all);
  const count = (re: RegExp) => (all.match(re) ?? []).length;
  s += Math.min(30, count(/pre[çc]o|quanto custa|valor|mensalidade|plano/g) * 12);
  if (has(/como (fa[çc]o|contrat|assin|come[çc])|quero (contratar|assinar|fechar|come[çc]ar)|vamos fechar|pode mandar o link/)) s += 35;
  if (has(/pix|boleto|cart[ãa]o|pagamento|implanta[çc][ãa]o/)) s += 15;
  if (has(/quando (fica pronto|come[çc]a)|prazo|amanh[ãa]|essa semana|hoje/)) s += 10;
  if (has(/ifood|comiss[ãa]o|taxa do app|99food|keeta/)) s += 10;
  if (userMessages.length >= 6) s += 10;
  if (has(/n[ãa]o tenho interesse|n[ãa]o quero|caro demais|sem dinheiro|depois eu vejo/)) s -= 30;
  return Math.max(0, Math.min(100, s));
}

// ---------------------------------------------------------------- retorno automático
/** Qual retorno enviar agora (índice em followUpHours) ou null. `sent` = quantos já foram. */
export function followUpDue(lastUserAt: Date | null, lastBotAt: Date | null, sent: number, hours: number[], now: Date): number | null {
  if (!lastBotAt || sent >= hours.length) return null;
  // só quando a última mensagem foi nossa (o cliente parou de responder)
  if (lastUserAt && lastUserAt > lastBotAt) return null;
  const elapsedH = (now.getTime() - lastBotAt.getTime()) / 3600_000;
  // horário comercial de Brasília (9h–20h) para não incomodar
  const h = Number(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  if (h < 9 || h >= 20) return null;
  const base = sent === 0 ? 0 : hours[sent - 1];
  return elapsedH >= hours[sent] - base ? sent : null;
}
