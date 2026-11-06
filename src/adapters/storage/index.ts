// =============================================================================
// PONTO DE EXTENSÃO: armazenamento de imagens (logo, banner, fotos de produtos)
// =============================================================================
// BLOB_READ_WRITE_TOKEN definido -> Vercel Blob (produção na Vercel)
// sem token                      -> pasta .uploads/ servida por /uploads/... (desenvolvimento / servidor próprio)
// =============================================================================
import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export class UploadError extends Error {}

/** Salva a imagem e devolve a URL pública. `folder` = ex. "tenants/{id}/products". */
export async function saveImage(file: File, folder: string): Promise<string> {
  if (!file || file.size === 0) throw new UploadError("Arquivo vazio");
  if (file.size > MAX_BYTES) throw new UploadError("Imagem maior que 4 MB");
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError("Use JPG, PNG, WEBP ou GIF");
  const name = `${folder.replace(/[^a-zA-Z0-9/_-]/g, "")}/${randomUUID()}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(name, file, { access: "public", contentType: file.type });
    return blob.url;
  }
  const dir = path.join(LOCAL_DIR, path.dirname(name));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, name), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${name}`;
}
