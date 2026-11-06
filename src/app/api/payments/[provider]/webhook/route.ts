import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPaymentProvider } from "@/adapters/payments/registry";
import { parsePaymentConfig } from "@/core/tenant-config";
import { setPaymentStatus } from "@/services/orders";
import { audit, openCredentials } from "@/lib/security";

// Webhook genérico: /api/payments/{providerId}/webhook?t={tenantSlug}
// Cada adapter valida a assinatura e traduz o payload do gateway para WebhookResult.
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const slug = new URL(req.url).searchParams.get("t");
  if (!slug) return NextResponse.json({ error: "tenant ausente" }, { status: 400 });

  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) return NextResponse.json({ error: "tenant" }, { status: 404 });

  let provider;
  try {
    provider = getPaymentProvider(providerId);
  } catch {
    return NextResponse.json({ error: "provider" }, { status: 404 });
  }
  if (!provider.handleWebhook) return NextResponse.json({ error: "sem webhook" }, { status: 400 });
  // Pagamento simulado só vale em lojas de demonstração (nunca numa loja real)
  if (provider.id === "mock_online" && !tenant.demo) return NextResponse.json({ error: "provider" }, { status: 403 });

  try {
    const creds = openCredentials(parsePaymentConfig(tenant.paymentConfig).credentials[provider.id]);
    const result = await provider.handleWebhook(req, creds);
    if (!result) return NextResponse.json({ ok: true });
    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, result.orderId) });
    if (!order || order.tenantId !== tenant.id || order.paymentProvider !== provider.id) {
      return NextResponse.json({ error: "pedido" }, { status: 404 });
    }
    // confere o valor pago (quando o gateway informa)
    if (result.status === "PAID" && result.amountMinor != null && result.amountMinor < order.payAmountMinor) {
      console.error(`[webhook ${providerId}] valor pago menor que o pedido`, order.id);
      await audit(tenant.id, `gateway:${providerId}`, "order.amount_mismatch", `#${order.number} pago ${result.amountMinor} < ${order.payAmountMinor}`);
      return NextResponse.json({ error: "valor" }, { status: 400 });
    }
    // idempotente: não volta um pedido pago para pendente
    if (order.paymentStatus !== "PAID" || result.status === "REFUNDED") {
      await setPaymentStatus(tenant.id, order.id, result.status, result.providerRef);
      await audit(tenant.id, `gateway:${providerId}`, `order.${result.status.toLowerCase()}`, `#${order.number}`);
    }
    return NextResponse.json(result.responseBody ?? { ok: true });
  } catch (e) {
    console.error(`[webhook ${providerId}]`, e);
    return NextResponse.json({ error: "erro" }, { status: 500 });
  }
}
