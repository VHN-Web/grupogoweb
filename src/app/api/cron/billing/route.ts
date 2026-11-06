import { NextResponse } from "next/server";
import { runBillingCycle } from "@/services/billing";

// Rodar 1x por dia. Na Vercel: vercel.json -> crons. Protegido por CRON_SECRET
// (a Vercel envia "Authorization: Bearer {CRON_SECRET}" automaticamente).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runBillingCycle());
}
