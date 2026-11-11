import "server-only";
// WhatsApp da PLATAFORMA (GoWeb → lojistas, afiliados, clientes da GoWeb): sai pelo número da GoWeb conectado
// na Geovana da GoWeb (Evolution), COM a proteção da Geovana (limites, horário comercial, fila, circuit breaker).
// Só usa o webhook genérico (adapters/notify) quando o número da GoWeb não está configurado — nunca para
// contornar um bloqueio da proteção nem para quem pediu para parar.
import { sendWhatsApp, type SendResult } from "@/adapters/notify";
import type { SendKind } from "@/core/wa-guard";

/** `kind`: "support" = resposta a chamado (sai a qualquer hora); "proactive" = cobrança/aviso/afiliado (horário comercial). */
export async function sendPlatformWhatsApp(to: string, message: string, kind: SendKind = "proactive"): Promise<SendResult> {
  try {
    const gw = await import("@/services/goweb-bot");
    const cfg = await gw.gwBotConfig();
    if (cfg.instance) {
      const ok = await gw.gwProactive(to, message, {}, kind);
      return ok ? { status: "SENT" } : { status: "FAILED", error: "segurado pela proteção da Geovana (parar, limite, horário ou restrição)" };
    }
  } catch (e) {
    console.error("[platform-wa]", e instanceof Error ? e.message : e);
    return { status: "FAILED", error: e instanceof Error ? e.message : "erro" };
  }
  return sendWhatsApp(to, message);
}
