import "server-only";
// Cardápio por foto: a IA lê a foto e cadastra categorias + produtos (regras puras em core/menu-import.ts).
import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { menuPrompt, parseMenuJson, type MenuItem } from "@/core/menu-import";
import { getRegion } from "@/core/region";
import type { Currency } from "@/core/types";
import { geminiVision } from "@/adapters/ai/gemini";
import { aiKey, geovanaOf } from "@/services/geovana";

export class MenuImportError extends Error {}
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Lê a foto e devolve os itens (não grava nada). */
export async function readMenuPhoto(t: Tenant, base64: string, mime: string): Promise<MenuItem[]> {
  if (!MIMES.has(mime)) throw new MenuImportError("Envie uma foto (JPG, PNG ou WEBP).");
  if (base64.length > 14_000_000) throw new MenuImportError("Foto grande demais (máx. 10 MB).");
  const { key, model } = await aiKey(geovanaOf(t));
  const pt = getRegion(t.country).locale === "pt";
  const raw = await geminiVision({ key, model, prompt: menuPrompt(pt, t.currency as Currency), imageBase64: base64, mime });
  const items = parseMenuJson(raw, t.currency as Currency, pt ? "Cardápio" : "Menú");
  if (!items.length) throw new MenuImportError(pt ? "Não consegui ler itens com preço nessa foto. Tente uma foto mais nítida, de frente e com boa luz." : "No pude leer ítems con precio. Probá una foto más nítida.");
  return items;
}

/**
 * Grava os itens: reaproveita categorias com o mesmo nome e pula produtos que já existem (mesmo nome na mesma categoria).
 * `hidden` = entram ocultos (lote para a loja conferir e publicar).
 */
export async function importMenu(t: Tenant, items: MenuItem[], opts: { hidden: boolean }) {
  const batch = opts.hidden ? `imp_${randomBytes(6).toString("hex")}` : null;
  return db.transaction(async (tx) => {
    const cats = await tx.query.categories.findMany({ where: eq(schema.categories.tenantId, t.id) });
    const byName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c]));
    let nextCat = cats.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    const existing = await tx.query.products.findMany({ where: eq(schema.products.tenantId, t.id), columns: { name: true, categoryId: true, sortOrder: true } });
    const seen = new Set(existing.map((p) => `${p.categoryId}|${p.name.trim().toLowerCase()}`));
    let nextProd = existing.reduce((m, p) => Math.max(m, p.sortOrder), 0) + 1;
    let created = 0;
    let skipped = 0;
    let newCats = 0;
    for (const it of items.slice(0, 300)) {
      const ck = it.category.trim().toLowerCase();
      let cat = byName.get(ck);
      if (!cat) {
        [cat] = await tx.insert(schema.categories).values({ tenantId: t.id, name: it.category.trim().slice(0, 60), sortOrder: nextCat++ }).returning();
        byName.set(ck, cat);
        newCats++;
      }
      const pk = `${cat.id}|${it.name.trim().toLowerCase()}`;
      if (seen.has(pk)) {
        skipped++;
        continue;
      }
      seen.add(pk);
      await tx.insert(schema.products).values({
        tenantId: t.id,
        categoryId: cat.id,
        name: it.name.slice(0, 120),
        description: it.description || null,
        pricePyg: it.priceMinor,
        active: !opts.hidden,
        sortOrder: nextProd++,
        importBatch: batch,
      });
      created++;
    }
    return { created, skipped, newCats, batch };
  });
}

/** Lotes importados ocultos esperando a loja publicar. */
export async function pendingImports(tenantId: string) {
  const rows = await db
    .select({ batch: schema.products.importBatch, n: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(and(eq(schema.products.tenantId, tenantId), isNotNull(schema.products.importBatch), eq(schema.products.active, false)))
    .groupBy(schema.products.importBatch);
  return rows.filter((r) => r.batch) as { batch: string; n: number }[];
}

export async function publishImport(tenantId: string, batch: string) {
  const r = await db
    .update(schema.products)
    .set({ active: true, importBatch: null })
    .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.importBatch, batch)))
    .returning({ id: schema.products.id });
  return r.length;
}

export async function discardImport(tenantId: string, batch: string) {
  const ids = (await db.query.products.findMany({ where: and(eq(schema.products.tenantId, tenantId), eq(schema.products.importBatch, batch)), columns: { id: true } })).map((p) => p.id);
  if (ids.length) await db.delete(schema.products).where(and(eq(schema.products.tenantId, tenantId), inArray(schema.products.id, ids)));
  return ids.length;
}
