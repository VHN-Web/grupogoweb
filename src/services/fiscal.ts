import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseFiscalConfig } from "@/core/tenant-config";
import { getFiscalProvider } from "@/adapters/fiscal/providers";
import { ivaIncluded } from "@/adapters/fiscal/FiscalProvider";

/** Gera o registro fiscal da venda via adapter configurado (manual ou SIFEN). */
export async function issueFiscalForOrder(tenantId: string, orderId: string, customer?: { ruc?: string; name?: string }) {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  const order = await db.query.orders.findFirst({
    where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)),
    with: { items: true },
  });
  if (!tenant || !order) throw new Error("Pedido não encontrado");

  const existing = await db.query.fiscalDocuments.findFirst({
    where: and(eq(schema.fiscalDocuments.orderId, orderId), eq(schema.fiscalDocuments.direction, "ISSUED")),
  });
  if (existing) return existing;

  const config = parseFiscalConfig(tenant.fiscalConfig);
  const provider = getFiscalProvider(config.provider);
  const res = await provider.issue({
    tenant: { id: tenant.id, name: tenant.name, ruc: tenant.ruc },
    config,
    order: { id: order.id, number: order.number, totalPyg: order.totalPyg, items: order.items },
    customer: { ruc: customer?.ruc ?? null, name: customer?.name ?? order.customerName },
  });

  const [doc] = await db
    .insert(schema.fiscalDocuments)
    .values({
      tenantId,
      orderId,
      direction: "ISSUED",
      provider: provider.id,
      status: res.status,
      docNumber: res.docNumber ?? null,
      timbrado: res.timbrado ?? config.timbrado ?? null,
      cdc: res.cdc ?? null,
      partyRuc: customer?.ruc ?? null,
      partyName: customer?.name ?? order.customerName,
      totalPyg: order.totalPyg,
      // Simplificação: tudo gravado a IVA 10%. TODO: taxa por produto (10/5/exento).
      iva10Pyg: ivaIncluded(order.totalPyg, 10),
    })
    .returning();
  return doc;
}

export async function maybeAutoIssueFiscal(tenantId: string, orderId: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId), columns: { fiscalConfig: true } });
  if (!tenant) return;
  const cfg = parseFiscalConfig(tenant.fiscalConfig);
  if (!cfg.autoIssue) return;
  try {
    await issueFiscalForOrder(tenantId, orderId);
  } catch (e) {
    console.error("[fiscal] auto-issue falhou", e);
  }
}
