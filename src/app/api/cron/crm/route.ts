import { NextResponse } from "next/server";
import { notifyDueFollowUps } from "@/services/crm";
import { runHunt } from "@/services/crm-hunter";
import { runGwFollowUps } from "@/services/goweb-bot";
import { runNudges } from "@/services/nudges";
import { notifyVisitsSummary, pruneInbox } from "@/services/crm-notify";
import { drainOutbox, pruneGuard } from "@/services/wa-guard";
import { igMaintenance } from "@/services/instagram";
import { advisoryDaily, publishDuePosts } from "@/services/advisory";
import { fireDue } from "@/services/crm-planner";

export const maxDuration = 300;

// CRM dos sócios — roda 3x por dia (vercel.json): busca leads com o Gemini e avisa os retornos do dia.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const followUps = await notifyDueFollowUps().catch((e) => ({ error: String(e) }));
  const gwFollowUps = await runGwFollowUps().catch((e) => ({ error: String(e) }));
  const nudges = await runNudges().catch((e) => ({ error: String(e) }));
  // resumo de acessos do dia (só no horário do fim da tarde) + limpeza da central de avisos
  const visits = await notifyVisitsSummary().catch((e) => ({ error: String(e) }));
  await pruneInbox().catch(() => null);
  // proteção da Geovana: envia o que ficou na fila (lembretes do horário comercial, reenvios) e limpa registros antigos
  const waQueue = await drainOutbox(40, 60_000).catch((e) => ({ error: String(e) }));
  await pruneGuard().catch(() => null);
  // Instagram: renova tokens perto de vencer e pausa contas de lojas que saíram do GoInteligence
  const instagram = await igMaintenance().catch((e) => ({ error: String(e) }));
  // Assessoria GoWeb: calendário das próximas semanas, resumo do dia ao lojista, posts aprovados que chegaram na hora
  const advisory = await advisoryDaily().catch((e) => ({ error: String(e) }));
  const advisoryPosts = await publishDuePosts().catch((e) => ({ error: String(e) }));
  const reminders = await fireDue().catch((e) => ({ error: String(e) }));
  const hunt = await runHunt("cron").catch((e) => ({ error: String(e) }));
  return NextResponse.json({ followUps, gwFollowUps, nudges, visits, waQueue, instagram, advisory, advisoryPosts, reminders, hunt });
}
