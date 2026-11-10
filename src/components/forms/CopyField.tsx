"use client";
// Campo somente leitura com botão Copiar (e "mostrar" para segredos).
import { useState } from "react";

export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(!secret);
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  };
  return (
    <div className="grid gap-1 text-xs">
      <span className="font-semibold">{label}</span>
      <div className="flex gap-1.5">
        <input readOnly className="input min-w-0 flex-1 font-mono !text-xs" value={show ? value : "•".repeat(Math.min(24, value.length))} onFocus={(e) => show && e.currentTarget.select()} />
        {secret && <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setShow((s) => !s)}>{show ? "Ocultar" : "Mostrar"}</button>}
        <button type="button" className="btn-ghost px-2.5 py-1 text-xs" onClick={copy}>{done ? "Copiado" : "Copiar"}</button>
      </div>
    </div>
  );
}
