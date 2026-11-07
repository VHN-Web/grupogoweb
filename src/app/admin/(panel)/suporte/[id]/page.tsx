import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { fmtDate } from "@/core/billing";
import { CATEGORY_LABELS, PRIORITIES, SLA, STATUSES, STATUS_LABELS, remaining, slaState, type Category, type Priority, type TicketStatus } from "@/core/support";
import { answerTicket, setTicketPriority } from "../../support-actions";

export const dynamic = "force-dynamic";

export default async function TicketAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const t = await db.query.supportTickets.findFirst({ where: eq(schema.supportTickets.id, id), with: { tenant: true } });
  if (!t) notFound();
  const msgs = await db.query.supportMessages.findMany({ where: eq(schema.supportMessages.ticketId, t.id), orderBy: asc(schema.supportMessages.createdAt) });
  if (t.unreadByAdmin) await db.update(schema.supportTickets).set({ unreadByAdmin: false }).where(eq(schema.supportTickets.id, t.id));
  const customer = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, t.tenantId) });
  const now = new Date();
  const dt = (d: Date) => `${fmtDate(d)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Link href="/admin/suporte" className="text-sm text-muted hover:underline">← Chamados</Link>
        {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{sp.ok}</p>}
        <div>
          <h1 className="text-xl font-bold">{t.subject}</h1>
          <p className="text-sm text-muted"><span className="font-mono">{t.protocol}</span> · {CATEGORY_LABELS[t.category as Category].pt} · aberto por {t.openedBy} em {dt(t.createdAt)}</p>
        </div>
        <ol className="space-y-3">
          {msgs.map((m) => (
            <li key={m.id} className={`rounded-2xl p-4 text-sm ${m.internal ? "border-2 border-dashed border-amber-300 bg-amber-50" : m.author === "suporte" ? "bg-[#1F7FD8]/10" : "card"}`}>
              <p className="text-xs font-semibold text-muted">{m.internal ? "Nota interna · " : ""}{m.author === "suporte" ? `GoWeb · ${m.authorName}` : `${m.authorName} (cliente)`} · {dt(m.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
        <form action={answerTicket.bind(null, t.id)} className="card space-y-3 p-4">
          <label className="label" htmlFor="body">Resposta</label>
          <textarea id="body" name="body" className="input min-h-28" maxLength={6000} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="internal" /> Nota interna (o cliente não vê)</label>
            <select name="status" defaultValue="" className="input w-auto">
              <option value="">Manter situação ({STATUS_LABELS[t.status as TicketStatus].pt})</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s].pt}</option>)}
            </select>
            <button className="btn-brand">Enviar</button>
          </div>
          <p className="text-xs text-muted">O cliente recebe a resposta por e-mail{t.contactWhatsapp ? " e WhatsApp" : ""} e vê no painel dele.</p>
        </form>
      </div>
      <aside className="space-y-4">
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Prazos</h2>
          <p>1ª resposta: <b>{t.firstResponseAt ? `feita ${dt(t.firstResponseAt)}` : `até ${dt(t.firstResponseDueAt)}`}</b> <span className="text-muted">({slaState(t.firstResponseDueAt, t.firstResponseAt, t.createdAt, now)}{!t.firstResponseAt ? ` · ${remaining(t.firstResponseDueAt, now)}` : ""})</span></p>
          <p>Solução: <b>{t.resolvedAt ? `feita ${dt(t.resolvedAt)}` : `até ${dt(t.resolutionDueAt)}`}</b> <span className="text-muted">({slaState(t.resolutionDueAt, t.resolvedAt, t.createdAt, now)}{!t.resolvedAt ? ` · ${remaining(t.resolutionDueAt, now)}` : ""})</span></p>
          {t.rating && <p>Avaliação do cliente: <b>{t.rating}/5</b></p>}
          <form action={setTicketPriority.bind(null, t.id)} className="flex gap-2 pt-2">
            <select name="priority" defaultValue={t.priority} className="input">
              {PRIORITIES.map((p) => <option key={p} value={p}>{SLA[p].label.pt} ({SLA[p].first} h / {SLA[p].resolve} h)</option>)}
            </select>
            <button className="btn-ghost">Mudar</button>
          </form>
        </section>
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="font-semibold">Loja</h2>
          <p><b>{t.tenant.name}</b>{t.tenant.demo ? " (demonstração)" : ""}</p>
          {customer && <p>{customer.contactName} · {customer.email}{customer.whatsapp ? ` · ${customer.whatsapp}` : ""}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link href={`/painel/${t.tenant.slug}`} target="_blank" className="btn-ghost">Abrir painel da loja</Link>
            {customer && <Link href={`/admin/clientes/${customer.id}`} className="btn-ghost">Ver cliente</Link>}
          </div>
        </section>
      </aside>
    </div>
  );
}
