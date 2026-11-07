import type { MetadataRoute } from "next";
import { appUrl, tenantPublicUrl } from "@/lib/urls";
import { directoryStores, publicStores } from "@/services/directory";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const [stores, dir] = await Promise.all([publicStores().catch(() => []), directoryStores().catch(() => [])]);
  const cities = [...new Set(dir.map((d) => d.citySlug))];
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/vitrine`, changeFrequency: "daily", priority: 0.7 },
    ...cities.map((c) => ({ url: `${base}/vitrine/${c}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...stores.map((s) => ({ url: tenantPublicUrl(s), changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
