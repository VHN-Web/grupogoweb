import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CURRENCIES } from "@/core/types";
import { BillingError, startCheckout } from "@/services/billing";
import { detectLocale, tr } from "@/core/region";
import { isValidDoc } from "@/core/asaas";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const body = z.object({ invoiceId: z.string(), currency: z.enum(CURRENCIES), doc: z.string().max(20).optional() });

export async function POST(req: Request) {
  const limited = await tooMany(req, "checkout", 20, 600);
  if (limited) return limited;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  try {
    // CPF/CNPJ informado na página da fatura (Asaas exige): guarda no cadastro do cliente
    if (p.data.doc && isValidDoc(p.data.doc)) {
      const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, p.data.invoiceId), columns: { customerId: true, status: true } });
      if (inv?.status === "OPEN") await db.update(schema.customers).set({ ruc: p.data.doc.replace(/\D/g, "") }).where(eq(schema.customers.id, inv.customerId));
    }
    return NextResponse.json(await startCheckout(p.data.invoiceId, p.data.currency));
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[billing checkout]", e);
    return NextResponse.json({ error: tr(detectLocale(req.headers))("No se pudo iniciar el pago. Intentá de nuevo.", "Não foi possível iniciar o pagamento. Tente novamente.") }, { status: 500 });
  }
}
