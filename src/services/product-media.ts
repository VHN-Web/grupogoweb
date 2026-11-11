import "server-only";
// Galeria multimídia dos produtos: fotos extras, foto principal, ordem, vídeo (até 15 MB, 1 por produto, cota global).
// Regras puras em core/media.ts; arquivos só pelo adapters/storage. Isolamento por loja em toda consulta.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { MAX_EXTRA_IMAGES, blobPathOf, moveOne, productMediaPrefix, promote, validVideoPath, videoAllowed, videoQuotaBytes, videoReasonText, type MediaItem } from "@/core/media";
import { UploadError, blobInfo, deleteBlob, saveImage } from "@/adapters/storage";

export class MediaError extends Error {}

const T = (pt: boolean) => (es: string, p: string) => (pt ? p : es);

async function product(tenantId: string, productId: string) {
  const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)), columns: { id: true, imageUrl: true, name: true } });
  if (!p) throw new MediaError("Produto não encontrado.");
  return p;
}

export async function mediaOf(tenantId: string, productId: string) {
  return db.query.productMedia.findMany({ where: and(eq(schema.productMedia.tenantId, tenantId), eq(schema.productMedia.productId, productId)), orderBy: [asc(schema.productMedia.position), asc(schema.productMedia.createdAt)] });
}

/** Toda a galeria da loja de uma vez (vitrine e painel), agrupada por produto. */
export async function mediaByProduct(tenantId: string, productIds?: string[]) {
  if (productIds && !productIds.length) return new Map<string, MediaItem[]>();
  const rows = await db.query.productMedia.findMany({
    where: productIds ? and(eq(schema.productMedia.tenantId, tenantId), inArray(schema.productMedia.productId, productIds)) : eq(schema.productMedia.tenantId, tenantId),
    columns: { id: true, productId: true, kind: true, url: true, position: true },
    orderBy: [asc(schema.productMedia.position), asc(schema.productMedia.createdAt)],
  });
  const map = new Map<string, MediaItem[]>();
  for (const r of rows) map.set(r.productId, [...(map.get(r.productId) ?? []), { id: r.id, kind: r.kind, url: r.url, position: r.position }]);
  return map;
}

async function nextPosition(tenantId: string, productId: string) {
  const [r] = await db.select({ n: sql<number>`coalesce(max(${schema.productMedia.position}), -1)::int` }).from(schema.productMedia).where(and(eq(schema.productMedia.tenantId, tenantId), eq(schema.productMedia.productId, productId)));
  return Number(r?.n ?? -1) + 1;
}

/** Adiciona fotos (já comprimidas no navegador). Se o produto não tem principal, a 1ª vira principal. */
export async function addImages(tenantId: string, productId: string, files: File[], pt: boolean) {
  const L = T(pt);
  const p = await product(tenantId, productId);
  const current = (await mediaOf(tenantId, productId)).filter((m) => m.kind === "image").length;
  const room = MAX_EXTRA_IMAGES + (p.imageUrl ? 0 : 1) - current;
  const valid = files.filter((f) => f && f.size > 0);
  if (!valid.length) throw new MediaError(L("Elegí al menos una foto.", "Escolha ao menos uma foto."));
  if (valid.length > room) throw new MediaError(L(`Este producto acepta ${Math.max(0, room)} foto(s) más (máximo 10).`, `Este produto aceita mais ${Math.max(0, room)} foto(s) (máximo 10).`));
  let pos = await nextPosition(tenantId, productId);
  let main = p.imageUrl;
  const saved: string[] = [];
  for (const f of valid) {
    let url: string;
    try {
      url = await saveImage(f, productMediaPrefix(tenantId, productId).replace(/\/$/, ""));
    } catch (e) {
      if (e instanceof UploadError) throw new MediaError(e.text(pt ? "pt" : "es"));
      throw e;
    }
    saved.push(url);
    if (!main) {
      main = url;
      await db.update(schema.products).set({ imageUrl: url }).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, tenantId)));
      continue;
    }
    await db.insert(schema.productMedia).values({ tenantId, productId, kind: "image", url, sizeBytes: f.size, contentType: f.type, position: pos++ });
  }
  return saved.length;
}

/** Registra o vídeo já enviado direto ao Blob, conferindo no Blob o tamanho e o tipo reais. */
export async function addVideo(tenantId: string, productId: string, pathname: string, pt: boolean) {
  const L = T(pt);
  await product(tenantId, productId);
  if (!validVideoPath(pathname, tenantId, productId)) throw new MediaError(L("Archivo inválido.", "Arquivo inválido."));
  const info = await blobInfo(pathname);
  if (!info) throw new MediaError(L("No encontramos el video enviado. Probá de nuevo.", "Não encontramos o vídeo enviado. Tente de novo."));
  const [videos, [total]] = await Promise.all([
    db.query.productMedia.findMany({ where: and(eq(schema.productMedia.tenantId, tenantId), eq(schema.productMedia.productId, productId), eq(schema.productMedia.kind, "video")), columns: { id: true } }),
    db.select({ b: sql<number>`coalesce(sum(${schema.productMedia.sizeBytes}), 0)::bigint` }).from(schema.productMedia).where(eq(schema.productMedia.kind, "video")),
  ]);
  const check = videoAllowed({ contentType: info.contentType, size: info.size }, videos.length, Number(total?.b ?? 0), videoQuotaBytes(process.env.MEDIA_VIDEO_QUOTA_MB));
  if (!check.ok) {
    await deleteBlob(pathname); // não deixa arquivo órfão ocupando espaço
    throw new MediaError(videoReasonText(check.reason, pt));
  }
  const url = info.url.includes(".private.") ? `/uploads/${pathname}` : info.url;
  await db.insert(schema.productMedia).values({ tenantId, productId, kind: "video", url, sizeBytes: info.size, contentType: info.contentType, position: await nextPosition(tenantId, productId) });
}

/** Tira da galeria e apaga o arquivo (só dentro da pasta da própria loja). */
export async function removeMedia(tenantId: string, mediaId: string) {
  const m = await db.query.productMedia.findFirst({ where: and(eq(schema.productMedia.id, mediaId), eq(schema.productMedia.tenantId, tenantId)) });
  if (!m) return;
  await db.delete(schema.productMedia).where(and(eq(schema.productMedia.id, mediaId), eq(schema.productMedia.tenantId, tenantId)));
  const path = blobPathOf(m.url);
  // o mesmo arquivo pode ter virado a principal de novo: só apaga se ninguém mais usa
  const still = await db.query.products.findFirst({ where: and(eq(schema.products.tenantId, tenantId), eq(schema.products.imageUrl, m.url)), columns: { id: true } });
  if (path && !still && path.startsWith(`tenants/${tenantId}/`)) await deleteBlob(path);
}

export async function moveMedia(tenantId: string, productId: string, mediaId: string, dir: -1 | 1) {
  const items = (await mediaOf(tenantId, productId)).map((m) => ({ id: m.id, kind: m.kind, url: m.url, position: m.position }));
  for (const o of moveOne(items, mediaId, dir)) await db.update(schema.productMedia).set({ position: o.position }).where(and(eq(schema.productMedia.id, o.id), eq(schema.productMedia.tenantId, tenantId)));
}

/** Foto da galeria vira principal; a principal antiga entra na galeria no lugar dela (nada se perde). */
export async function makeMain(tenantId: string, mediaId: string, pt: boolean) {
  const m = await db.query.productMedia.findFirst({ where: and(eq(schema.productMedia.id, mediaId), eq(schema.productMedia.tenantId, tenantId)) });
  if (!m) return;
  const p = await product(tenantId, m.productId);
  const r = promote(p.imageUrl, { id: m.id, kind: m.kind, url: m.url, position: m.position });
  if (!r.ok) throw new MediaError(T(pt)("El video no puede ser la foto principal.", "O vídeo não pode ser a foto principal."));
  await db.transaction(async (tx) => {
    await tx.update(schema.products).set({ imageUrl: r.newMain }).where(and(eq(schema.products.id, p.id), eq(schema.products.tenantId, tenantId)));
    if (r.replaceWith) await tx.update(schema.productMedia).set({ url: r.replaceWith, contentType: null, sizeBytes: 0 }).where(eq(schema.productMedia.id, m.id));
    else await tx.delete(schema.productMedia).where(eq(schema.productMedia.id, m.id));
  });
}

/** Espaço de vídeo usado na plataforma (painel da GoWeb e aviso ao lojista). */
export async function videoUsage() {
  const [r] = await db.select({ b: sql<number>`coalesce(sum(${schema.productMedia.sizeBytes}), 0)::bigint`, n: sql<number>`count(*)::int` }).from(schema.productMedia).where(eq(schema.productMedia.kind, "video"));
  return { bytes: Number(r?.b ?? 0), count: Number(r?.n ?? 0), quota: videoQuotaBytes(process.env.MEDIA_VIDEO_QUOTA_MB) };
}
