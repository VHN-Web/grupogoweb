// =============================================================================
import { sniffImage } from "@/lib/security";
// PONTO DE EXTENSÃO: armazenamento de imagens (logo, banner, fotos de produtos)
// =============================================================================
// BLOB_READ_WRITE_TOKEN ou BLOB_STORE_ID (OIDC, padrão das lojas Blob novas da Vercel) -> Vercel Blob
// sem token                      -> pasta .uploads/ servida por /uploads/... (desenvolvimento / servidor próprio)
// =============================================================================
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/core/media";

const MAX_BYTES = 4 * 1024 * 1024; // o navegador já comprime antes (components/forms/ImageUpload)
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export class UploadError extends Error {
  constructor(pt: string, readonly es: string = pt) {
    super(pt);
  }
  /** Mensagem no idioma da loja. */
  text(locale: "es" | "pt") {
    return locale === "pt" ? this.message : this.es;
  }
}

export const blobConfigured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/** Salva a imagem e devolve a URL (absoluta do Blob público ou /uploads/... servida por nós). `folder` = ex. "tenants/{id}/products". */
export async function saveImage(file: File, folder: string): Promise<string> {
  if (!file || file.size === 0) throw new UploadError("Arquivo vazio", "Archivo vacío");
  if (file.size > MAX_BYTES) throw new UploadError("Imagem maior que 4 MB", "Imagen mayor a 4 MB");
  const declared = TYPES[file.type];
  if (!declared) throw new UploadError("Use JPG, PNG, WEBP ou GIF", "Usá JPG, PNG, WEBP o GIF");
  // confere o conteúdo real do arquivo (não confia na extensão / tipo enviado)
  const bytes = Buffer.from(await file.arrayBuffer());
  const real = sniffImage(bytes);
  if (!real) throw new UploadError("Arquivo não é uma imagem válida", "El archivo no es una imagen válida");
  const ext = real;
  const contentType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[real];
  const name = `${folder.replace(/[^a-zA-Z0-9/_-]/g, "")}/${randomUUID()}.${ext}`;

  try {
    if (blobConfigured()) {
      const { put } = await import("@vercel/blob");
      const opts = { contentType, cacheControlMaxAge: 60 * 60 * 24 * 365 };
      // A loja Blob da produção é PRIVADA: grava privado e serve pelo nosso /uploads/... (rota faz o get).
      // Se a loja for pública, a Vercel recusa "private" -> grava público e usa a URL direta.
      try {
        await put(name, bytes, { ...opts, access: "private" });
        return `/uploads/${name}`;
      } catch (e) {
        if (!/public/i.test(String((e as Error)?.message))) throw e;
        const blob = await put(name, bytes, { ...opts, access: "public" });
        return blob.url;
      }
    }
    // Na Vercel o disco é somente leitura: sem Blob configurado, avisa em vez de "funcionar" e sumir
    if (process.env.VERCEL) throw new UploadError("Armazenamento de imagens não configurado. Avise o suporte GoWeb.", "Almacenamiento de imágenes no configurado. Avisá al soporte GoWeb.");
    const dir = path.join(LOCAL_DIR, path.dirname(name));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, name), bytes);
    return `/uploads/${name}`;
  } catch (e) {
    if (e instanceof UploadError) throw e;
    console.error("[upload]", e);
    throw new UploadError("Não foi possível salvar a imagem agora. Tente de novo em instantes.", "No pudimos guardar la imagen ahora. Probá de nuevo en un momento.");
  }
}

// =============================================================================
// Vídeo dos produtos (galeria): o arquivo vai DIRETO do navegador para o Blob (URL de envio assinada,
// sem passar pelo limite de 4,5 MB das funções) e é entregue por URL de leitura assinada (o CDN do Blob
// faz o streaming com Range — necessário no iPhone — sem gastar a função).
// =============================================================================

/** Responde o pedido de URL de envio do navegador. `authorize` confere sessão/produto e o caminho; lança erro se não pode. */
export async function videoUploadResponse(request: Request, body: HandleUploadPresignedBody, authorize: (pathname: string) => Promise<void>) {
  if (!blobConfigured()) throw new UploadError("Envio de vídeo precisa do armazenamento da Vercel (Blob).", "El envío de video necesita el almacenamiento de Vercel (Blob).");
  const { issueSignedToken } = await import("@vercel/blob");
  const { handleUploadPresigned } = await import("@vercel/blob/client");
  return handleUploadPresigned({
    body,
    request,
    getSignedToken: async (pathname) => {
      await authorize(pathname);
      const types = Object.keys(VIDEO_TYPES);
      const token = await issueSignedToken({ pathname, operations: ["put"], allowedContentTypes: types, maximumSizeInBytes: VIDEO_MAX_BYTES, validUntil: Date.now() + 15 * 60_000 });
      return { token, urlOptions: { allowedContentTypes: types, maximumSizeInBytes: VIDEO_MAX_BYTES, validUntil: Date.now() + 15 * 60_000, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 60 * 60 * 24 * 365 } };
    },
  });
}

/** Tamanho e tipo reais do arquivo no Blob (o servidor não confia no que o navegador diz). */
export async function blobInfo(pathname: string): Promise<{ size: number; contentType: string; url: string } | null> {
  if (!blobConfigured()) return null;
  try {
    const { head } = await import("@vercel/blob");
    const h = await head(pathname);
    return { size: h.size, contentType: h.contentType, url: h.url };
  } catch {
    return null;
  }
}

/** Apaga um arquivo do Blob (galeria). Falha aqui não impede tirar da galeria. */
export async function deleteBlob(pathname: string) {
  if (!blobConfigured()) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(pathname);
  } catch (e) {
    console.error("[upload] del", e);
  }
}

// tokens de leitura assinados guardados em memória (cada emissão é uma chamada à API do Blob)
const readTokens = new Map<string, { token: { delegationToken: string; clientSigningToken: string; validUntil: number } }>();

/** URL temporária (1 h) para tocar um vídeo privado direto do CDN do Blob. null = loja pública ou sem Blob. */
export async function signedVideoUrl(pathname: string): Promise<string | null> {
  if (!blobConfigured()) return null;
  try {
    const { issueSignedToken, presignUrl } = await import("@vercel/blob");
    let hit = readTokens.get(pathname);
    if (!hit || hit.token.validUntil - Date.now() < 10 * 60_000) {
      const token = await issueSignedToken({ pathname, operations: ["get"], validUntil: Date.now() + 60 * 60_000 });
      if (readTokens.size > 500) readTokens.clear();
      hit = { token };
      readTokens.set(pathname, hit);
    }
    const { presignedUrl } = await presignUrl(hit.token, { operation: "get", pathname, access: "private" });
    return presignedUrl;
  } catch (e) {
    console.error("[upload] presign", e);
    return null;
  }
}
