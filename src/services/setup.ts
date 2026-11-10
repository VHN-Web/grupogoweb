import "server-only";
// Passo a passo de configuração da loja (regras em core/setup.ts).
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { setupSteps, type SetupStep } from "@/core/setup";
import { parsePaymentConfig } from "@/core/tenant-config";

export async function storeSetup(t: Tenant): Promise<SetupStep[]> {
  const [productCount, orderCount] = await Promise.all([
    db.$count(schema.products, eq(schema.products.tenantId, t.id)),
    db.$count(schema.orders, eq(schema.orders.tenantId, t.id)),
  ]);
  const pay = parsePaymentConfig(t.paymentConfig);
  return setupSteps({
    slug: t.slug,
    logoUrl: t.logoUrl,
    productCount,
    address: t.address,
    lat: t.lat,
    whatsapp: t.whatsapp,
    acceptsDelivery: t.acceptsDelivery,
    deliveryMaxKm: t.deliveryMaxKm,
    hasOnlinePayment: !!pay.pixKey || !!pay.credentials.mercadopago?.accessToken || !!pay.credentials.asaas?.enabled,
    orderCount,
  });
}
