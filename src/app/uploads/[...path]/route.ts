import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_DIR, blobConfigured } from "@/adapters/storage";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// Serve as imagens salvas localmente (quando não há Vercel Blob configurado).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const rel = path.normalize(parts.join("/"));
  if (rel.startsWith("..") || path.isAbsolute(rel) || !/^[a-zA-Z0-9/_.-]+$/.test(rel)) return new Response("not found", { status: 404 });
  const ext = rel.split(".").pop() ?? "";
  if (!MIME[ext]) return new Response("not found", { status: 404 });
  const headers = { "content-type": MIME[ext], "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable", "x-content-type-options": "nosniff" };
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
