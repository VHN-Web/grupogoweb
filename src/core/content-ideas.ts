// Ideias de conteúdo (Instagram/TikTok da GoWeb) a partir das perguntas reais dos clientes — regras PURAS.

export type ContentIdeas = {
  generatedAt: string;
  basedOn: number; // quantas mensagens/dores foram usadas
  posts: { title: string; caption: string; format: string }[];
  reels: { hook: string; scenes: string[]; cta: string }[];
  faq: string[]; // perguntas mais repetidas (para destaques/FAQ)
};

/** Remove telefones, e-mails e links antes de mandar para a IA (as perguntas são anônimas). */
export function anonymize(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[telefone]")
    .slice(0, 300);
}

export function contentPrompt(questions: string[], pains: string[], extra: string): string {
  return `Você é estrategista de conteúdo da GoWeb (plataforma brasileira para comércios locais venderem online sem comissão por pedido: site próprio, pedidos no WhatsApp, delivery com mapa ao vivo, Pix, cupons, fidelidade e IA no WhatsApp). Público: donos de pizzaria, hamburgueria, açaí, lanchonete, barbearia, pet shop.
Com base nas PERGUNTAS REAIS que chegaram no WhatsApp e nas DORES anotadas no CRM, crie conteúdo para o Instagram da GoWeb.
Responda SÓ com JSON: {"posts":[{"titulo":"…","legenda":"… (até 600 caracteres, com CTA)","formato":"carrossel|post|story"}],"reels":[{"gancho":"frase dos 3 primeiros segundos","cenas":["cena 1…","cena 2…"],"cta":"…"}],"faq":["pergunta mais comum 1", "…"]}
Quantidades: 6 posts, 3 reels (5 a 7 cenas, 30 a 45 s), 8 perguntas no faq. Português do Brasil, linguagem de dono de comércio, sem promessas de resultado garantido, sem citar concorrentes pelo nome em tom negativo.
${extra ? `Contexto da equipe: ${extra}\n` : ""}PERGUNTAS (${questions.length}):\n${questions.map((q) => `- ${q}`).join("\n") || "- (ainda poucas conversas: use dúvidas típicas de quem quer vender online)"}
DORES DO CRM (${pains.length}):\n${pains.map((p) => `- ${p}`).join("\n") || "- comissão alta dos apps de delivery; pedidos bagunçados no WhatsApp"}`;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseContentIdeas(raw: string, basedOn: number, now: Date): ContentIdeas | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim());
  } catch {
    return null;
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const posts = arr(j.posts)
    .map((p) => ({ title: str((p as Record<string, unknown>).titulo, 120), caption: str((p as Record<string, unknown>).legenda, 1200), format: str((p as Record<string, unknown>).formato, 20) || "post" }))
    .filter((p) => p.title && p.caption)
    .slice(0, 10);
  const reels = arr(j.reels)
    .map((r) => ({ hook: str((r as Record<string, unknown>).gancho, 200), scenes: arr((r as Record<string, unknown>).cenas).map((c) => str(c, 300)).filter(Boolean).slice(0, 10), cta: str((r as Record<string, unknown>).cta, 200) }))
    .filter((r) => r.hook && r.scenes.length)
    .slice(0, 5);
  const faq = arr(j.faq).map((q) => str(q, 200)).filter(Boolean).slice(0, 12);
  if (!posts.length && !reels.length) return null;
  return { generatedAt: now.toISOString(), basedOn, posts, reels, faq };
}

export function readIdeas(raw: string | null | undefined): ContentIdeas | null {
  try {
    return raw ? (JSON.parse(raw) as ContentIdeas) : null;
  } catch {
    return null;
  }
}
