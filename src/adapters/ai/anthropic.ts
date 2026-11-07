// =============================================================================
// PONTO DE EXTENSÃO: modelo de linguagem do assistente do painel (API da Anthropic).
// ANTHROPIC_API_KEY ausente → o assistente funciona só como guia (sem IA).
// ASSISTANT_MODEL opcional (padrão: modelo rápido e barato).
// =============================================================================
import "server-only";

export type AiBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type AiMessage = { role: "user" | "assistant"; content: string | AiBlock[] };
export type AiTool = { name: string; description: string; input_schema: Record<string, unknown> };

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

export class AiError extends Error {}

export async function chat(opts: { system: string; messages: AiMessage[]; tools: AiTool[]; maxTokens?: number }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("AI not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(`${process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ASSISTANT_MODEL || "claude-haiku-5-5",
        max_tokens: opts.maxTokens ?? 800,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
      }),
    });
    if (!res.ok) {
      console.error("[assistant] API", res.status, (await res.text()).slice(0, 300));
      throw new AiError(`HTTP ${res.status}`);
    }
    const j = (await res.json()) as { content: AiBlock[]; stop_reason: string };
    return j;
  } finally {
    clearTimeout(timer);
  }
}
