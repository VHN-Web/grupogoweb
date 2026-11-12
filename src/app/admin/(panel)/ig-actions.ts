"use server";
// Admin → Geovana → Instagram: app da Meta, conta institucional da GoWeb e respostas pela caixa de entrada.
import { redirect } from "next/navigation";
import { adminActor, requirePlatformAdmin, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { IgError, InstagramError, igDisconnect, igResumeChat, igSetAi, igStaffReply, saveIgPlatform } from "@/services/instagram";
import { GwBotError, gwResume, gwStaffReply } from "@/services/goweb-bot";

const back = (path: string, kind: "ok" | "err", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
const IG = "/admin/geovana/instagram";
const INBOX = "/admin/geovana/conversas";

/** App da Meta: só o dono da plataforma (o app secret assina os webhooks de todas as contas). */
export async function igSaveAppAction(f: FormData) {
  await requirePlatformOwner();
  const appId = String(f.get("appId") ?? "").trim();
  const appSecret = String(f.get("appSecret") ?? "").trim();
  const configId = String(f.get("configId") ?? "").trim();
  if (appId && !/^\d{5,25}$/.test(appId)) back(IG, "err", "O ID do app tem só números.");
  if (configId && !/^\d{5,25}$/.test(configId)) back(IG, "err", "O ID da configuração do login unificado tem só números.");
  await saveIgPlatform({ appId: appId || undefined, appSecret: appSecret || undefined, configId });
  await audit(null, await adminActor(), "instagram.app", appSecret ? "id + secret" : "id");
  back(IG, "ok", "App do Instagram salvo ✓");
}

export async function igGowebDisconnectAction() {
  await requirePlatformOwner();
  await igDisconnect("goweb", await adminActor());
  back(IG, "ok", "Instagram da GoWeb desconectado.");
}

export async function igGowebAiAction(on: boolean) {
  await requirePlatformAdmin();
  await igSetAi("goweb", on);
  back(IG, "ok", on ? "Geovana respondendo no Instagram da GoWeb." : "IA desligada no Instagram da GoWeb.");
}

export async function igGowebReplyAction(chatId: string, f: FormData) {
  await requirePlatformAdmin();
  let err = "";
  try {
    await igStaffReply("goweb", chatId, String(f.get("text") ?? ""), await adminActor());
  } catch (e) {
    err = e instanceof InstagramError || e instanceof IgError ? e.message : "Não foi possível enviar.";
  }
  if (err) back(INBOX, "err", err);
  back(INBOX, "ok", "Enviado no Instagram ✓ (a IA pausou nessa conversa)");
}

export async function igGowebResumeAction(chatId: string) {
  await requirePlatformAdmin();
  await igResumeChat("goweb", chatId);
  back(INBOX, "ok", "A Geovana voltou a responder essa conversa.");
}

/** WhatsApp da GoWeb na caixa unificada. */
export async function waGowebReplyAction(chatId: string, f: FormData) {
  await requirePlatformAdmin();
  const text = String(f.get("text") ?? "").trim().slice(0, 2000);
  if (!text) back(INBOX, "err", "Escreva a mensagem.");
  let err = "";
  try {
    await gwStaffReply(chatId, text, await adminActor());
  } catch (e) {
    err = e instanceof GwBotError || e instanceof Error ? e.message : "Não foi possível enviar.";
  }
  if (err) back(INBOX, "err", err);
  back(INBOX, "ok", "Enviado no WhatsApp ✓ (a IA pausou nessa conversa)");
}

export async function waGowebResumeAction(chatId: string) {
  await requirePlatformAdmin();
  await gwResume(chatId);
  back(INBOX, "ok", "A Geovana voltou a responder essa conversa.");
}
