import { Icon } from "@/components/ui/Icon";
import { NoteBoard } from "@/components/crm/NoteBoard";
import { AutoSubmit } from "@/components/crm/AutoSubmit";
import { NOTE_COLORS } from "@/core/crm-planner";
import { requireCrm } from "@/services/crm";
import { notes } from "@/services/crm-planner";
import { deleteNoteAction, newNoteAction, saveNoteAction, toggleNoteCheckAction } from "../planner-actions";

export const metadata = { title: "Notas" };
export const dynamic = "force-dynamic";

const rel = (d: Date) => {
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).format(d);
};

export default async function NotasPage({ searchParams }: { searchParams: Promise<{ q?: string; abrir?: string; ok?: string; nova?: string }> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const list = await notes(me, sp.q);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold tracking-tight">Notas</h1>
        <form action={newNoteAction}>
          <input type="hidden" name="color" value={Object.keys(NOTE_COLORS)[Math.floor(Math.random() * 5) + 1]} />
          <button className="inline-flex items-center gap-2 rounded-2xl bg-[#3CC46B] px-4 py-3 text-sm font-extrabold text-[#0E0E10]">
            <Icon name="plus" size={18} /> Nova nota
          </button>
        </form>
      </div>
      {sp.nova === "1" && <AutoSubmit action={newNoteAction} fields={{ color: "yellow" }} />}
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      <form className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50"><Icon name="search" size={18} /></span>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar nas notas" className="input pl-11" />
      </form>
      <NoteBoard
        notes={list.map((n) => ({ id: n.id, title: n.title, body: n.body, color: n.color, pinned: n.pinned, shared: n.shared, mine: n.ownerId === me.id, updated: rel(n.updatedAt) }))}
        openId={sp.abrir ?? null}
        save={saveNoteAction}
        toggle={toggleNoteCheckAction}
        remove={deleteNoteAction}
      />
    </div>
  );
}
