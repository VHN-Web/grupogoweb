"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CRM_STATUSES, CRM_STATUS_COLOR, CRM_STATUS_LABEL, SCORE_COLOR, SCORE_LABEL, type CrmStatus, type Score } from "@/core/crm";
import { moveLeadAction } from "@/app/crm/actions";

export type KLead = { id: string; name: string; status: CrmStatus; score: Score; place: string; owner: string; follow: string | null; late: boolean };

/** Funil em colunas: arraste no computador; no celular use "Mover para". */
export function Kanban({ initial }: { initial: KLead[] }) {
  const [leads, setLeads] = useState(initial);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<CrmStatus | null>(null);
  const [, start] = useTransition();
  const move = (id: string, status: CrmStatus) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)));
    start(() => moveLeadAction(id, status));
  };
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      {CRM_STATUSES.map((s) => {
        const col = leads.filter((l) => l.status === s);
        return (
          <section
            key={s}
            onDragOver={(e) => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver(null)}
            onDrop={() => { if (drag) move(drag, s); setDrag(null); setOver(null); }}
            className={`flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col rounded-3xl border bg-[var(--s-soft)] p-3 transition md:w-[280px] ${over === s ? "border-[var(--s-good-fg)]" : "border-transparent"}`}
            aria-label={CRM_STATUS_LABEL[s]}
          >
            <header className="mb-2 flex items-center gap-2 px-1">
              <span className="h-3 w-3 rounded-full" style={{ background: CRM_STATUS_COLOR[s] }} />
              <h2 className="flex-1 font-bold">{CRM_STATUS_LABEL[s]}</h2>
              <span className="rounded-full bg-[var(--s-card)] px-2 py-0.5 text-xs font-bold tabular-nums">{col.length}</span>
            </header>
            <ul className="max-h-[65vh] flex-1 space-y-2 overflow-y-auto pr-0.5">
              {col.map((l) => (
                <li
                  key={l.id}
                  draggable
                  onDragStart={() => setDrag(l.id)}
                  onDragEnd={() => setDrag(null)}
                  className={`cursor-grab rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-3 shadow-sm active:cursor-grabbing ${drag === l.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCORE_COLOR[l.score] }} title={SCORE_LABEL[l.score]} />
                    <Link href={`/crm/leads/${l.id}`} className="min-w-0 flex-1 font-semibold leading-tight hover:underline">{l.name}</Link>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--s-muted)]">{l.place}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--s-muted)]">{l.owner}</span>
                    {l.follow && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${l.late ? "bg-red-500/15 text-red-600 dark:text-red-300" : "bg-[var(--s-soft)]"}`}>{l.follow}</span>}
                  </div>
                  <select value={l.status} onChange={(e) => move(l.id, e.target.value as CrmStatus)} className="mt-2 w-full rounded-lg border border-[var(--s-line)] bg-transparent px-2 py-1 text-xs md:hidden" aria-label={`Mover ${l.name}`}>
                    {CRM_STATUSES.map((x) => <option key={x} value={x}>Mover para: {CRM_STATUS_LABEL[x]}</option>)}
                  </select>
                </li>
              ))}
              {col.length === 0 && <li className="rounded-2xl border-2 border-dashed border-[var(--s-line)] p-4 text-center text-xs text-[var(--s-muted)]">Arraste um lead para cá</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
