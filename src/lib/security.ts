import "server-only";
// Segurança: IP do cliente, limite de tentativas, registro de atividades e criptografia de segredos.
import { headers } from "next/headers";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function clientIp(req?: Request): Promise<string> {
  const h = req ? req.headers : await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}

/**
 * Limite de tentativas por chave (janela fixa, guardado no banco — funciona em serverless).
 * Retorna true se ainda pode; false se estourou.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = new Date();
  const reset = new Date(now.getTime() + windowSec * 1000);
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, resetAt: reset })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimits.resetAt} < ${now} THEN 1 ELSE ${schema.rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${schema.rateLimits.resetAt} < ${now} THEN ${reset} ELSE ${schema.rateLimits.resetAt} END`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return (row?.count ?? 1) <= limit;
}

/** Consulta sem incrementar (ex.: bloquear login após X falhas). */
export async function isLimited(key: string, limit: number): Promise<boolean> {
  const row = await db.query.rateLimits.findFirst({ where: eq(schema.rateLimits.key, key) });
  return !!row && row.resetAt > new Date() && row.count >= limit;
}

export async function clearLimit(key: string) {
  await db.delete(schema.rateLimits).where(eq(schema.rateLimits.key, key));
}

/** Registro de atividades sensíveis (quem fez o quê, quando, de onde). Nunca derruba a ação. */
export async function audit(tenantId: string | null, actor: string, action: string, detail?: string | null) {
  try {
    const ip = await clientIp().catch(() => null);
    await db.insert(schema.auditLogs).values({ tenantId, actor: actor.slice(0, 60), action, detail: detail?.slice(0, 300) ?? null, ip });
  } catch (e) {
    console.error("[audit]", e);
  }
}

export async function recentAudit(tenantId: string, limit = 50) {
  return db.query.auditLogs.findMany({ where: eq(schema.auditLogs.tenantId, tenantId), orderBy: desc(schema.auditLogs.createdAt), limit });
}

export { openCredentials, openSecret, sealCredentials, sealSecret } from "./secrets";

/** Confere a assinatura de arquivos de imagem (não confia no tipo informado pelo navegador). */
export function sniffImage(buf: Buffer): "jpg" | "png" | "webp" | "gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a") return "gif";
  return null;
}

/** Para rotas de API públicas: devolve uma resposta 429 se o IP estourou o limite. */
export async function tooMany(req: Request, name: string, limit: number, windowSec: number): Promise<Response | null> {
  const ip = await clientIp(req);
  if (await rateLimit(`${name}:${ip}`, limit, windowSec)) return null;
  return Response.json({ error: "Muitas tentativas. Aguarde um pouco e tente de novo.", code: "RATE_LIMIT" }, { status: 429, headers: { "Retry-After": String(windowSec) } });
}
