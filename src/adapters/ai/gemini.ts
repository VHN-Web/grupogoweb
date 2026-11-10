// =============================================================================
// IA (Gemini, Google AI Studio) — conversa com instruções de sistema e histórico.
// GEMINI_API_BASE (env) só para testes locais.
// =============================================================================
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "key" | "quota" | "busy" | "other" = "other",
  ) {
    super(message);
  }
}

/** Modelo padrão. O Google aposenta modelos antigos para contas novas — os 1.x/2.x salvos viram este. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
export function geminiModel(m: string | null | undefined): string {
  const v = String(m ?? "").trim();
  return !v || /^gemini-(1|2)\./.test(v) ? GEMINI_DEFAULT_MODEL : v;
}
/** Config de geração: nos 2.x "flash" desliga o raciocínio; nos novos deixa folga de tokens para ele. */
export function geminiGenConfig(model: string, temperature: number, maxTokens: number) {
  const legacy = /^gemini-2\./.test(model);
  return { temperature, maxOutputTokens: legacy ? maxTokens : maxTokens + 2048, ...(legacy && /flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) };
}

export type ChatTurn = { role: "user" | "model"; text: string };

export async function geminiChat(o: { key: string; model: string; system: string; history: ChatTurn[]; maxTokens?: number; temperature?: number }) {
  if (!o.key) throw new AiError("IA sem chave configurada", "key");
  // a API exige alternância começando por "user": junta mensagens seguidas do mesmo papel
  const contents: { role: string; parts: { text: string }[] }[] = [];
  for (const t of o.history) {
    const last = contents.at(-1);
    if (last && last.role === t.role) last.parts[0].text += `\n${t.text}`;
    else contents.push({ role: t.role, parts: [{ text: t.text }] });
  }
  while (contents.length && contents[0].role !== "user") contents.shift();
  const model = geminiModel(o.model);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: o.system }] },
    contents,
    generationConfig: geminiGenConfig(model, o.temperature ?? 0.5, o.maxTokens ?? 600),
  });
  // modelo sobrecarregado (503 / "high demand") é passageiro: tenta mais 2 vezes com espera curta
  for (let attempt = 0; ; attempt++) {
    try {
      return await geminiOnce(o.key, model, body);
    } catch (e) {
      if (!(e instanceof AiError) || e.kind !== "busy" || attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

async function geminiOnce(key: string, model: string, body: string) {
  const res = await fetch(`${process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  const j = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    const msg = j?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new AiError("Chave do Gemini inválida.", "key");
    if (res.status === 503 || /high demand|overloaded|unavailable/i.test(msg)) throw new AiError("O Gemini está sobrecarregado agora (passageiro).", "busy");
    if (res.status === 429) throw new AiError("Limite do Gemini atingido por agora.", "quota");
    throw new AiError(`Gemini: ${msg}`);
  }
  return (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}
