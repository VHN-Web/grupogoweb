import { NextResponse } from "next/server";
import { z } from "zod";
import { CURRENCIES } from "@/core/types";
import { BillingError, startCheckout } from "@/services/billing";

const body = z.object({ invoiceId: z.string(), currency: z.enum(CURRENCIES) });

export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    return NextResponse.json(await startCheckout(p.data.invoiceId, p.data.currency));
  } catch (e) {
    if (e instanceof BillingError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[billing checkout]", e);
    return NextResponse.json({ error: "No se pudo iniciar el pago. Intentá con otra moneda." }, { status: 500 });
  }
}
