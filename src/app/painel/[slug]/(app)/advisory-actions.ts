"use server";
// Assessoria GoWeb no painel da loja. Sessão + disponibilidade conferidas aqui (servidor) e de novo no serviço.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { getRegion, tr } from "@/core/region";
import { parseMajorToMinor } from "@/core/money";
import type { Currency } from "@/core/types";
import { saveImage, UploadError } from "@/adapters/storage";
import { AdvisoryError, advisoryErrorText, aiCaption, assertAdvisory, cancelRequest, completeTask, parseSimInput, requestPlan, setAutonomy, setPostStatus, updatePost } from "@/services/advisory";

const back = (slug: string, kind: "ok" | "err", msg: string, aba?: string): never => redirect(`/painel/${slug}/crescer?${aba ? `aba=${aba}&` : ""}${kind}=${encodeURIComponent(msg)}`);
const L = (t: { country: string }) => tr(getRegion(t.country).locale);

async function guard(slug: string) {
  const t = await requireTenantAdmin(slug, "customers");
  try {
    await assertAdvisory(t);
  } catch (e) {
    back(slug, "err", advisoryErrorText(e, t));
  }
  return t;
}

export async function requestAdvisoryAction(slug: string, f: FormData) {
  const t = await guard(slug);
  if (!(await rateLimit(`advisory-req:${t.id}`, 5, 3600))) back(slug, "err", L(t)("Muchos pedidos seguidos. Esperá un poco.", "Muitos pedidos seguidos. Aguarde um pouco."));
  let err = "";
  try {
    await requestPlan(t, parseSimInput(f), await actorName(slug));
  } catch (e) {
    err = advisoryErrorText(e, t);
  }
  if (err) back(slug, "err", err);
  back(slug, "ok", L(t)("¡Pedido enviado! Un socio de GoWeb te contacta para confirmar.", "Pedido enviado! Um sócio da GoWeb vai falar com você para confirmar."));
}

export async function cancelAdvisoryAction(slug: string) {
  const t = await guard(slug);
  await cancelRequest(t, await actorName(slug));
  back(slug, "ok", L(t)("Pedido cancelado.", "Pedido cancelado."));
}

/** Salva a legenda/foto e, se pedido, aprova. `jpeg` = cópia JPEG feita no navegador (exigida pela Meta para publicar). */
export async function savePostAction(slug: string, postId: string, f: FormData) {
  const t = await guard(slug);
  const caption = String(f.get("caption") ?? "").slice(0, 2500);
  const approve = f.get("approve") === "1";
  let imageUrl: string | undefined;
  let jpegUrl: string | undefined;
  let err = "";
  try {
    const img = f.get("image");
    if (img instanceof File && img.size > 0) imageUrl = await saveImage(img, `tenants/${t.id}/advisory`);
    const jpeg = f.get("jpeg");
    if (jpeg instanceof File && jpeg.size > 0) {
      if (jpeg.type !== "image/jpeg") throw new AdvisoryError(L(t)("La copia para Instagram tiene que ser JPEG.", "A cópia para o Instagram precisa ser JPEG."));
      const url = await saveImage(jpeg, `tenants/${t.id}/advisory`);
      if (!/\.jpg$/i.test(url)) throw new AdvisoryError(L(t)("La copia para Instagram tiene que ser JPEG.", "A cópia para o Instagram precisa ser JPEG."));
      jpegUrl = url;
    }
    await updatePost(t, postId, { caption, ...(imageUrl ? { imageUrl } : {}), ...(jpegUrl ? { jpegUrl } : {}), approve }, await actorName(slug));
  } catch (e) {
    err = e instanceof UploadError ? e.text(getRegion(t.country).locale) : advisoryErrorText(e, t);
  }
  if (err) back(slug, "err", err, "calendario");
  revalidatePath(`/painel/${slug}/crescer`);
  back(slug, "ok", approve ? L(t)("Post aprobado.", "Post aprovado.") : L(t)("Post guardado.", "Post salvo."), "calendario");
}

export async function aiCaptionAction(slug: string, postId: string) {
  const t = await guard(slug);
  if (!(await rateLimit(`advisory-ai:${t.id}`, 20, 600))) back(slug, "err", L(t)("Muchos pedidos seguidos. Esperá un poco.", "Muitos pedidos seguidos. Aguarde um pouco."), "calendario");
  let err = "";
  try {
    await aiCaption(t, postId);
  } catch (e) {
    err = advisoryErrorText(e, t);
  }
  if (err) back(slug, "err", err, "calendario");
  back(slug, "ok", L(t)("Texto nuevo listo. Revisalo antes de aprobar.", "Texto novo pronto. Revise antes de aprovar."), "calendario");
}

export async function postStatusAction(slug: string, postId: string, status: "done_manual" | "skipped" | "draft") {
  const t = await guard(slug);
  let err = "";
  try {
    await setPostStatus(t, postId, status);
  } catch (e) {
    err = advisoryErrorText(e, t);
  }
  if (err) back(slug, "err", err, "calendario");
  back(slug, "ok", L(t)("Listo.", "Pronto."), "calendario");
}

export async function taskAction(slug: string, taskId: string, f: FormData) {
  const t = await guard(slug);
  const raw = String(f.get("spent") ?? "").trim();
  const spent = raw ? parseMajorToMinor(raw, t.currency as Currency) : null;
  let err = "";
  try {
    await completeTask(t, taskId, { spent, skip: f.get("skip") === "1" });
  } catch (e) {
    err = advisoryErrorText(e, t);
  }
  if (err) back(slug, "err", err, "tarefas");
  back(slug, "ok", L(t)("Tarea actualizada.", "Tarefa atualizada."), "tarefas");
}

export async function autonomyAction(slug: string, f: FormData) {
  const t = await guard(slug);
  const m = String(f.get("mode"));
  const mode = m === "approved" || m === "all" ? m : "off";
  let err = "";
  try {
    await setAutonomy(t, mode, await actorName(slug));
  } catch (e) {
    err = advisoryErrorText(e, t);
  }
  if (err) back(slug, "err", err, "calendario");
  back(slug, "ok", L(t)("Preferencia guardada.", "Preferência salva."), "calendario");
}
