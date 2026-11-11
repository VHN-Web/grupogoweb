// Fila de envio da Geovana (proteção do WhatsApp). A Vercel Hobby só tem cron diário, então a fila também anda
// nos webhooks e no cron do CRM. Para ela andar a cada poucos minutos, aponte um agendador gratuito externo
// (ex.: cron-job.org) para GET /api/cron/wa-queue com o header Authorization: Bearer <CRON_SECRET>.
// O mesmo disparador publica os posts da Assessoria GoWeb na hora marcada.
import { NextResponse } from "next/server";
import { drainOutbox } from "@/services/wa-guard";
import { publishDuePosts } from "@/services/advisory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await drainOutbox(40, 45_000);
  // Assessoria GoWeb: posts aprovados no horário marcado (publicação automática, se liberada no Admin)
  const posts = await publishDuePosts().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ...r, posts });
}
