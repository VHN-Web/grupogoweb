import { NextResponse } from "next/server";
import { getBillingProvider } from "@/adapters/billing/registry";
import { markInvoicePaid } from "@/services/billing";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { amountIn } from "@/core/billing";
import { audit } from "@/lib/security";

// Webhook dos gateways que cobram os SEUS clientes: /api/billing/webhook/{mercadopago|paypal|pagopar|mock}
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = getBillingProvider(id);
  if (!provider?.handleWebhook || !provider.isConfigured()) return NextResponse.json({ error: "provider" }, { status: 404 });
  try {
    const r = await provider.handleWebhook(req);
    if (r?.status === "PAID") {
      // Confere moeda e valor pagos contra a fatura — nunca aceita pagamento menor
      const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, r.invoiceId) });
      if (!inv) return NextResponse.json({ error: "fatura" }, { status: 404 });
      const due = r.currency ? amountIn(inv, r.currency) : 0;
      if (!r.currency || r.amountMinor == null || due <= 0 || r.amountMinor < due) {
        console.error(`[billing webhook ${id}] valor/moeda divergente`, inv.id, r.currency, r.amountMinor, due);
        await audit(null, "sistema", "invoice.amount_mismatch", `${inv.id} ${r.currency} ${r.amountMinor} < ${due}`);
        return NextResponse.json({ error: "valor" }, { status: 400 });
      }
      await audit(null, `gateway:${id}`, "invoice.paid", `${inv.id} ${r.currency} ${r.amountMinor}`);
      await markInvoicePaid(r.invoiceId, { provider: id, providerRef: r.providerRef, currency: r.currency, amountMinor: r.amountMinor });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[billing webhook ${id}]`, e);
    return NextResponse.json({ error: "erro" }, { status: 400 });
  }
}
