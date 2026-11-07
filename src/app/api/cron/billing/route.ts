import { NextResponse } from "next/server";
import { runBillingCycle } from "@/services/billing";
import { purgeOldDocuments } from "@/services/documents";
import { runBirthdays } from "@/services/growth";

// Rodar 1x por dia. Na Vercel: vercel.json -> crons. Protegido por CRON_SECRET
// (a Vercel envia "Authorization: Bearer {CRON_SECRET}" automaticamente).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const billing = await runBillingCycle();
  // retenção: contratos e recibos/notas mais antigos que o prazo configurado (padrão 12 meses)
  const documents = await purgeOldDocuments().catch((e) => ({ error: String(e) }));
  // GoInteligence: cupom de aniversário do dia
  const growth = await runBirthdays().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ...billing, documents, growth });
}
