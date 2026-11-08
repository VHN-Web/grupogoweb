"use client";
import { useEffect, useState } from "react";

/** Contagem regressiva até a live (dias, horas, minutos). */
export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, target - now);
  if (ms === 0) return <p className="text-lg font-bold text-[#3CC46B]">A live está começando!</p>;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return (
    <div className="flex gap-2" aria-label={`Faltam ${d} dias, ${h} horas e ${m} minutos`}>
      {[
        [d, "dias"],
        [h, "horas"],
        [m, "min"],
      ].map(([v, l]) => (
        <span key={l as string} className="grid min-w-16 place-items-center rounded-2xl bg-white/10 px-3 py-2">
          <b className="text-2xl tabular-nums">{String(v).padStart(2, "0")}</b>
          <span className="text-[11px] uppercase tracking-wider text-[#B9B3A7]">{l}</span>
        </span>
      ))}
    </div>
  );
}
