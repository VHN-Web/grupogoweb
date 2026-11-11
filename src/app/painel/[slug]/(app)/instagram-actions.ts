"use server";
// Instagram (Direct) da loja — GoInteligence. Plano conferido aqui (servidor) e de novo no serviço.
import { redirect } from "next/navigation";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { getRegion, tr } from "@/core/region";
import { setChatPaused } from "@/services/geovana";
import { IgError, InstagramError, assertTenantInstagram, igDisconnect, igResumeChat, igSetAi, igStaffReply } from "@/services/instagram";

const back = (slug: string, page: string, kind: "ok" | "err", msg: string): never => redirect(`/painel/${slug}/${page}?${kind}=${encodeURIComponent(msg)}`);

const L = (t: { country: string }) => tr(getRegion(t.country).locale);

async function pro(slug: string, page: string) {
  const t = await requireTenantAdmin(slug, "customers");
  try {
    assertTenantInstagram(t);
  } catch (e) {
    back(slug, page, "err", (e as Error).message);
  }
  return t;
}

export async function igDisconnectAction(slug: string) {
  const t = await pro(slug, "instagram");
  await igDisconnect({ tenantId: t.id }, await actorName(slug));
  back(slug, "instagram", "ok", L(t)("Instagram desconectado.", "Instagram desconectado."));
}

export async function igAiAction(slug: string, on: boolean) {
  const t = await pro(slug, "instagram");
  await igSetAi({ tenantId: t.id }, on);
  back(slug, "instagram", "ok", on ? L(t)("La Geovana responde en Instagram.", "Geovana respondendo no Instagram.") : L(t)("IA apagada en Instagram: los mensajes quedan en la bandeja.", "IA desligada no Instagram: as mensagens ficam na caixa de entrada."));
}

export async function igReplyAction(slug: string, page: string, chatId: string, f: FormData) {
  const t = await pro(slug, page);
  if (!(await rateLimit(`ig-reply:${t.id}`, 60, 60))) back(slug, page, "err", L(t)("Muchas respuestas seguidas. Esperá un poco.", "Muitas respostas seguidas. Aguarde um pouco."));
  let err = "";
  try {
    await igStaffReply({ tenantId: t.id }, chatId, String(f.get("text") ?? ""), await actorName(slug));
  } catch (e) {
    err = e instanceof InstagramError || e instanceof IgError ? e.message : L(t)("No se pudo enviar.", "Não foi possível enviar.");
  }
  if (err) back(slug, page, "err", err);
  back(slug, page, "ok", L(t)("Respuesta enviada en Instagram.", "Resposta enviada no Instagram."));
}

export async function igResumeAction(slug: string, page: string, chatId: string) {
  const t = await pro(slug, page);
  await igResumeChat({ tenantId: t.id }, chatId);
  back(slug, page, "ok", L(t)("La Geovana vuelve a responder esta conversación.", "A Geovana voltou a responder essa conversa."));
}

/** WhatsApp na caixa unificada: "eu atendo" / "devolver para a IA" (volta para a própria caixa). */
export async function waPauseAction(slug: string, chatId: string, minutes: number) {
  const t = await requireTenantAdmin(slug, "customers");
  if (t.tier !== "pro") redirect(`/painel/${slug}/plano`);
  await setChatPaused(t.id, chatId, minutes);
  back(slug, "conversas", "ok", minutes > 0 ? L(t)("Listo: atendés vos esta conversación.", "Pronto: você atende essa conversa.") : L(t)("La Geovana vuelve a responder esta conversación.", "A Geovana voltou a responder essa conversa."));
}
