"use client";
import { useOptimistic, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { quickContactAction } from "@/app/crm/actions";

const CH = [
  { id: "whatsapp", label: "WhatsApp", icon: "chat", color: "#25D366" },
  { id: "call", label: "Ligação", icon: "phone", color: "#1F7FD8" },
  { id: "instagram", label: "Direct", icon: "instagram", color: "#E1306C" },
  { id: "visit", label: "Visita", icon: "pin", color: "#F2C14E" },
  { id: "email", label: "E-mail", icon: "mail", color: "#A970FF" },
] as const;

/** Contadores rápidos: +1 contato por canal (sem precisar abrir um lead). */
export function QuickCounters({ counts }: { counts: Record<string, number> }) {
  const [opt, add] = useOptimistic(counts, (s, a: { id: string; d: number }) => ({ ...s, [a.id]: Math.max(0, (s[a.id] ?? 0) + a.d) }));
  const [, start] = useTransition();
  const click = (id: string, d: number) =>
    start(async () => {
      add({ id, d });
      await quickContactAction(id, d < 0);
    });
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {CH.map((c) => (
        <li key={c.id} className="flex items-center gap-2 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-2">
          <button onClick={() => click(c.id, 1)} className="flex flex-1 items-center gap-2 rounded-xl p-1.5 text-left active:scale-95" aria-label={`Mais um contato por ${c.label}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: c.color }}><Icon name={c.icon} size={18} /></span>
            <span className="min-w-0">
              <b className="block text-xl tabular-nums leading-none">{opt[c.id] ?? 0}</b>
              <span className="text-xs text-[var(--s-muted)]">{c.label}</span>
            </span>
            <span className="ml-auto text-lg font-bold text-[var(--s-good-fg)]">+1</span>
          </button>
          <button onClick={() => click(c.id, -1)} disabled={!opt[c.id]} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--s-muted)] hover:bg-[var(--s-soft)] disabled:opacity-30" aria-label={`Desfazer contato por ${c.label}`}>−</button>
        </li>
      ))}
    </ul>
  );
}
