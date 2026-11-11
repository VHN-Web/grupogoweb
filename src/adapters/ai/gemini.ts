// =============================================================================
// IA (Gemini, Google AI Studio) — conversa com instruções de sistema e histórico.
// GEMINI_API_BASE (env) só para testes locais.
// =============================================================================
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: "key" | "quota" | "busy" | "model" | "other" = "other",
  ) {
    super(message);
  }
}

/** Modelo padrão (rápido, feito para alto volume — ideal para atendimento). O Google aposenta modelos antigos
 * para contas novas — os 1.x/2.x salvos viram este. */
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
/** Reservas: se o modelo escolhido estiver sobrecarregado/indisponível, tenta estes, nesta ordem. */
export const GEMINI_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"];
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

export async function geminiChat(o: { key: string; model: string; system: string; history: ChatTurn[]; maxTokens?: number; temperature?: number; timeoutMs?: number; retries?: number }) {
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
    generationConfig: "__MODEL_CFG__",
  });
  // modelo sobrecarregado/indisponível: passa para o próximo modelo da lista de reservas
  const chain = [model, ...GEMINI_FALLBACKS.filter((m) => m !== model)].slice(0, 1 + (o.retries ?? 2));
  let last: unknown;
  for (const m of chain) {
    try {
      return await geminiOnce(o.key, m, body.replace(`"__MODEL_CFG__"`, JSON.stringify(geminiGenConfig(m, o.temperature ?? 0.5, o.maxTokens ?? 600))), o.timeoutMs ?? 20_000);
    } catch (e) {
      last = e;
      if (!(e instanceof AiError) || (e.kind !== "busy" && e.kind !== "model")) throw e;
    }
  }
  throw last;
}

/** Lê uma imagem (ex.: foto do cardápio) e responde em JSON. Usa a mesma lista de modelos reservas. */
export async function geminiVision(o: { key: string; model: string; prompt: string; imageBase64: string; mime: string; maxTokens?: number; timeoutMs?: number }) {
  if (!o.key) throw new AiError("IA sem chave configurada", "key");
  const model = geminiModel(o.model);
  const chain = [model, ...GEMINI_FALLBACKS.filter((m) => m !== model)];
  let last: unknown;
  for (const m of chain) {
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: o.mime, data: o.imageBase64 } }, { text: o.prompt }] }],
      generationConfig: { ...geminiGenConfig(m, 0.1, o.maxTokens ?? 8192), responseMimeType: "application/json" },
    });
    try {
      return await geminiOnce(o.key, m, body, o.timeoutMs ?? 55_000);
    } catch (e) {
      last = e;
      if (!(e instanceof AiError) || (e.kind !== "busy" && e.kind !== "model")) throw e;
    }
  }
  throw last;
}

async function geminiOnce(key: string, model: string, body: string, timeoutMs: number) {
  const res = await fetch(`${process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: unknown) => {
    // demorou demais = modelo congestionado (passageiro)
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("O Gemini demorou para responder (sobrecarga passageira).", "busy");
    throw new AiError("Não consegui falar com o Gemini.");
  });
  const j = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    const msg = j?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new AiError("Chave do Gemini inválida.", "key");
    if (res.status === 404 || /not found|no longer available|not supported for generateContent/i.test(msg)) throw new AiError(`Modelo ${model} indisponível.`, "model");
    if (res.status === 503 || /high demand|overloaded|unavailable/i.test(msg)) throw new AiError("O Gemini está sobrecarregado agora (passageiro).", "busy");
    if (res.status === 429) throw new AiError("Limite do Gemini atingido por agora.", "quota");
    throw new AiError(`Gemini: ${msg}`);
  }
  return (j?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

/**
 * Pesquisa com a ferramenta "Google Search" do Gemini (sem modo JSON — a busca não aceita).
 * Devolve o texto e as páginas que o Google usou (groundingMetadata), para mostrar as fontes.
 */
export async function geminiSearch(o: { key: string; model: string; prompt: string; maxTokens?: number; timeoutMs?: number }) {
  if (!o.key) throw new AiError("IA sem chave configurada", "key");
  const model = geminiModel(o.model);
  const chain = [model, ...GEMINI_FALLBACKS.filter((m) => m !== model)];
  let last: unknown;
  for (const m of chain) {
    try {
      const res = await fetch(`${process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": o.key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: o.prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: geminiGenConfig(m, 0.2, o.maxTokens ?? 8192),
        }),
        signal: AbortSignal.timeout(o.timeoutMs ?? 110_000),
      }).catch((e: unknown) => {
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("O Gemini demorou para responder (sobrecarga passageira).", "busy");
        throw new AiError("Não consegui falar com o Gemini.");
      });
      type Chunk = { web?: { uri?: string; title?: string } };
      const j = (await res.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: Chunk[] } }[];
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        const msg = j?.error?.message ?? `HTTP ${res.status}`;
        if (res.status === 400 && /API key/i.test(msg)) throw new AiError("Chave do Gemini inválida.", "key");
        if (res.status === 404 || /not found|no longer available|not supported/i.test(msg)) throw new AiError(`Modelo ${m} indisponível.`, "model");
        if (res.status === 503 || /high demand|overloaded|unavailable/i.test(msg)) throw new AiError("O Gemini está sobrecarregado agora (passageiro).", "busy");
        if (res.status === 429) throw new AiError("Limite do Gemini atingido por agora.", "quota");
        throw new AiError(`Gemini: ${msg}`);
      }
      const c = j?.candidates?.[0];
      const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      const sources = (c?.groundingMetadata?.groundingChunks ?? [])
        .map((g) => ({ title: g.web?.title ?? "", url: g.web?.uri ?? "" }))
        .filter((s) => /^https?:\/\//.test(s.url));
      return { text, sources };
    } catch (e) {
      last = e;
      if (!(e instanceof AiError) || (e.kind !== "busy" && e.kind !== "model")) throw e;
    }
  }
  throw last;
}
