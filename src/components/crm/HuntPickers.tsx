"use client";
import { useState } from "react";

/** Grade de caixinhas com "marcar todos / nenhum" (estados e categorias da busca). */
export function CheckGroup({ name, title, options, initial, cols = "grid-cols-2 sm:grid-cols-3" }: { name: string; title?: string; options: { value: string; label: string }[]; initial: string[]; cols?: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const all = options.every((o) => sel.has(o.value));
  const toggle = (v: string) => setSel((s) => { const n = new Set(s); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  return (
    <fieldset className="rounded-2xl border border-[var(--s-line)] p-3">
      <legend className="flex items-center gap-2 px-1 text-sm font-bold">
        {title}
        <span className="text-xs font-normal text-[var(--s-muted)]">{options.filter((o) => sel.has(o.value)).length}/{options.length}</span>
        <button type="button" onClick={() => setSel(all ? new Set() : new Set(options.map((o) => o.value)))} className="rounded-lg bg-[var(--s-soft)] px-2 py-0.5 text-xs font-semibold">
          {all ? "Desmarcar todos" : "Marcar todos"}
        </button>
      </legend>
      <div className={`grid gap-1 ${cols}`}>
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-[var(--s-soft)]">
            <input type="checkbox" name={name} value={o.value} checked={sel.has(o.value)} onChange={() => toggle(o.value)} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
