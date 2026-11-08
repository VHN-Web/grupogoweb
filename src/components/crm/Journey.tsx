"use client";
import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { journeyAction } from "@/app/crm/actions";

type J = { startedAt: string; pauseStartedAt: string | null; pausedSeconds: number } | null;
type Summary = { seconds: number; contacts: number; demos: number; won: number; followups: number } | null;

const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Botão iniciar/pausar/encerrar jornada com cronômetro ao vivo. */
export function Journey({ journey, name }: { journey: J; name: string }) {
  const [now, setNow] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<Summary>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs =
    journey && now
      ? Math.max(0, Math.floor((now - new Date(journey.startedAt).getTime()) / 1000) - journey.pausedSeconds - (journey.pauseStartedAt ? Math.floor((now - new Date(journey.pauseStartedAt).getTime()) / 1000) : 0))
      : 0;
  const paused = !!journey?.pauseStartedAt;
  const run = (k: "start" | "pause" | "end") =>
    start(async () => {
      const r = await journeyAction(k);
      if (k === "end" && r) setSummary(r);
    });
  const hour = now ? new Date(now).getHours() : 12;
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#0E0E10] p-6 text-[#F4F1EA] ring-1 ring-white/10" style={{ backgroundImage: "radial-gradient(circle at 90% 0%, rgba(31,127,216,.28), transparent 55%)" }}>
      <p className="text-sm text-[#B9B3A7]">{hello}, {name.split(" ")[0]}</p>
      {journey ? (
        <>
          <p className="mt-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: paused ? "#F2C14E" : "#3CC46B" }}>
            <span className={`h-2 w-2 rounded-full ${paused ? "bg-[#F2C14E]" : "animate-pulse bg-[#3CC46B]"}`} /> {paused ? "Jornada pausada" : "Jornada em andamento"}
          </p>
          <p className="mt-2 font-mono text-5xl font-bold tabular-nums tracking-tight" aria-live="off">{fmt(secs)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button disabled={pending} onClick={() => run("pause")} className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 font-bold hover:bg-white/15 disabled:opacity-50">
              <Icon name={paused ? "play" : "pause"} size={18} /> {paused ? "Retomar" : "Pausar"}
            </button>
            <button disabled={pending} onClick={() => confirm("Encerrar a jornada de hoje?") && run("end")} className="flex items-center gap-2 rounded-2xl bg-[#E0614A] px-4 py-3 font-bold text-white disabled:opacity-50">
              <Icon name="stop" size={18} /> Encerrar jornada
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Pronto para prospectar?</h2>
          <p className="mt-1 text-sm text-[#B9B3A7]">Inicie a jornada para contar o tempo e os contatos do dia.</p>
          <button disabled={pending} onClick={() => run("start")} className="btn-shine mt-5 flex items-center gap-2 rounded-2xl bg-[#3CC46B] px-6 py-3.5 text-lg font-bold text-[#0E0E10] disabled:opacity-50">
            <Icon name="play" size={20} /> Iniciar jornada
          </button>
        </>
      )}
      {summary && (
        <div className="aff-pop mt-5 rounded-2xl bg-white/10 p-4">
          <p className="font-bold">Jornada encerrada · {fmt(summary.seconds)}</p>
          <p className="mt-1 text-sm text-[#B9B3A7]">{summary.contacts} contatos · {summary.demos} demos marcadas · {summary.won} fechamentos · {summary.followups} retornos agendados</p>
        </div>
      )}
    </section>
  );
}
