import { NextResponse } from "next/server";
import { notifyDueFollowUps } from "@/services/crm";
import { runHunt } from "@/services/crm-hunter";

export const maxDuration = 300;

// CRM dos sócios — roda 3x por dia (vercel.json): busca leads com o Gemini e avisa os retornos do dia.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const followUps = await notifyDueFollowUps().catch((e) => ({ error: String(e) }));
  const hunt = await runHunt("cron").catch((e) => ({ error: String(e) }));
  return NextResponse.json({ followUps, hunt });
}
