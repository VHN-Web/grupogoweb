// Provisionamento white-label: cria um novo estabelecimento (tenant) já pronto para uso.
// Não importa "@/db" diretamente para poder ser usado também pelo seed (CLI).
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as schema from "@/db/schema";
import { randomTableCode, slugify } from "@/core/codes";
import { DEFAULT_PAYMENT_CONFIG } from "@/core/tenant-config";
import { hashPassword } from "@/lib/password";
import { getTheme } from "@/core/themes";
import { getRegion } from "@/core/region";

export type ProvisionInput = {
  name: string;
  slug?: string;
  password: string;
  primaryColor?: string;
  logoUrl?: string | null;
  tables?: number;
  theme?: string;
  lat?: number | null;
  lng?: number | null;
  /** País (PY/BR): define moeda base, idioma, cotações, delivery e meios de pagamento padrão */
  country?: string;
};

export const RESERVED_SLUGS = new Set(["painel", "admin", "api", "pay", "_next", "static", "login", "registro", "contratar", "fatura", "uploads", "vitrine", "contrato", "recibo", "sitemap.xml", "robots.txt"]);

export async function provisionTenant(db: DB, input: ProvisionInput) {
  const slug = slugify(input.slug || input.name);
  if (!slug || RESERVED_SLUGS.has(slug)) throw new Error("Slug inválido");
  const exists = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true } });
  if (exists) throw new Error("Esse slug já está em uso");

  const region = getRegion(input.country);
  const tableWord = region.locale === "pt" ? "Mesa" : "Mesa";
  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        slug,
        name: input.name,
        theme: getTheme(input.theme).id,
        primaryColor: input.primaryColor ?? getTheme(input.theme).accent,
        logoUrl: input.logoUrl ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        country: region.country,
        currency: region.currency,
        rateUsd: region.defaultRates.USD,
        rateBrl: region.defaultRates.BRL,
        ratePyg: region.defaultRates.PYG,
        deliveryBaseFeePyg: region.delivery.baseFee,
        deliveryPerKmPyg: region.delivery.perKm,
        deliveryFreeOverPyg: region.delivery.freeOver,
        paymentConfig: JSON.stringify({ ...DEFAULT_PAYMENT_CONFIG, options: region.payments }),
        adminPasswordHash: hashPassword(input.password),
      })
      .returning();

    const n = input.tables ?? 10;
    if (n > 0) {
      await tx.insert(schema.diningTables).values(
        Array.from({ length: n }, (_, i) => ({ tenantId: tenant.id, label: `${tableWord} ${i + 1}`, code: randomTableCode() })),
      );
    }
    return tenant;
  });
}
