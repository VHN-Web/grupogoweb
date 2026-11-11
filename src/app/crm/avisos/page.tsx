import Link from "next/link";
import { NOTIFY_CATEGORIES } from "@/core/crm-notify";
import { fmtBr, requireCrm } from "@/services/crm";
import { inbox, markAllRead } from "@/services/crm-notify";
import { markAllReadAction } from "../actions";

export const metadata = { title: "Avisos" };
export const dynamic = "force-dynamic";

const LABEL = Object.fromEntries(NOTIFY_CATEGORIES.map((c) => [c.id, c.label])) as Record<string, string>;

export default async function Avisos({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const list = await inbox(me.id, sp.tipo);
  const unread = list.filter((n) => !n.readAt).length;
  // abriu a central = leu tudo (o destaque abaixo continua mostrando o que era novo)
  if (unread) await markAllRead(me.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
          <p className="text-sm text-[var(--s-muted)]">Tudo que o CRM avisou, inclusive o que chegou no horário de silêncio. Guardamos 90 dias.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/crm/config#avisos" className="btn-ghost py-2 text-sm">Personalizar</Link>
          {unread > 0 && <form action={markAllReadAction}><button className="btn-ghost py-2 text-sm">Marcar como lidos</button></form>}
        </div>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-sm">
        <Link href="/crm/avisos" className={`shrink-0 rounded-full px-3 py-1.5 font-semibold ${!sp.tipo ? "bg-[#3CC46B] text-[#0E0E10]" : "bg-[var(--s-soft)]"}`}>Todos</Link>
        {NOTIFY_CATEGORIES.map((c) => (
          <Link key={c.id} href={`/crm/avisos?tipo=${c.id}`} className={`shrink-0 rounded-full px-3 py-1.5 font-semibold ${sp.tipo === c.id ? "bg-[#3CC46B] text-[#0E0E10]" : "bg-[var(--s-soft)]"}`}>{c.label}</Link>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-[var(--s-line)] p-8 text-center text-sm text-[var(--s-muted)]">Nenhum aviso por aqui ainda.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((n) => (
            <li key={n.id}>
              <Link href={n.url || "/crm"} className={`block rounded-2xl border p-4 ${n.readAt ? "border-[var(--s-line)] bg-[var(--s-card)]" : "border-[#3CC46B] bg-[var(--s-good-bg)]"}`}>
                <div className="flex items-start gap-3">
                  {!n.readAt && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#3CC46B]" aria-label="novo" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{n.title}</p>
                    <p className="text-sm text-[var(--s-muted)]">{n.body}</p>
                    <p className="mt-1 text-xs text-[var(--s-muted)]">{fmtBr(n.createdAt)}{n.category && LABEL[n.category] ? ` · ${LABEL[n.category]}` : ""}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
