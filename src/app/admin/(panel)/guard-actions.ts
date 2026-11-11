"use server";
// Admin → Geovana → Proteção: limites, pausa, emergência e fila (services/wa-guard.ts).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminActor, requirePlatformAdmin, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { DEFAULT_WA_GUARD, parseWaGuard, type Limits, type WaGuardConfig } from "@/core/wa-guard";
import { drainOutbox, guardConfig, resumeChannel, saveGuardConfig, setEmergency, setPaused } from "@/services/wa-guard";

const PAGE = "/admin/geovana/protecao";
const back = (msg: string, kind: "ok" | "err" = "ok"): never => redirect(`${PAGE}?${kind}=${encodeURIComponent(msg)}`);
const validChannel = (c: string) => c === "*" || c === "goweb" || /^store:[\w-]{8,64}$/.test(c);

export async function pauseChannelAction(channel: string, paused: boolean) {
  await requirePlatformAdmin();
  if (!validChannel(channel)) back("Número inválido.", "err");
  const by = await adminActor();
  await setPaused(channel, paused, by);
  await audit(channel.startsWith("store:") ? channel.slice(6) : null, by, paused ? "geovana.guard.pause" : "geovana.guard.unpause", channel);
  revalidatePath(PAGE);
  back(paused ? "Envios pausados. As mensagens ficam na fila até retomar." : "Envios retomados.");
}

export async function resumeChannelAction(channel: string) {
  await requirePlatformAdmin();
  if (!validChannel(channel) || channel === "*") back("Número inválido.", "err");
  const by = await adminActor();
  await resumeChannel(channel, by);
  await audit(channel.startsWith("store:") ? channel.slice(6) : null, by, "geovana.guard.resume", channel);
  revalidatePath(PAGE);
  back("Proteção liberada para este número. Se a Meta tiver imposto restrição, respeite o prazo dela antes de voltar a enviar.");
}

export async function emergencyAction(on: boolean) {
  await requirePlatformAdmin();
  const by = await adminActor();
  await setEmergency(on, by);
  if (!on) await setPaused("*", false, by);
  await audit(null, by, on ? "geovana.guard.emergency" : "geovana.guard.emergency_off", "");
  revalidatePath(PAGE);
  back(on ? "EMERGÊNCIA: a Geovana parou de enviar e de usar a IA em todos os números." : "Emergência desligada. Envios e IA voltaram.");
}

export async function drainNowAction() {
  await requirePlatformAdmin();
  const r = await drainOutbox(40, 45_000);
  revalidatePath(PAGE);
  back(`Fila: ${r.sent} enviadas, ${r.queued} reagendadas, ${r.blocked} barradas, ${r.expired} expiradas.`);
}

/** Cancela o que está esperando na fila de um número (ex.: depois de uma restrição, para não despejar tudo de uma vez). */
export async function clearQueueAction(channel: string) {
  await requirePlatformAdmin();
  if (!validChannel(channel) || channel === "*") back("Número inválido.", "err");
  const r = await db
    .update(schema.waOutbox)
    .set({ status: "cancelled", lastError: "cancelada pelo admin" })
    .where(and(eq(schema.waOutbox.channel, channel), inArray(schema.waOutbox.status, ["pending", "failed"])))
    .returning({ id: schema.waOutbox.id });
  await audit(null, await adminActor(), "geovana.guard.clear_queue", `${channel} (${r.length})`);
  revalidatePath(PAGE);
  back(`${r.length} mensagem(ns) cancelada(s) na fila.`);
}

// ---------------------------------------------------------------- limites (só o dono da plataforma)
const n = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").replace(",", ".").trim();
  return v === "" ? undefined : Number(v);
};

function limitsFrom(f: FormData, p: "goweb" | "store", d: Limits): Limits {
  const keys = Object.keys(d) as (keyof Limits)[];
  return Object.fromEntries(keys.map((k) => [k, n(f, `${p}.${k}`) ?? d[k]])) as Limits;
}

export async function saveGuardAction(f: FormData) {
  await requirePlatformOwner();
  if (f.get("reset") === "1") {
    await saveGuardConfig(DEFAULT_WA_GUARD);
    await audit(null, await adminActor(), "geovana.guard.reset", "");
    revalidatePath(PAGE);
    back("Limites voltaram ao padrão recomendado.");
  }
  const cur = await guardConfig(true);
  const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => f.get(`window.day${d}`) === "on");
  const next: WaGuardConfig = {
    goweb: limitsFrom(f, "goweb", cur.goweb),
    store: limitsFrom(f, "store", cur.store),
    global: { perMinute: n(f, "global.perMinute") ?? cur.global.perMinute, perHour: n(f, "global.perHour") ?? cur.global.perHour, perDay: n(f, "global.perDay") ?? cur.global.perDay },
    window: { from: String(f.get("window.from") ?? cur.window.from), to: String(f.get("window.to") ?? cur.window.to), days: days.length ? days : cur.window.days },
    retry: { maxAttempts: n(f, "retry.maxAttempts") ?? cur.retry.maxAttempts, baseSec: n(f, "retry.baseSec") ?? cur.retry.baseSec, maxSec: n(f, "retry.maxSec") ?? cur.retry.maxSec },
    breaker: {
      failStreak: n(f, "breaker.failStreak") ?? cur.breaker.failStreak,
      openMin: n(f, "breaker.openMin") ?? cur.breaker.openMin,
      maxOpenMin: n(f, "breaker.maxOpenMin") ?? cur.breaker.maxOpenMin,
      blockedBurst10m: n(f, "breaker.blockedBurst10m") ?? cur.breaker.blockedBurst10m,
    },
    ai: {
      ...cur.ai,
      perMinute: n(f, "ai.perMinute") ?? cur.ai.perMinute,
      maxOutputTokens: { goweb: n(f, "ai.maxOutputTokens.goweb") ?? cur.ai.maxOutputTokens.goweb, store: n(f, "ai.maxOutputTokens.store") ?? cur.ai.maxOutputTokens.store },
      historyTurns: { goweb: n(f, "ai.historyTurns.goweb") ?? cur.ai.historyTurns.goweb, store: n(f, "ai.historyTurns.store") ?? cur.ai.historyTurns.store },
      turnChars: n(f, "ai.turnChars") ?? cur.ai.turnChars,
      economyAt: (n(f, "ai.economyPct") ?? cur.ai.economyAt * 100) / 100,
      dailyTokens: n(f, "ai.dailyTokens") ?? cur.ai.dailyTokens,
      monthlyTokens: n(f, "ai.monthlyTokens") ?? cur.ai.monthlyTokens,
      gowebDailyTokens: n(f, "ai.gowebDailyTokens") ?? cur.ai.gowebDailyTokens,
      storeDailyTokens: n(f, "ai.storeDailyTokens") ?? cur.ai.storeDailyTokens,
      storeMonthlyTokens: n(f, "ai.storeMonthlyTokens") ?? cur.ai.storeMonthlyTokens,
      storeMonthlyReplies: n(f, "ai.storeMonthlyReplies") ?? cur.ai.storeMonthlyReplies,
      chatDailyTokens: n(f, "ai.chatDailyTokens") ?? cur.ai.chatDailyTokens,
      priceInPerM: n(f, "ai.priceInPerM") ?? cur.ai.priceInPerM,
      priceOutPerM: n(f, "ai.priceOutPerM") ?? cur.ai.priceOutPerM,
    },
    loop: { inboundPerMinute: n(f, "loop.inboundPerMinute") ?? cur.loop.inboundPerMinute, floodPauseMin: n(f, "loop.floodPauseMin") ?? cur.loop.floodPauseMin, botStreakMax: n(f, "loop.botStreakMax") ?? cur.loop.botStreakMax },
  };
  const clean = parseWaGuard(JSON.stringify(next));
  await saveGuardConfig(clean);
  await audit(null, await adminActor(), "geovana.guard.save", "");
  revalidatePath(PAGE);
  back("Limites salvos. Valores fora do permitido foram ajustados automaticamente.");
}
