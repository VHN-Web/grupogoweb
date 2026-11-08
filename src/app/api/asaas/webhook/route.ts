// Webhook único do Asaas: conta principal (implantação/residual) e subcontas dos lojistas (vendas).
// Autenticação: header asaas-access-token = token gerado ao conectar a conta (Admin → Configurações).
import { NextResponse } from "next/server";
import { asaasConfig, checkWebhookToken, handleAsaasEvent } from "@/services/asaas";
import { markInvoicePaid } from "@/services/billing";
import { setPaymentStatus } from "@/services/orders";
import { audit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = await asaasConfig();
  if (!checkWebhookToken(req.headers.get("asaas-access-token"), cfg.webhookToken)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });
  try {
    const r = await handleAsaasEvent(body, {
      markInvoicePaid: (id, info) => markInvoicePaid(id, info),
      setPaymentStatus: async (tenantId, orderId, status, ref) => {
        await setPaymentStatus(tenantId, orderId, status, ref);
        await audit(tenantId, "gateway:asaas", `order.${status.toLowerCase()}`, orderId);
      },
    });
    return NextResponse.json({ ok: true, r });
  } catch (e) {
    console.error("[asaas webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "erro" }, { status: 500 });
  }
}
