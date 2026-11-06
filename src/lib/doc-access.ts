import "server-only";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPanelAccess, isPlatformAdmin } from "@/lib/auth";

/** Pode ver o documento: link com a chave certa, admin da plataforma ou o dono do sistema do cliente. */
export async function canSeeDocument(doc: { accessKey: string; customerId: string }, k: string | undefined) {
  if (k && k.length === doc.accessKey.length && timingSafeEqual(Buffer.from(k), Buffer.from(doc.accessKey))) return true;
  if (await isPlatformAdmin()) return true;
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, doc.customerId), with: { tenant: { columns: { slug: true } } } });
  if (c?.tenant) {
    const acc = await getPanelAccess(c.tenant.slug);
    return acc?.role === "owner";
  }
  return false;
}
