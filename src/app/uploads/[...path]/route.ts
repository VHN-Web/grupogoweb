import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_DIR, blobConfigured, signedVideoUrl } from "@/adapters/storage";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
const VIDEO = new Set(["mp4", "webm", "mov"]);

// Serve as imagens salvas localmente (quando não há Vercel Blob configurado).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const rel = path.normalize(parts.join("/"));
  if (rel.startsWith("..") || path.isAbsolute(rel) || !/^[a-zA-Z0-9/_.-]+$/.test(rel)) return new Response("not found", { status: 404 });
  const ext = rel.split(".").pop() ?? "";
  if (!MIME[ext]) return new Response("not found", { status: 404 });
  const headers = { "content-type": MIME[ext], "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable", "x-content-type-options": "nosniff" };
  // Vídeo (galeria do produto): redireciona para uma URL de leitura assinada de 1 h — o CDN do Blob faz o
  // streaming com Range (iPhone exige) sem passar os bytes pela função.
  if (VIDEO.has(ext) && blobConfigured()) {
    const url = await signedVideoUrl(rel);
    if (url) return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, max-age=1800" } });
    if (process.env.VERCEL) return new Response("not found", { status: 404 });
  }
  // Loja Vercel Blob privada: busca com a credencial do servidor e repassa o conteúdo
  if (blobConfigured()) {
    try {
      const { get } = await import("@vercel/blob");
      const r = await get(rel, { access: "private" });
      if (r?.stream) return new Response(r.stream, { headers });
    } catch (e) {
      console.error("[uploads]", e);
    }
    if (process.env.VERCEL) return new Response("not found", { status: 404 });
  }
  try {
    const buf = await readFile(path.join(LOCAL_DIR, rel));
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
