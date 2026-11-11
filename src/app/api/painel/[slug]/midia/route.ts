// URL de envio assinada para o vídeo do produto: o navegador manda o arquivo direto ao Blob (até 15 MB).
// Sessão do painel (área Produtos), produto da própria loja, pasta do produto, 1 vídeo por produto e cota global
// conferidos AQUI, antes de assinar. O registro na galeria é feito depois por addVideoAction (confere no Blob).
import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import type { HandleUploadPresignedBody } from "@vercel/blob/client";
import { db, schema } from "@/db";
import { getPanelAccess } from "@/lib/auth";
import { tooMany } from "@/lib/security";
import { isSandbox } from "@/lib/sandbox";
import { UploadError, videoUploadResponse } from "@/adapters/storage";
import { VIDEO_MAX_BYTES, validVideoPath, videoQuotaBytes } from "@/core/media";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const limited = await tooMany(req, "media-upload", 30, 600);
  if (limited) return limited;
  const { slug } = await params;
  const acc = await getPanelAccess(slug);
  if (!acc || !acc.areas.has("products")) return NextResponse.json({ error: "Sem permissão" }, { status: 401 });
  const t = acc.tenant;
  const pt = t.country !== "PY";
  if (isSandbox()) return NextResponse.json({ error: pt ? "Ambiente de teste: envio de vídeo desligado." : "Ambiente de prueba: envío de video apagado." }, { status: 400 });
  let body: HandleUploadPresignedBody;
  try {
    body = (await req.json()) as HandleUploadPresignedBody;
  } catch {
    return NextResponse.json({ error: "json" }, { status: 400 });
  }
  try {
    const json = await videoUploadResponse(req, body, async (pathname) => {
      const productId = pathname.split("/")[3] ?? "";
      if (!validVideoPath(pathname, t.id, productId)) throw new Error(pt ? "Arquivo inválido." : "Archivo inválido.");
      const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, productId), eq(schema.products.tenantId, t.id)), columns: { id: true } });
      if (!p) throw new Error(pt ? "Produto não encontrado." : "Producto no encontrado.");
      const [has] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.productMedia).where(and(eq(schema.productMedia.productId, productId), eq(schema.productMedia.tenantId, t.id), eq(schema.productMedia.kind, "video")));
      if (Number(has?.n ?? 0) > 0) throw new Error(pt ? "Cada produto pode ter 1 vídeo. Remova o atual para trocar." : "Cada producto puede tener 1 video. Quitá el actual para cambiarlo.");
      const [tot] = await db.select({ b: sql<number>`coalesce(sum(${schema.productMedia.sizeBytes}), 0)::bigint` }).from(schema.productMedia).where(eq(schema.productMedia.kind, "video"));
      if (Number(tot?.b ?? 0) + VIDEO_MAX_BYTES > videoQuotaBytes(process.env.MEDIA_VIDEO_QUOTA_MB)) throw new Error(pt ? "O espaço de vídeos da plataforma está cheio. Avise o suporte GoWeb." : "Se alcanzó el espacio de videos de la plataforma. Avisá al soporte GoWeb.");
    });
    return NextResponse.json(json);
  } catch (e) {
    const msg = e instanceof UploadError ? e.text(pt ? "pt" : "es") : e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
