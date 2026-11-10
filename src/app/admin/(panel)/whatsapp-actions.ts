"use server";
// Admin → Configurações → Geovana: servidor Evolution da GoWeb e chave de IA (Gemini).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminActor, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { sealSecret } from "@/lib/secrets";
import { saveWhatsappPlatform, whatsappPlatform } from "@/services/geovana";
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
  // salva antes de testar: o teste nunca impede de guardar (só uma chave recusada é desfeita)
  const prev = await whatsappPlatform();
  await saveWhatsappPlatform({ model, ...(key ? { geminiKeySealed: sealSecret(key) } : {}) });
  await audit(null, await adminActor(), "whatsapp.ai", model);
  revalidatePath("/admin/config");
  if (!key) back("Modelo da IA salvo ✓");
  try {
    await geminiChat({ key, model, system: "Responda só: ok", history: [{ role: "user", text: "teste" }], maxTokens: 10, timeoutMs: 8_000, retries: 2 });
  } catch (e) {
    if (e instanceof AiError && e.kind === "key") {
      await saveWhatsappPlatform({ model, geminiKeySealed: prev.geminiKeySealed });
      back("O Google recusou essa chave do Gemini. Confira se copiou inteira.", "err");
    }
    back(`Chave do Gemini salva ✓ — o teste não respondeu agora (${e instanceof AiError ? e.message : "sem resposta"}). A Geovana tenta de novo sozinha a cada mensagem.`);
  }
  back("IA da Geovana salva e testada ✓");
}
