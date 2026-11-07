"use client";
import { useMemo, useState } from "react";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";

type Item = { key: string; label: string; desc: string; price: number; pro: boolean };

/** Escolha de módulos do plano personalizado (o total mostrado é só uma prévia — o servidor recalcula). */
export function ModulePicker({ core, coreLabel, coreDesc, items, currency, perMonth, setupText, initial = [] }: {
  core: number;
  coreLabel: string;
  coreDesc: string;
  items: Item[];
  currency: Currency;
  perMonth: string;
  setupText: string;
  initial?: string[];
}) {
  const [sel, setSel] = useState<string[]>(initial);
  const money = (v: number) => formatMoney(v, currency);
  const total = useMemo(() => core + items.filter((i) => sel.includes(i.key)).reduce((a, i) => a + i.price, 0), [core, items, sel]);
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-[#3CC46B]/60 bg-[#3CC46B]/10 p-3">
        <div className="flex items-start justify-between gap-3">
          <span><b>✓ {coreLabel}</b><span className="block text-xs text-[#B9B3A7]">{coreDesc}</span></span>
          <span className="shrink-0 text-sm font-semibold">{money(core)}</span>
        </div>
      </div>
      {items.map((i) => {
        const on = sel.includes(i.key);
        return (
          <label key={i.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${on ? "border-[#3CC46B] bg-white/5" : "border-[#2C2C31]"}`}>
            <input type="checkbox" name="modules" value={i.key} checked={on} onChange={() => toggle(i.key)} className="mt-1 h-4 w-4 accent-[#3CC46B]" />
            <span className="flex-1">
              <b>{i.label}</b>{i.pro && <span className="ml-1.5 rounded bg-gradient-to-r from-[#1F7FD8] to-[#3CC46B] px-1 text-[9px] font-black text-white">GoInteligence</span>}
              <span className="block text-xs text-[#B9B3A7]">{i.desc}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold">+{money(i.price)}</span>
          </label>
        );
      })}
      <div className="sticky bottom-2 rounded-xl bg-[#F4F1EA] p-3 text-[#0E0E10] shadow-lg">
        <p className="flex items-baseline justify-between"><span className="font-semibold">Total</span><span className="text-2xl font-black">{money(total)}<span className="text-sm font-semibold">/{perMonth}</span></span></p>
        <p className="text-xs text-[#5C574E]">{setupText}</p>
      </div>
    </div>
  );
}
