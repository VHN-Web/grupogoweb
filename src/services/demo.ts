// Lojas de demonstração criadas pelo admin (para mostrar a sócios e clientes): cópia de um modelo demo,
// com TUDO liberado (GoInteligence + todos os módulos), contatos fictícios e sem disparos reais (demo = true).
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomPassword } from "@/core/billing";
import { DEFAULT_GROWTH } from "@/core/growth";
import { hashPassword } from "@/lib/password";
import { provisionTenant } from "./provision";

export async function demoTemplates() {
  return db.query.tenants.findMany({
    where: eq(schema.tenants.demo, true),
    columns: { id: true, slug: true, name: true, tagline: true, country: true, theme: true },
  });
}

export async function createDemoStore(input: { templateSlug: string; name: string; slug?: string | null; note?: string | null }) {
  const src = await db.query.tenants.findFirst({ where: and(eq(schema.tenants.slug, input.templateSlug), eq(schema.tenants.demo, true)) });
  if (!src) throw new Error("Modelo não encontrado");
  const password = randomPassword(10);
  const t = await provisionTenant(db, {
    name: input.name,
    slug: input.slug || `${input.name}-demo`,
    password,
    theme: src.theme,
    primaryColor: src.primaryColor,
    tables: 8,
    lat: src.lat,
    lng: src.lng,
    country: src.country,
  });
  const pt = src.country === "BR";
  const fake = pt ? "+5581900000099" : "+595900000099";
  // Tudo ligado em "Crescimento" para a demonstração (link de avaliação de exemplo)
  const growth = {
    ...DEFAULT_GROWTH,
    reviews: { enabled: true, googleUrl: "https://www.google.com/maps" },
    directory: { enabled: false, city: "", category: "" }, // demo nunca aparece na Vitrine
    campaigns: { enabled: true },
    referral: { ...DEFAULT_GROWTH.referral, enabled: true },
    loyalty: { ...DEFAULT_GROWTH.loyalty, enabled: true, stamps: 5 },
    birthday: { ...DEFAULT_GROWTH.birthday, enabled: true },
  };
  await db
    .update(schema.tenants)
    .set({
      demo: true,
      demoNote: (input.note || "Demonstração").slice(0, 120),
      tier: "pro",
      modules: null,
      isOpen: true,
      tagline: src.tagline,
      address: src.address,
      bannerTag: src.bannerTag,
      bannerTitle: src.bannerTitle,
      bannerSubtitle: src.bannerSubtitle,
      bannerHighlight: src.bannerHighlight,
      bannerImageUrl: src.bannerImageUrl,
      bannerIllustration: src.bannerIllustration,
      logoUrl: src.logoUrl,
      acceptsDineIn: src.acceptsDineIn,
      acceptsPickup: src.acceptsPickup,
      acceptsDelivery: src.acceptsDelivery,
      deliveryBaseFeePyg: src.deliveryBaseFeePyg,
      deliveryPerKmPyg: src.deliveryPerKmPyg,
      deliveryMaxKm: src.deliveryMaxKm,
      deliveryFreeOverPyg: src.deliveryFreeOverPyg,
      paymentConfig: src.paymentConfig.replace(/"credentials":\{[^}]*\}/, '"credentials":{}'), // nunca copia tokens
      bookingConfig: src.bookingConfig,
      growthConfig: JSON.stringify(growth),
      phone: fake,
      whatsapp: fake,
      instagram: pt ? "sualoja" : "tutienda",
      reportChannel: "none",
      reportTo: null,
    })
    .where(eq(schema.tenants.id, t.id));

  // Catálogo: categorias e produtos do modelo
  const cats = await db.query.categories.findMany({ where: eq(schema.categories.tenantId, src.id) });
  const catMap = new Map<string, string>();
  for (const c of cats) {
    const [n] = await db.insert(schema.categories).values({ tenantId: t.id, name: c.name, sortOrder: c.sortOrder }).returning();
    catMap.set(c.id, n.id);
  }
  const prods = await db.query.products.findMany({ where: eq(schema.products.tenantId, src.id) });
  if (prods.length) {
    await db.insert(schema.products).values(
      prods.map((p) => ({
        tenantId: t.id,
        categoryId: p.categoryId ? (catMap.get(p.categoryId) ?? null) : null,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        illustration: p.illustration,
        pricePyg: p.pricePyg,
        active: p.active,
        trackStock: p.trackStock,
        stock: p.trackStock ? Math.max(p.stock, 20) : p.stock,
        sortOrder: p.sortOrder,
        promoPricePyg: p.promoPricePyg,
        promoEndsAt: p.promoEndsAt ? new Date(Date.now() + 7 * 864e5) : null,
        durationMin: p.durationMin,
      })),
    );
  }
  // Cupom de boas-vindas e um funcionário de exemplo
  await db.insert(schema.coupons).values({ tenantId: t.id, code: pt ? "BEMVINDO10" : "BIENVENIDO10", kind: "PERCENT", value: 10 }).onConflictDoNothing();
  await db.insert(schema.staff).values({
    tenantId: t.id,
    name: pt ? "Caixa (demo)" : "Caja (demo)",
    username: pt ? "caixa" : "caja",
    passwordHash: hashPassword(password),
    permissions: JSON.stringify(["orders", "cash", "agenda", "couriers"]),
  });
  // Motoboy de exemplo
  await db.insert(schema.couriers).values({ tenantId: t.id, name: pt ? "Motoboy Exemplo" : "Repartidor Ejemplo", phone: pt ? "+5581900000098" : "+595900000098", vehicle: pt ? "Moto · placa ABC1D23" : "Moto · chapa AAA 123" }).onConflictDoNothing();
  return { tenant: t, password };
}
