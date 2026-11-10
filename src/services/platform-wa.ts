import "server-only";
// WhatsApp da PLATAFORMA (GoWeb → lojistas, afiliados, clientes da GoWeb): sai pelo número da GoWeb conectado
// na Geovana da GoWeb (Evolution). Sem ele conectado, cai no webhook genérico (adapters/notify).
import { sendWhatsApp, type SendResult } from "@/adapters/notify";

export async function sendPlatformWhatsApp(to: string, message: string): Promise<SendResult> {
  try {
    const gw = await import("@/services/goweb-bot");
    const cfg = await gw.gwBotConfig();
    if (cfg.instance) {
      const ok = await gw.gwProactive(to, message);
      if (ok) return { status: "SENT" };
    }
  } catch (e) {
    console.error("[platform-wa]", e instanceof Error ? e.message : e);
  }
  return sendWhatsApp(to, message);
}
