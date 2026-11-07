"use client";
import { useState } from "react";

export function CopyLink({ text, label, done, className }: { text: string; label: string; done: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={className ?? "th-line rounded-xl border px-4 py-2.5 font-semibold"}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { window.prompt("", text); }
        setOk(true);
        setTimeout(() => setOk(false), 1800);
      }}
    >
      {ok ? done : label}
    </button>
  );
}
