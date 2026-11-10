"use server";
// Admin → Configurações → Geovana: servidor Evolution da GoWeb e chave de IA (Gemini).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminActor, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { sealSecret } from "@/lib/secrets";
import { saveWhatsappPlatform } from "@/services/geovana";
import { geminiChat, geminiModel, AiError } from "@/adapters/ai/gemini";

const back = (msg: string, kind: "ok" | "err" = "ok"): never => redirect(`/admin/config?${kind}=${encodeURIComponent(msg)}#geovana`);

export async function saveEvolutionAction(f: FormData) {
  await requirePlatformOwner();
  const url = String(f.get("url") ?? "").trim().replace(/\/$/, "");
  const key = String(f.get("key") ?? "").trim();
  if (!/^https?:\/\/[^\s]+$/.test(url)) back("URL do servidor inválida (ex.: https://evo.goweboficial.com).", "err");
  let ok = false;
  if (key) {
    try {
      const r = await fetch(`${url}/instance/fetchInstances`, { headers: { apikey: key }, signal: AbortSignal.timeout(15_000) });
      ok = r.ok;
      if (r.status === 401 || r.status === 403) back("A Evolution recusou a chave global.", "err");
    } catch {
      back("Não consegui falar com o servidor da Evolution nessa URL.", "err");
    }
  }
  await saveWhatsappPlatform({ evolutionUrl: url, ...(key ? { evolutionKeySealed: sealSecret(key) } : {}) });
  await audit(null, await adminActor(), "whatsapp.evolution", url);
  revalidatePath("/admin/config");
  back(ok ? "Servidor da Evolution conectado ✓" : "URL salva.");
}

export async function saveGeovanaAiAction(f: FormData) {
  await requirePlatformOwner();
  const key = String(f.get("key") ?? "").replace(/\s+/g, "");
  const model = geminiModel(String(f.get("model") ?? ""));
  let busy = false;
  if (key) {
    try {
      await geminiChat({ key, model, system: "Responda só: ok", history: [{ role: "user", text: "teste" }], maxTokens: 10 });
    } catch (e) {
      // sobrecarga/limite = a chave passou na autenticação; salva assim mesmo
      if (e instanceof AiError && (e.kind === "busy" || e.kind === "quota")) busy = true;
      else back(e instanceof AiError ? e.message : "O Gemini não respondeu.", "err");
    }
  }
  await saveWhatsappPlatform({ model, ...(key ? { geminiKeySealed: sealSecret(key) } : {}) });
  await audit(null, await adminActor(), "whatsapp.ai", model);
  revalidatePath("/admin/config");
  back(busy ? "Chave do Gemini salva ✓ — o modelo está sobrecarregado neste minuto; a Geovana tenta de novo sozinha." : "IA da Geovana salva ✓");
}
