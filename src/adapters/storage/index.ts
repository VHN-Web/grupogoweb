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

/** Salva a imagem e devolve a URL pública. `folder` = ex. "tenants/{id}/products". */
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
      const blob = await put(name, bytes, { access: "public", contentType, cacheControlMaxAge: 60 * 60 * 24 * 365 });
      return blob.url;
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
