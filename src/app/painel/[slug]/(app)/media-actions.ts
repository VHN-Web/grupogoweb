"use server";
// Galeria dos produtos (painel → Produtos). Toda ação confere a sessão (área Produtos) e a loja.
import { revalidatePath } from "next/cache";
import { requireTenantAdmin, actorName } from "@/lib/auth";
import { audit } from "@/lib/security";
import { MediaError, addImages, addVideo, makeMain, moveMedia, removeMedia } from "@/services/product-media";

type Res = { ok: true } | { ok: false; error: string };

async function run(slug: string, fn: (tenantId: string, pt: boolean) => Promise<unknown>, what: string): Promise<Res> {
  const t = await requireTenantAdmin(slug, "products");
  const pt = t.country !== "PY";
  try {
    await fn(t.id, pt);
  } catch (e) {
    if (e instanceof MediaError) return { ok: false, error: e.message };
    console.error("[galeria]", e);
    return { ok: false, error: pt ? "Não foi possível concluir. Tente de novo." : "No se pudo completar. Probá de nuevo." };
  }
  await audit(t.id, await actorName(slug), "produto.galeria", what);
  revalidatePath(`/painel/${slug}/produtos`);
  revalidatePath(`/${slug}`);
  return { ok: true };
}

export async function addImagesAction(slug: string, productId: string, f: FormData): Promise<Res> {
  const files = f.getAll("files").filter((x): x is File => x instanceof File);
  return run(slug, (tid, pt) => addImages(tid, productId, files, pt), `${files.length} foto(s)`);
}

export async function addVideoAction(slug: string, productId: string, pathname: string): Promise<Res> {
  return run(slug, (tid, pt) => addVideo(tid, productId, pathname, pt), "vídeo");
}

export async function removeMediaAction(slug: string, mediaId: string): Promise<Res> {
  return run(slug, (tid) => removeMedia(tid, mediaId), "remover");
}

export async function moveMediaAction(slug: string, productId: string, mediaId: string, dir: -1 | 1): Promise<Res> {
  return run(slug, (tid) => moveMedia(tid, productId, mediaId, dir === -1 ? -1 : 1), "ordem");
}

export async function makeMainAction(slug: string, mediaId: string): Promise<Res> {
  return run(slug, (tid, pt) => makeMain(tid, mediaId, pt), "foto principal");
}
