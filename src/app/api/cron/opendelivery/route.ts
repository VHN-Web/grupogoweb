import { NextResponse } from "next/server";
import { pollAll } from "@/services/opendelivery";

export const maxDuration = 300;

// Apps de delivery (Open Delivery): busca eventos de todas as lojas — rede de segurança caso algum webhook se perca.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await pollAll().catch((e) => ({ error: String(e) })));
}
