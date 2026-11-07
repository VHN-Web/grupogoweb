// Vitrine da cidade + sitemap: lojas reais, ativas e que optaram por aparecer.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { citySlug, parseGrowth } from "@/core/growth";

export async function publicStores() {
  return db.query.tenants.findMany({
    where: and(eq(schema.tenants.demo, false), eq(schema.tenants.suspended, false)),
    columns: { id: true, slug: true, name: true, tagline: true, logoUrl: true, primaryColor: true, customDomain: true, country: true, growthConfig: true, createdAt: true },
  });
}

export async function directoryStores() {
  return (await publicStores())
    .map((t) => ({ ...t, dir: parseGrowth(t.growthConfig).directory }))
    .filter((t) => t.dir.enabled && t.dir.city)
    .map((t) => ({ ...t, city: t.dir.city, citySlug: citySlug(t.dir.city), category: t.dir.category }));
}
