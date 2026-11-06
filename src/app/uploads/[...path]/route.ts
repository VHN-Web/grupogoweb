import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_DIR } from "@/adapters/storage";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

// Serve as imagens salvas localmente (quando não há Vercel Blob configurado).
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const rel = path.normalize(parts.join("/"));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return new Response("not found", { status: 404 });
  try {
    const buf = await readFile(path.join(LOCAL_DIR, rel));
    const ext = rel.split(".").pop() ?? "";
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
