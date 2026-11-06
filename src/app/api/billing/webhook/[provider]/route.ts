import { NextResponse } from "next/server";
import { getBillingProvider } from "@/adapters/billing/registry";
import { markInvoicePaid } from "@/services/billing";

// Webhook dos gateways que cobram os SEUS clientes: /api/billing/webhook/{mercadopago|paypal|pagopar|mock}
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = getBillingProvider(id);
  if (!provider?.handleWebhook) return NextResponse.json({ error: "provider" }, { status: 404 });
  try {
    const r = await provider.handleWebhook(req);
    if (r?.status === "PAID") {
      await markInvoicePaid(r.invoiceId, { provider: id, providerRef: r.providerRef, currency: r.currency, amountMinor: r.amountMinor });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[billing webhook ${id}]`, e);
    return NextResponse.json({ error: "erro" }, { status: 400 });
  }
}
