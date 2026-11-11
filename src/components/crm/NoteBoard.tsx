"use client";
// Bloco de notas do CRM: cartões coloridos (fixadas primeiro), checklist com "- [ ]", editor em tela cheia
// no celular com salvamento automático.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NOTE_COLORS, noteProgress, parseNote, type NoteColor } from "@/core/crm-planner";
import { Icon } from "@/components/ui/Icon";

type Note = { id: string; title: string; body: string; color: string; pinned: boolean; shared: boolean; mine: boolean; updated: string };
type Save = (id: string, p: { title?: string; body?: string; color?: string; pinned?: boolean; shared?: boolean }) => Promise<{ ok: boolean; error?: string }>;

const bg = (c: string, dark: boolean) => (NOTE_COLORS[(c in NOTE_COLORS ? c : "ivory") as NoteColor] ?? NOTE_COLORS.ivory)[dark ? 1 : 0];

function useDark() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const upd = () => setD(el.classList.contains("dark"));
    upd();
    const mo = new MutationObserver(upd);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return d;
}

function Preview({ n, onToggle }: { n: Note; onToggle: (line: number) => void }) {
  const lines = parseNote(n.body).filter((l) => l.kind === "check" || l.text.trim()).slice(0, 7);
  return (
    <div className="mt-1.5 space-y-1 text-[15px] leading-snug">
      {lines.map((l, i) =>
        l.kind === "check" ? (
          <label key={i} className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={l.done} onChange={() => onToggle(l.index)} className="mt-0.5 accent-[#2FAE5F]" />
            <span className={l.done ? "line-through opacity-60" : ""}>{l.text}</span>
          </label>
        ) : (
          <p key={i} className="line-clamp-3 break-words">{l.text}</p>
        ),
      )}
    </div>
  );
}

export function NoteBoard({ notes, openId, save, toggle, remove }: { notes: Note[]; openId: string | null; save: Save; toggle: (id: string, line: number) => Promise<void>; remove: (id: string) => Promise<void> }) {
  const dark = useDark();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(openId);
  const [, start] = useTransition();
  const current = useMemo(() => notes.find((n) => n.id === open) ?? null, [notes, open]);
  const pinned = notes.filter((n) => n.pinned);
  const others = notes.filter((n) => !n.pinned);

  const Card = ({ n }: { n: Note }) => {
    const p = noteProgress(n.body);
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => setOpen(n.id)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(n.id)}
        className="mb-3 cursor-pointer break-inside-avoid rounded-3xl border border-black/5 p-4 shadow-sm transition active:scale-[.98] dark:border-white/10"
        style={{ background: bg(n.color, dark) }}
      >
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[17px] font-extrabold leading-tight">{n.title || "Sem título"}</p>
          {n.pinned && <Icon name="pin" size={16} />}
        </div>
        <Preview n={n} onToggle={(line) => start(async () => { await toggle(n.id, line); router.refresh(); })} />
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-70">
          {p.total > 0 && <span className="rounded-full bg-black/10 px-2 py-0.5 font-bold dark:bg-white/15">{p.done}/{p.total}</span>}
          {n.shared && <span className="rounded-full bg-black/10 px-2 py-0.5 font-bold dark:bg-white/15">equipe</span>}
          <span>{n.updated}</span>
        </p>
      </article>
    );
  };

  return (
    <>
      {notes.length === 0 && <p className="rounded-3xl border border-dashed border-[var(--s-line)] p-8 text-center text-[var(--s-muted)]">Nenhuma nota ainda. Toque em “Nova nota”.</p>}
      {pinned.length > 0 && <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-[var(--s-muted)]">Fixadas</h2>}
      <div className="columns-2 gap-3 md:columns-3 xl:columns-4">{pinned.map((n) => <Card key={n.id} n={n} />)}</div>
      {pinned.length > 0 && others.length > 0 && <h2 className="mb-2 mt-4 text-xs font-black uppercase tracking-wider text-[var(--s-muted)]">Outras</h2>}
      <div className="columns-2 gap-3 md:columns-3 xl:columns-4">{others.map((n) => <Card key={n.id} n={n} />)}</div>
      {current && <Editor key={current.id} n={current} dark={dark} save={save} remove={remove} onClose={() => { setOpen(null); router.refresh(); }} />}
    </>
  );
}

function Editor({ n, dark, save, remove, onClose }: { n: Note; dark: boolean; save: Save; remove: (id: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState(n.title);
  const [body, setBody] = useState(n.body);
  const [color, setColor] = useState(n.color);
  const [pinned, setPinned] = useState(n.pinned);
  const [shared, setShared] = useState(n.shared);
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const first = useRef(true);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setState("saving");
    const t = setTimeout(async () => {
      const r = await save(n.id, { title, body, color, pinned, shared }).catch(() => ({ ok: false }));
      setState(r.ok ? "saved" : "error");
    }, 600);
    return () => clearTimeout(t);
  }, [title, body, color, pinned, shared, n.id, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const addCheck = () => {
    const el = area.current;
    const pos = el?.selectionStart ?? body.length;
    const before = body.slice(0, pos);
    const insert = `${before && !before.endsWith("\n") ? "\n" : ""}- [ ] `;
    const next = before + insert + body.slice(pos);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      const at = pos + insert.length;
      el?.setSelectionRange(at, at);
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Editar nota" onClick={onClose}>
      <div className="anim-sheet-up flex h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] sm:h-[80dvh] sm:rounded-[28px]" style={{ background: bg(color, dark), paddingBottom: "env(safe-area-inset-bottom)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4">
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-2xl bg-black/10 dark:bg-white/10" aria-label="Fechar">
            <Icon name="close" />
          </button>
          <span className="flex-1 text-center text-xs font-semibold opacity-70">{state === "saving" ? "Salvando…" : state === "error" ? "Não salvou — tente de novo" : "Salvo"}</span>
          <button type="button" onClick={() => setPinned(!pinned)} aria-pressed={pinned} className={`grid h-11 w-11 place-items-center rounded-2xl ${pinned ? "bg-[#0E0E10] text-white dark:bg-white dark:text-[#0E0E10]" : "bg-black/10 dark:bg-white/10"}`} aria-label={pinned ? "Desafixar" : "Fixar"}>
            <Icon name="pin" />
          </button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="mx-4 mt-3 bg-transparent text-2xl font-extrabold outline-none placeholder:opacity-40" />
        <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva aqui… (- [ ] vira caixinha de marcar)" className="mx-4 mt-2 flex-1 resize-none bg-transparent text-[17px] leading-relaxed outline-none placeholder:opacity-40" autoFocus={!n.body} />
        <div className="flex flex-wrap items-center gap-2 border-t border-black/10 px-4 py-3 dark:border-white/10">
          <button type="button" onClick={addCheck} className="rounded-2xl bg-black/10 px-3.5 py-2.5 text-sm font-bold dark:bg-white/10">☐ Caixinha</button>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Cor">
            {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`h-8 w-8 rounded-full border-2 ${color === c ? "border-[#0E0E10] dark:border-white" : "border-black/10"}`} style={{ background: NOTE_COLORS[c][dark ? 1 : 0] }} />
            ))}
          </div>
          {n.mine && (
            <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Equipe
            </label>
          )}
          {n.mine && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Apagar esta nota?")) return;
                await remove(n.id);
              }}
              className="rounded-2xl px-3 py-2.5 text-sm font-bold text-red-600"
            >
              Apagar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
