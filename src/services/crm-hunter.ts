import "server-only";
import { geminiGenConfig, geminiModel } from "@/adapters/ai/gemini";
// Busca automática de leads com o Gemini (chave do próprio Lázaro, Google AI Studio).
// Usa a ferramenta "Google Search" do Gemini para achar negócios reais por cidade + categoria,
// e aplica o score de qualificação (core/crm.ts) antes de salvar.
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextHuntTargets } from "@/core/crm";
import { openSecret } from "@/lib/secrets";
import { CrmError, crmConfig, saveCrmConfig, upsertLead } from "./crm";
import { sendPush } from "./push";

type Found = {
  name: string;
  category?: string;
  neighborhood?: string;
  address?: string;
  phone?: string;
  instagram?: string;
  website?: string;
  email?: string;
  rating?: number;
  reviews?: number;
  pain?: string;
  pitch?: string;
};

async function geminiKey() {
  const cfg = await crmConfig();
  const key = cfg.geminiKeySealed ? openSecret(cfg.geminiKeySealed) : process.env.GEMINI_API_KEY;
  if (!key) throw new CrmError("Cadastre a chave do Gemini em Configurações do CRM.");
  return { key, model: geminiModel(cfg.model) };
}

export async function gemini(prompt: string, opts: { search?: boolean; maxTokens?: number } = {}) {
  const { key, model } = await geminiKey();
  const res = await fetch(`${process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: geminiGenConfig(model, 0.4, opts.maxTokens ?? 8192),
    }),
    signal: AbortSignal.timeout(110_000),
  });
  const j = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string; status?: string } } | null;
  if (!res.ok) {
    const msg = j?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new CrmError("A chave do Gemini é inválida. Gere outra no Google AI Studio.");
    if (res.status === 429) throw new CrmError("Limite gratuito do Gemini atingido por agora. Tente mais tarde.");
    throw new CrmError(`Gemini: ${msg}`);
  }
  return (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

/** Testa a chave salva (resposta curta). */
export async function testGemini() {
  const t = await gemini("Responda apenas: OK");
  return t.slice(0, 40);
}

function extractJsonArray(text: string): Found[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.name === "string") : [];
  } catch {
    return [];
  }
}

function prompt(city: string, categories: string[], n: number, skip: string[]) {
  const cats = categories.map((c) => `"${c}"`).join(", ");
  return `Você é um pesquisador de prospecção da GoWeb (sistema de cardápio digital, pedidos, agenda e caixa para pequenos negócios).
Pesquise no Google e no Google Maps negócios REAIS e em funcionamento ${categories.length > 1 ? `destas categorias: ${cats}` : `da categoria ${cats}`} em ${city}, Brasil.${categories.length > 1 ? " Distribua os resultados entre as categorias e use exatamente um desses nomes no campo category." : ""}
Prefira negócios com 30 a 500 avaliações no Google e que NÃO tenham site próprio (atendem só por WhatsApp, Instagram, Linktree ou iFood).
Não inclua estes, que já estão na nossa base: ${skip.slice(0, 60).join("; ") || "nenhum"}.

Devolva SOMENTE um array JSON (sem texto antes ou depois) com até ${n} itens, cada um no formato:
{"name":"","category":"","neighborhood":"bairro","address":"endereço completo","phone":"telefone/WhatsApp com DDD, só números","instagram":"usuário sem @","website":"link principal que o negócio divulga (site, linktree, wa.me, ifood) ou vazio","email":"","rating":4.7,"reviews":123,"pain":"o gargalo provável no atendimento, em 1 frase","pitch":"gancho de abordagem consultivo em 1 frase"}
Use só dados que você encontrou; deixe vazio o que não souber. Não invente telefones.`;
}

/** Uma rodada de busca (cron 3x por dia ou botão "Buscar agora"). Cada busca = 1 cidade + 1 grupo de categorias. */
export async function runHunt(trigger: "cron" | "manual", only?: { city: string; categories: string[] }) {
  const cfg = await crmConfig();
  if (trigger === "cron" && !cfg.huntEnabled) return { skipped: true as const };
  const { targets, cursor } = only ? { targets: [only], cursor: cfg.cursor } : nextHuntTargets(cfg, cfg.callsPerRun);
  if (!only) await saveCrmConfig({ cursor });
  const started = Date.now();
  let found = 0;
  let added = 0;
  const addedNames: string[] = [];
  const errors: string[] = [];
  for (const t of targets) {
    if (Date.now() - started > 200_000) break; // não estoura o tempo da função
    const [run] = await db.insert(schema.crmHuntRuns).values({ trigger, query: `${t.categories.join(", ")} · ${t.city}` }).returning();
    try {
      const known = await db.query.crmLeads.findMany({ where: eq(schema.crmLeads.city, t.city), columns: { name: true }, orderBy: desc(schema.crmLeads.createdAt), limit: 80 });
      const items = extractJsonArray(await gemini(prompt(t.city, t.categories, cfg.perRun, known.map((k) => k.name)), { search: true }));
      let a = 0;
      for (const it of items) {
        const { created } = await upsertLead(
          {
            name: it.name,
            category: it.category || t.categories[0],
            neighborhood: it.neighborhood,
            city: t.city,
            address: it.address,
            phone: it.phone,
            instagram: it.instagram,
            email: it.email,
            website: it.website,
            rating: typeof it.rating === "number" ? it.rating : null,
            reviews: typeof it.reviews === "number" ? it.reviews : Number(String(it.reviews ?? "").replace(/\D/g, "")) || null,
            pain: it.pain,
            pitch: it.pitch,
          },
          "hunter",
        );
        if (created) {
          a++;
          addedNames.push(it.name);
        }
      }
      found += items.length;
      added += a;
      await db.update(schema.crmHuntRuns).set({ finishedAt: new Date(), found: items.length, added: a }).where(eq(schema.crmHuntRuns.id, run.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      await db.update(schema.crmHuntRuns).set({ finishedAt: new Date(), error: msg.slice(0, 300) }).where(eq(schema.crmHuntRuns.id, run.id));
      if (/limite|chave|Cadastre/i.test(msg)) break; // sem cota ou sem chave: tenta no próximo horário
    }
  }
  if (added > 0) {
    const ouro = await db.query.crmLeads.findMany({ where: eq(schema.crmLeads.source, "hunter"), orderBy: desc(schema.crmLeads.createdAt), limit: added, columns: { score: true } });
    const gold = ouro.filter((l) => l.score === "OURO").length;
    await sendPush("all", { title: `${added} ${added === 1 ? "lead novo" : "leads novos"}${gold ? ` · ${gold} Ouro` : ""}`, body: addedNames.slice(0, 3).join(", ") + (addedNames.length > 3 ? "…" : ""), url: "/crm/leads?fonte=hunter", tag: "hunt" });
  }
  return { skipped: false as const, targets, found, added, errors };
}

/** Pitch sob medida para um lead (botão "Escrever com IA"). */
export async function aiPitch(l: schema.CrmLead, seller: string, channel: string) {
  return gemini(
    `Escreva uma mensagem curta de ${channel === "email" ? "e-mail (com linha de assunto)" : channel === "instagram" ? "direct no Instagram" : "WhatsApp"} em português do Brasil, tom humano e consultivo, sem exageros, para o dono do negócio abaixo, assinada por ${seller.split(" ")[0]} da GoWeb.
A GoWeb oferece cardápio/catálogo digital com a marca do cliente, pedidos pelo WhatsApp, delivery com taxa por distância, mesas com QR, agenda online, caixa e estoque — sem comissão por pedido. Na contratação paga-se só a implantação; a 1ª mensalidade vence 30 dias depois da entrega.
Termine convidando para uma demonstração de 15 minutos. Máximo de 90 palavras. Não use colchetes nem placeholders.
Negócio: ${l.name} · ${l.category ?? ""} · ${l.neighborhood ?? ""} ${l.city ?? ""}
Dor identificada: ${l.pain ?? "não informada"}
Gancho: ${l.pitch ?? "—"}`,
    { maxTokens: 1024 },
  );
}
