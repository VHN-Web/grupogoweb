import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CURRENCIES } from "@/core/types";
import { BillingError, startCheckout } from "@/services/billing";
import { detectLocale, tr } from "@/core/region";

const body = z.object({ invoiceId: z.string(), currency: z.enum(CURRENCIES) });

export async function POST(req: Request) {
  const limited = await tooMany(req, "checkout", 20, 600);
  if (limited) return limited;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  try {
    return NextResponse.json(await startCheckout(p.data.invoiceId, p.data.currency));
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[billing checkout]", e);
    return NextResponse.json({ error: tr(detectLocale(req.headers))("No se pudo iniciar el pago. Intentá de nuevo.", "Não foi possível iniciar o pagamento. Tente novamente.") }, { status: 500 });
  }
}
