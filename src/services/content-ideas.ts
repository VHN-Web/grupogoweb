import "server-only";
// Ideias de posts/Reels a partir das perguntas que chegam no WhatsApp da GoWeb e das dores anotadas no CRM.
import { desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { anonymize, contentPrompt, parseContentIdeas, readIdeas, type ContentIdeas } from "@/core/content-ideas";
import { geminiChat } from "@/adapters/ai/gemini";
import { whatsappPlatform } from "@/services/geovana";
import { gwBotConfig } from "@/services/goweb-bot";
import { openSecret } from "@/lib/secrets";

export class ContentError extends Error {}

export async function lastIdeas(): Promise<ContentIdeas | null> {
  const s = await db.query.platformSettings.findFirst({ columns: { contentIdeas: true } });
  return readIdeas(s?.contentIdeas);
}

export async function generateIdeas(): Promise<ContentIdeas> {
  const p = await whatsappPlatform();
  const key = (p.geminiKeySealed && openSecret(p.geminiKeySealed)) || process.env.GEMINI_API_KEY || "";
  if (!key) throw new ContentError("Cadastre a chave do Gemini em Configurações → Geovana.");
  const [msgs, leads, cfg] = await Promise.all([
    db.query.gwMessages.findMany({ where: eq(schema.gwMessages.role, "user"), orderBy: desc(schema.gwMessages.createdAt), limit: 400, columns: { text: true } }),
    db.query.crmLeads.findMany({ where: isNotNull(schema.crmLeads.pain), orderBy: desc(schema.crmLeads.updatedAt), limit: 120, columns: { pain: true } }),
    gwBotConfig(),
  ]);
  // só perguntas de verdade (com "?" ou palavras de dúvida), sem dados pessoais e sem repetir
  const seen = new Set<string>();
  const questions = msgs
    .map((m) => anonymize(m.text))
    .filter((t) => t.length > 8 && /\?|quanto|como|qual|funciona|precisa|posso|tem /i.test(t) && !/^\[/.test(t))
    .filter((t) => {
      const k = t.toLowerCase().replace(/\W+/g, " ").trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 150);
  const pains = [...new Set(leads.map((l) => anonymize(l.pain ?? "")).filter(Boolean))].slice(0, 60);
  const raw = await geminiChat({ key, model: p.model, system: "Responda somente com JSON válido.", history: [{ role: "user", text: contentPrompt(questions, pains, cfg.extra) }], maxTokens: 6000, temperature: 0.8, timeoutMs: 55_000 });
  const ideas = parseContentIdeas(raw, questions.length + pains.length, new Date());
  if (!ideas) throw new ContentError("A IA não devolveu ideias neste momento. Tente de novo.");
  await db.insert(schema.platformSettings).values({ id: "default", contentIdeas: JSON.stringify(ideas) }).onConflictDoUpdate({ target: schema.platformSettings.id, set: { contentIdeas: JSON.stringify(ideas), updatedAt: new Date() } });
  return ideas;
}
