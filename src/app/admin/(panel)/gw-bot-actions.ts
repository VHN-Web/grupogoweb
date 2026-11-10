"use server";
// Admin → Geovana da GoWeb (WhatsApp da própria GoWeb).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminActor, requirePlatformAdmin, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { GeovanaError } from "@/services/geovana";
import { GwBotError, gwConnect, gwDisconnect, gwResume, gwSimulate, gwStaffReply, saveGwBot } from "@/services/goweb-bot";
import type { ChatTurn } from "@/adapters/ai/gemini";
import { AiError } from "@/adapters/ai/gemini";

const back = (msg: string, kind: "ok" | "err" = "ok", extra = ""): never => redirect(`/admin/geovana?${kind}=${encodeURIComponent(msg)}${extra}`);
const errMsg = (e: unknown) => (e instanceof GwBotError || e instanceof GeovanaError || e instanceof AiError || e instanceof Error ? e.message : "Erro inesperado.");

export async function gwConnectAction() {
  await requirePlatformOwner();
  try {
    await gwConnect();
  } catch (e) {
    back(errMsg(e), "err");
  }
  back("Escaneie o QR com o WhatsApp da GoWeb.", "ok", "&qr=1");
}

export async function gwDisconnectAction() {
  await requirePlatformOwner();
  await gwDisconnect();
  await audit(null, await adminActor(), "gwbot.disconnect", "");
  back("WhatsApp da GoWeb desconectado.");
}

export async function gwSaveAction(f: FormData) {
  await requirePlatformOwner();
  const phones = String(f.get("partnerPhones") ?? "")
    .split(/[,\n;]/)
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean)
    .map((d) => `+${d.length <= 11 ? `55${d}` : d}`);
  const hours = String(f.get("followUpHours") ?? "")
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => n >= 2 && n <= 720);
  await saveGwBot({
    enabled: f.get("enabled") === "on",
    extra: String(f.get("extra") ?? "").slice(0, 3000),
    hours: String(f.get("hours") ?? "").slice(0, 200) || undefined,
    pauseMinutes: Math.min(1440, Math.max(5, Number(f.get("pauseMinutes")) || 120)),
    autoFollowUp: f.get("autoFollowUp") === "on",
    setupNudges: f.get("setupNudges") === "on",
    idleNudges: f.get("idleNudges") === "on",
    billingNudges: f.get("billingNudges") === "on",
    followUpHours: hours.length ? hours.slice(0, 4).sort((a, b) => a - b) : undefined,
    partnerPhones: phones.filter((p) => /^\+\d{12,15}$/.test(p)).slice(0, 6),
  });
  await audit(null, await adminActor(), "gwbot.config", "");
  revalidatePath("/admin/geovana");
  back("Geovana da GoWeb salva ✓");
}

export async function gwReplyAction(chatId: string, f: FormData) {
  await requirePlatformAdmin();
  const text = String(f.get("text") ?? "").trim().slice(0, 2000);
  if (!text) back("Escreva a mensagem.", "err", `&chat=${chatId}`);
  try {
    await gwStaffReply(chatId, text, await adminActor());
  } catch (e) {
    back(errMsg(e), "err", `&chat=${chatId}`);
  }
  back("Enviado ✓ (a IA pausou nessa conversa)", "ok", `&chat=${chatId}`);
}

export async function gwResumeAction(chatId: string) {
  await requirePlatformAdmin();
  await gwResume(chatId);
  back("A Geovana voltou a responder essa conversa.", "ok", `&chat=${chatId}`);
}

export async function gwSimulateAction(as: "lead" | "store" | "affiliate", history: ChatTurn[]) {
  await requirePlatformAdmin();
  try {
    const r = await gwSimulate(history.slice(-14), as);
    return { text: r.text + (r.tags.length ? `\n\n[sistema: ${r.tags.join(" · ")}]` : "") };
  } catch (e) {
    return { text: "", error: errMsg(e) };
  }
}

export async function generateIdeasAction() {
  await requirePlatformAdmin();
  const { generateIdeas, ContentError } = await import("@/services/content-ideas");
  try {
    await generateIdeas();
  } catch (e) {
    back(e instanceof ContentError || e instanceof AiError ? e.message : "Não consegui gerar agora.", "err", "#conteudo");
  }
  revalidatePath("/admin/geovana");
  redirect("/admin/geovana?ok=Ideias%20novas%20prontas%20%E2%9C%93#conteudo");
}
