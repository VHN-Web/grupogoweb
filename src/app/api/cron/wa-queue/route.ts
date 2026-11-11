// Fila de envio da Geovana (proteção do WhatsApp). A Vercel Hobby só tem cron diário, então a fila também anda
// nos webhooks e no cron do CRM. Para ela andar a cada poucos minutos, aponte um agendador gratuito externo
// (ex.: cron-job.org) para GET /api/cron/wa-queue com o header Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from "next/server";
import { drainOutbox } from "@/services/wa-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await drainOutbox(40, 45_000);
  return NextResponse.json(r);
}
