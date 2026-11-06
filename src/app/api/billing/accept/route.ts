import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptInvoice } from "@/services/documents";
import { clientIp, tooMany } from "@/lib/security";

// Registra que o cliente contratante leu o resumo de valores/serviços e o contrato antes de pagar.
export async function POST(req: Request) {
  const limited = await tooMany(req, "accept", 20, 600);
  if (limited) return limited;
  const p = z.object({ invoiceId: z.string().max(60), agree: z.literal(true) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Confirme que está ciente e de acordo." }, { status: 400 });
  const ok = await acceptInvoice(p.data.invoiceId, await clientIp(req), req.headers.get("user-agent"));
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Fatura não encontrada ou já paga." }, { status: 404 });
}
