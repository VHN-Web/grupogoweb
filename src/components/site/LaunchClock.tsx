"use client";
import { useEffect, useState } from "react";

/** Contagem regressiva grande (dias, horas, min, seg). Ao zerar, recarrega e mostra o site. */
export function LaunchClock({ to, labels }: { to: string; labels: [string, string, string, string] }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= target) {
        clearInterval(t);
        setTimeout(() => window.location.reload(), 1500);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [target]);
  const ms = now === null ? 0 : Math.max(0, target - now);
  const parts = [Math.floor(ms / 86400000), Math.floor((ms % 86400000) / 3600000), Math.floor((ms % 3600000) / 60000), Math.floor((ms % 60000) / 1000)];
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4" role="timer" aria-live="off">
      {parts.map((v, i) => (
        <div key={labels[i]} className="rounded-2xl border border-white/10 bg-white/[.06] px-2 py-4 text-center backdrop-blur sm:rounded-3xl sm:py-6">
          <b className="block font-[family-name:var(--font-display,inherit)] text-4xl leading-none tabular-nums text-[#F4F1EA] sm:text-7xl" suppressHydrationWarning>
            {now === null ? "--" : String(v).padStart(2, "0")}
          </b>
          <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[.2em] text-[#B9B3A7] sm:text-xs">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
