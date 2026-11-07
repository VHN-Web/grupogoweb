// Shopping GoWeb: lojas da rede com alguns produtos de cada uma.
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { categoryOf, includeDemos, type NetCat } from "@/core/network";
import { parseGrowth } from "@/core/growth";
import { getTheme } from "@/core/themes";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { tenantPublicUrl } from "@/lib/urls";

export type NetStore = {
  id: string;
  name: string;
  tagline: string | null;
  url: string;
  country: string;
  logoUrl: string | null;
  bannerImageUrl: string | null;
  illustration: string | null;
  color: string;
  heroBg: string;
  heroFg: string;
  font: string;
  fontUrl: string;
  upper: boolean;
  category: NetCat;
  categoryLabel: string | null;
  city: string | null;
  isOpen: boolean;
  demo: boolean;
  products: { id: string; name: string; price: string; promo: string | null; imageUrl: string | null; illustration: string | null }[];
};

export async function networkStores(): Promise<NetStore[]> {
  const all = await db.query.tenants.findMany({ where: eq(schema.tenants.suspended, false) });
  const listed = all.filter((t) => parseGrowth(t.growthConfig).shopping.enabled);
  const real = listed.filter((t) => !t.demo);
  const stores = includeDemos(real.length) ? listed : real;
  if (!stores.length) return [];
  const prods = await db.query.products.findMany({
    where: and(inArray(schema.products.tenantId, stores.map((s) => s.id)), eq(schema.products.active, true)),
    orderBy: asc(schema.products.sortOrder),
  });
  const now = new Date();
  return stores
    .map((t) => {
      const th = getTheme(t.theme);
      const dir = parseGrowth(t.growthConfig).directory;
      const cur = t.currency as Currency;
      const mine = prods.filter((p) => p.tenantId === t.id && (p.imageUrl || p.illustration)).slice(0, 8);
      return {
        id: t.id,
        name: t.name,
        tagline: t.tagline,
        url: `${tenantPublicUrl(t)}${t.customDomain ? "/" : ""}?origem=shopping`,
        country: t.country,
        logoUrl: t.logoUrl,
        bannerImageUrl: t.bannerImageUrl,
        illustration: t.bannerIllustration ?? mine.find((p) => p.illustration)?.illustration ?? null,
        color: t.primaryColor,
        heroBg: th.colors.heroBg,
        heroFg: th.colors.heroFg,
        font: th.fonts.heading,
        fontUrl: th.fonts.google,
        upper: !!th.fonts.headingUpper,
        category: categoryOf(t.theme),
        categoryLabel: dir.category || null,
        city: dir.city || null,
        isOpen: t.isOpen,
        demo: t.demo,
        products: mine.map((p) => {
          const promo = p.promoPricePyg && p.promoEndsAt && p.promoEndsAt > now ? p.promoPricePyg : null;
          return { id: p.id, name: p.name, price: formatMoney(p.pricePyg, cur), promo: promo ? formatMoney(promo, cur) : null, imageUrl: p.imageUrl, illustration: p.illustration };
        }),
      };
    })
    .sort((a, b) => Number(a.demo) - Number(b.demo) || Number(b.isOpen) - Number(a.isOpen) || b.products.length - a.products.length);
}
