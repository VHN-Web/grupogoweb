import { notFound } from "next/navigation";
import { featureOn } from "@/core/growth";
import { hasModule } from "@/core/modules";
import { growthOf, referralBanner } from "@/services/growth";
import { effectivePrice, parseBookingConfig, promoActive } from "@/core/intelligence";
import { tenantSuggestions } from "@/services/intelligence";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parsePaymentConfig, publicPaymentConfig } from "@/core/tenant-config";
import { getPaymentProvider } from "@/adapters/payments/registry";
import { Storefront, type StoreData } from "@/components/storefront/Storefront";
import { getTheme, readableOn } from "@/core/themes";
import { getRegion, tenantRates } from "@/core/region";
import type { Currency } from "@/core/types";
import { appUrl, tenantPublicUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await load((await params).slug);
  if (!t) return { title: "GoWeb" };
  const pt = getRegion(t.country).locale === "pt";
  const g = growthOf(t).cfg;
  const city = g.directory.city || "";
  const title = t.tagline ? `${t.name} — ${t.tagline}` : t.name;
  const description = pt
    ? `Peça online na ${t.name}${city ? ` em ${city}` : ""}${t.tagline ? ` · ${t.tagline}` : ""}. Cardápio completo, delivery e retirada.`
    : `Pedí online en ${t.name}${city ? ` en ${city}` : ""}${t.tagline ? ` · ${t.tagline}` : ""}. Menú completo, delivery y retiro.`;
  const url = tenantPublicUrl(t);
  const image = t.logoUrl ? (t.logoUrl.startsWith("/") ? `${appUrl()}${t.logoUrl}` : t.logoUrl) : `${appUrl()}/api/kit/${t.slug}?formato=post`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: t.demo || t.suspended ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url, siteName: t.name, type: "website", locale: pt ? "pt_BR" : "es_PY", images: [{ url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function StorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mesa?: string; indicacao?: string; ref?: string }>;
}) {
  const { slug } = await params;
  const { mesa, indicacao, ref } = await searchParams;
  const tenant = await load(slug);
  if (!tenant) notFound();
  if (tenant.suspended) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-xl font-bold">{tenant.name}</p>
        <p className="text-sm text-muted">{getRegion(tenant.country).locale === "pt" ? "O cardápio não está disponível no momento." : "El menú no está disponible en este momento."}</p>
      </main>
    );
  }

  const region0 = getRegion(tenant.country);
  const [cats, prods] = await Promise.all([
    db.query.categories.findMany({ where: eq(schema.categories.tenantId, tenant.id), orderBy: asc(schema.categories.sortOrder) }),
    db.query.products.findMany({
      where: and(eq(schema.products.tenantId, tenant.id), eq(schema.products.active, true)),
      orderBy: [asc(schema.products.sortOrder), asc(schema.products.name)],
    }),
  ]);

  const table = mesa
    ? await db.query.diningTables.findFirst({
        where: and(
          eq(schema.diningTables.tenantId, tenant.id),
          eq(schema.diningTables.code, mesa.toUpperCase()),
          eq(schema.diningTables.active, true),
        ),
      })
    : undefined;

  const payCfg = publicPaymentConfig(parsePaymentConfig(tenant.paymentConfig));
  // só mostra opções cujo adapter está disponível
  payCfg.options = payCfg.options.filter((o) => {
    try {
      if (o.provider === "mock_online" && !tenant.demo) return false; // simulado só em loja demo
      return getPaymentProvider(o.provider).available;
    } catch {
      return false;
    }
  });

  const groups = [
    ...cats.map((c) => ({ id: c.id, name: c.name, products: prods.filter((p) => p.categoryId === c.id) })),
    { id: "_other", name: region0.locale === "pt" ? "Outros" : "Otros", products: prods.filter((p) => !p.categoryId || !cats.some((c) => c.id === p.categoryId)) },
  ].filter((g) => g.products.length > 0);

  const theme = getTheme(tenant.theme);
  const region = getRegion(tenant.country);
  const growth = growthOf(tenant);
  const pro = tenant.tier === "pro";
  const mkt = pro && hasModule(tenant, "marketing"); // ofertas relâmpago e sugestões
  const agendaOn = pro && hasModule(tenant, "agenda");
  const booking = parseBookingConfig(tenant.bookingConfig);
  const suggestions = mkt
    ? await tenantSuggestions(
        tenant.id,
        prods.map((p) => ({ id: p.id, categoryId: p.categoryId, available: !(p.trackStock && p.stock <= 0), service: !!p.durationMin })),
      )
    : {};
  const data: StoreData = {
    slug: tenant.slug,
    locale: region.locale,
    currency: tenant.currency as Currency,
    country: tenant.country,
    name: tenant.name,
    logoUrl: tenant.logoUrl,
    primaryColor: tenant.primaryColor,
    accentFg: readableOn(tenant.primaryColor),
    themeId: theme.id,
    tagline: tenant.tagline,
    banner: {
      tag: tenant.bannerTag,
      title: tenant.bannerTitle,
      subtitle: tenant.bannerSubtitle,
      highlight: tenant.bannerHighlight,
      imageUrl: tenant.bannerImageUrl,
      illustration: tenant.bannerIllustration,
    },
    address: tenant.address,
    phone: tenant.phone,
    social: { whatsapp: tenant.whatsapp, instagram: tenant.instagram },
    demo: tenant.demo,
    pro,
    growth: {
      referralPct: featureOn(growth.cfg, "referral", growth.pro) ? growth.cfg.referral.friendPct : null,
      referral: await referralBanner(tenant, indicacao ?? ref ?? null),
      birthday: featureOn(growth.cfg, "birthday", growth.pro),
      // pede autorização para ofertas quando a loja usa campanhas ou aniversário
      consent: featureOn(growth.cfg, "campaigns", growth.pro) || featureOn(growth.cfg, "birthday", growth.pro),
      // WhatsApp também na mesa, quando há fidelidade/indicação (para acumular e receber recompensas)
      phoneOnTable: featureOn(growth.cfg, "loyalty", growth.pro) || featureOn(growth.cfg, "referral", growth.pro),
    },
    suggestions,
    booking: agendaOn && booking.enabled ? { daysAhead: booking.daysAhead } : null,
    isOpen: tenant.isOpen,
    accepts: { DINE_IN: tenant.acceptsDineIn && hasModule(tenant, "mesas"), PICKUP: tenant.acceptsPickup, DELIVERY: tenant.acceptsDelivery && hasModule(tenant, "delivery") },
    rates: tenantRates(tenant),
    delivery: { freeOverPyg: tenant.deliveryFreeOverPyg },
    table: table ? { code: table.code, label: table.label } : null,
    invalidTable: Boolean(mesa && !table),
    payment: payCfg,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      products: g.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        illustration: p.illustration,
        pricePyg: mkt ? effectivePrice(p) : p.pricePyg,
        regularPricePyg: mkt && promoActive(p) ? p.pricePyg : null,
        promoEndsAt: mkt && promoActive(p) ? p.promoEndsAt!.toISOString() : null,
        durationMin: agendaOn && booking.enabled ? p.durationMin : null,
        soldOut: p.trackStock && p.stock <= 0,
        maxQty: p.trackStock ? p.stock : 99,
      })),
    })),
  };

  return (
    <>
      {/* Fontes do tema (carregadas no navegador do cliente) */}
      <link rel="stylesheet" href={theme.fonts.google} precedence="default" />
      {/* SEO local: dados estruturados para o Google entender o negócio */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Restaurant",
            name: tenant.name,
            description: tenant.tagline ?? undefined,
            url: tenantPublicUrl(tenant),
            image: tenant.logoUrl ? (tenant.logoUrl.startsWith("/") ? `${appUrl()}${tenant.logoUrl}` : tenant.logoUrl) : undefined,
            telephone: tenant.demo ? undefined : (tenant.whatsapp ?? tenant.phone ?? undefined),
            address: tenant.address ? { "@type": "PostalAddress", streetAddress: tenant.address, addressLocality: growth.cfg.directory.city || undefined, addressCountry: tenant.country } : undefined,
            sameAs: tenant.instagram && !tenant.demo ? [`https://instagram.com/${tenant.instagram}`] : undefined,
            hasMenu: tenantPublicUrl(tenant),
            servesCuisine: tenant.tagline ?? undefined,
          }).replace(/</g, "\\u003c"),
        }}
      />
      <Storefront data={data} />
    </>
  );
}
