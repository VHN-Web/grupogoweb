"use client";
// Assistente do painel: botão fixo que abre uma conversa. Mostra atalhos para as telas e,
// quando a pessoa pede uma ação, um cartão com "Confirmar" — nada muda sem esse toque.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

type Msg = { role: "user" | "assistant"; text: string; links?: { label: string; href: string }[]; pending?: { token: string; summary: string; state?: "done" | "error" | "cancelled" | "busy"; result?: string }[] };

const TXT = {
  pt: {
    open: "Assistente",
    title: "Assistente GoWeb",
    hello: "Oi! Posso te mostrar onde fica cada função ou fazer coisas por você, como mudar um preço, pausar um produto, fechar a loja ou criar um cupom. O que você precisa?",
    placeholder: "Escreva o que precisa…",
    send: "Enviar",
    close: "Fechar assistente",
    confirm: "Confirmar",
    cancel: "Cancelar",
    cancelled: "Cancelado",
    thinking: "Pensando…",
    error: "Não consegui responder agora. Tente de novo.",
    limit: "Muitas mensagens em pouco tempo. Tente de novo daqui a pouco.",
    chips: ["Quanto vendi hoje?", "Como imprimo o QR das mesas?", "Pausar um produto", "Fechar a loja agora"],
  },
  es: {
    open: "Asistente",
    title: "Asistente GoWeb",
    hello: "¡Hola! Te muestro dónde está cada función o hago cosas por vos, como cambiar un precio, pausar un producto, cerrar la tienda o crear un cupón. ¿Qué necesitás?",
    placeholder: "Escribí lo que necesitás…",
    send: "Enviar",
    close: "Cerrar asistente",
    confirm: "Confirmar",
    cancel: "Cancelar",
    cancelled: "Cancelado",
    thinking: "Pensando…",
    error: "No pude responder ahora. Probá de nuevo.",
    limit: "Muchos mensajes en poco tiempo. Probá en un rato.",
    chips: ["¿Cuánto vendí hoy?", "¿Cómo imprimo el QR de las mesas?", "Pausar un producto", "Cerrar la tienda ahora"],
  },
};

export function Assistant({ slug, locale, enabled }: { slug: string; locale: "es" | "pt"; enabled: boolean }) {
  const t = TXT[locale];
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!enabled) return null;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, messages: next.slice(-12).map((m) => ({ role: m.role, text: m.text })) }),
      });
      if (res.status === 429) throw new Error("limit");
      if (!res.ok) throw new Error("err");
      const r = (await res.json()) as { text: string; links: Msg["links"]; pending: Msg["pending"] };
      setMsgs((m) => [...m, { role: "assistant", text: r.text, links: r.links, pending: r.pending }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: e instanceof Error && e.message === "limit" ? t.limit : t.error }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(mi: number, pi: number, ok: boolean) {
    const p = msgs[mi].pending![pi];
    const patch = (v: Partial<NonNullable<Msg["pending"]>[number]>) =>
      setMsgs((m) => m.map((x, i) => (i === mi ? { ...x, pending: x.pending!.map((y, j) => (j === pi ? { ...y, ...v } : y)) } : x)));
    if (!ok) return patch({ state: "cancelled" });
    patch({ state: "busy" });
    try {
      const res = await fetch("/api/assistant/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, token: p.token }) });
      const r = (await res.json()) as { ok: boolean; message: string };
      patch({ state: r.ok ? "done" : "error", result: r.message });
      if (r.ok) router.refresh();
    } catch {
      patch({ state: "error", result: t.error });
    }
  }

  return (
    <div className="no-print">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center gap-2 rounded-full bg-[#1F7FD8] font-semibold text-white shadow-[0_10px_30px_rgba(31,127,216,.45)] sm:h-auto sm:w-auto sm:px-4 sm:py-3 lg:bottom-6 lg:right-6"
          aria-haspopup="dialog"
          aria-label={t.title}
        >
          <Icon name="chat" size={22} />
          <span className="hidden sm:inline">{t.open}</span>
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label={t.title}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/10 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[600px] sm:w-[400px] sm:rounded-3xl"
        >
          <header className="flex items-center gap-3 bg-[#0F2747] px-4 py-3 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1F7FD8]"><Icon name="sparkle" size={18} /></span>
            <p className="flex-1 font-semibold">{t.title}</p>
            <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/10" aria-label={t.close}>
              <Icon name="close" size={18} />
            </button>
          </header>

          <div ref={list} className="flex-1 space-y-3 overflow-y-auto bg-[#F3F5F9] p-4" aria-live="polite">
            <Bubble role="assistant" text={t.hello} />
            {msgs.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {t.chips.map((c) => (
                  <button key={c} type="button" onClick={() => send(c)} className="rounded-full border border-[#1F7FD8]/30 bg-white px-3 py-1.5 text-sm font-medium text-[#1F5FA8] hover:bg-[#E1EEFB]">
                    {c}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, mi) => (
              <div key={mi} className="space-y-2">
                <Bubble role={m.role} text={m.text} />
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {m.links.map((l) => (
                      <Link key={l.href} href={l.href} onClick={() => window.innerWidth < 640 && setOpen(false)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2747] px-3 py-2 text-sm font-semibold text-white">
                        {locale === "pt" ? "Abrir" : "Abrir"} {l.label}
                      </Link>
                    ))}
                  </div>
                )}
                {m.pending?.map((p, pi) => (
                  <div key={pi} className="rounded-2xl border-2 border-[#1F7FD8]/40 bg-white p-3 text-sm">
                    <p className="font-semibold text-[#0F1B2D]">{p.summary}</p>
                    {!p.state || p.state === "busy" ? (
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={p.state === "busy"} onClick={() => decide(mi, pi, true)} className="flex-1 rounded-xl bg-[#2FAE5F] px-3 py-2 font-semibold text-white disabled:opacity-60">
                          {p.state === "busy" ? "…" : t.confirm}
                        </button>
                        <button type="button" disabled={p.state === "busy"} onClick={() => decide(mi, pi, false)} className="rounded-xl border border-black/15 px-3 py-2 font-semibold">
                          {t.cancel}
                        </button>
                      </div>
                    ) : (
                      <p role="status" className={`mt-1.5 flex items-center gap-1.5 font-semibold ${p.state === "done" ? "text-[#1E8A47]" : p.state === "error" ? "text-red-600" : "text-[#5B6474]"}`}>
                        {p.state === "done" && <Icon name="check" size={16} />}
                        {p.state === "cancelled" ? t.cancelled : p.result}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
            {busy && <p className="text-sm text-[#5B6474]">{t.thinking}</p>}
          </div>

          <form
            className="flex items-end gap-2 border-t border-black/10 bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="gw-assistant-input" className="sr-only">{t.placeholder}</label>
            <textarea
              id="gw-assistant-input"
              ref={field}
              rows={1}
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={t.placeholder}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-black/15 px-3 py-2.5 text-[15px] outline-none focus:border-[#1F7FD8]"
            />
            <button type="submit" disabled={busy || !input.trim()} className="grid h-11 w-11 place-items-center rounded-xl bg-[#1F7FD8] text-white disabled:opacity-40" aria-label={t.send}>
              <Icon name="send" size={18} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  return (
    <div className={`flex ${role === "user" ? "justify-end" : "justify-start"}`}>
      <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug ${role === "user" ? "rounded-br-md bg-[#1F7FD8] text-white" : "rounded-bl-md bg-white text-[#1B2230] ring-1 ring-black/5"}`}>
        {text}
      </p>
    </div>
  );
}
