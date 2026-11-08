"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { aiPitchAction, leadContactAction } from "@/app/crm/actions";

type Tab = { id: string; label: string; text: string };

/** Mensagens prontas por canal + "Escrever com IA" (Gemini). Copiar ou abrir já no WhatsApp. */
export function ScriptBox({ leadId, tabs, phone, ai }: { leadId?: string; tabs: Tab[]; phone?: string | null; ai: boolean }) {
  const [tab, setTab] = useState(tabs[0].id);
  const [texts, setTexts] = useState<Record<string, string>>(Object.fromEntries(tabs.map((t) => [t.id, t.text])));
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const text = texts[tab] ?? "";
  const digits = phone?.replace(/\D/g, "") ?? "";
  return (
    <div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold ${tab === t.id ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : "bg-[var(--s-soft)]"}`}>{t.label}</button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setTexts({ ...texts, [tab]: e.target.value })} rows={9} className="input mt-3 font-sans text-sm leading-relaxed" aria-label="Mensagem" />
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(text); } catch {}
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="btn-ghost"
        >
          <Icon name={copied ? "check" : "link"} size={16} /> {copied ? "Copiado!" : "Copiar"}
        </button>
        {leadId && digits.length === 13 && tab !== "email" && (
          <button type="button" onClick={() => { window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank", "noopener"); start(() => leadContactAction(leadId, "whatsapp")); }} className="btn-brand">
            <Icon name="send" size={16} /> Enviar no WhatsApp
          </button>
        )}
        {leadId && ai && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErr(null);
                const r = await aiPitchAction(leadId, tab);
                if (r.error) setErr(r.error);
                else if (r.text) setTexts((t) => ({ ...t, [tab]: r.text! }));
              })
            }
            className="btn-ghost"
          >
            <Icon name="sparkle" size={16} /> {pending ? "Escrevendo…" : "Escrever com IA"}
          </button>
        )}
      </div>
    </div>
  );
}
