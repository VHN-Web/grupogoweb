// =============================================================================
// IA (Gemini, Google AI Studio) — conversa com instruções de sistema e histórico.
// GEMINI_API_BASE (env) só para testes locais.
// =============================================================================
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "key" | "quota" | "other" = "other",
  ) {
    super(message);
  }
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
  const res = await fetch(`${process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(o.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": o.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents,
      generationConfig: { temperature: o.temperature ?? 0.5, maxOutputTokens: o.maxTokens ?? 600, ...(/flash/.test(o.model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const j = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    const msg = j?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new AiError("Chave do Gemini inválida.", "key");
    if (res.status === 429) throw new AiError("Limite do Gemini atingido por agora.", "quota");
    throw new AiError(`Gemini: ${msg}`);
  }
  return (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}
