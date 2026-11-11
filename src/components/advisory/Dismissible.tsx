"use client";
// Esconde um aviso por alguns dias (preferência guardada só neste aparelho).
import { useEffect, useState } from "react";

export function Dismissible({ id, days = 7, label, children }: { id: string; days?: number; label: string; children: React.ReactNode }) {
  const key = `gw_hide_${id}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(key) ?? 0);
      if (until > Date.now()) setHidden(true);
    } catch {}
  }, [key]);
  if (hidden) return null;
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, String(Date.now() + days * 86_400_000));
          } catch {}
        }}
        className="absolute right-3 top-3 rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur hover:bg-black/40"
      >
        {label}
      </button>
    </div>
  );
}
