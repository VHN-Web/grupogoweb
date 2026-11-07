import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { CATEGORY_LABELS, SLA, STATUS_LABELS, isOpenStatus, remaining, type Category, type Priority, type TicketStatus } from "@/core/support";
import { rateTicket, replyTicket } from "../../support-actions";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug);
  const { T, locale, fmtDate } = panelI18n(t);
  const L = (o: { es: string; pt: string }) => (locale === "pt" ? o.pt : o.es);
  const x = await db.query.supportTickets.findFirst({ where: and(eq(schema.supportTickets.id, id), eq(schema.supportTickets.tenantId, t.id)) });
  if (!x) notFound();
  const msgs = await db.query.supportMessages.findMany({ where: and(eq(schema.supportMessages.ticketId, x.id), eq(schema.supportMessages.internal, false)), orderBy: asc(schema.supportMessages.createdAt) });
  if (x.unreadByCustomer) await db.update(schema.supportTickets).set({ unreadByCustomer: false }).where(eq(schema.supportTickets.id, x.id));
  const status = x.status as TicketStatus;
  const open = isOpenStatus(status);

  return (
    <div className="max-w-4xl space-y-5">
      <Link href={`/painel/${slug}/suporte`} className="text-sm text-muted hover:underline">{T("← Mis chamados", "← Meus chamados")}</Link>
      {sp.novo && (
        <div role="status" className="rounded-2xl border-2 border-[#2FAE5F] bg-white p-4">
          <p className="font-bold">{T("Chamado abierto", "Chamado aberto")}: <span className="font-mono text-lg">{x.protocol}</span></p>
          <p className="text-sm text-muted">{T("Guardá este protocolo. También lo enviamos a tu e-mail.", "Guarde este protocolo. Também enviamos para o seu e-mail.")}</p>
        </div>
      )}
      <div>
        <h1>{x.subject}</h1>
        <p className="mt-1 text-sm text-muted">{x.protocol} · {L(CATEGORY_LABELS[x.category as Category])} · {T("abierto el", "aberto em")} {fmtDate(x.createdAt)}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <dt className="text-xs text-muted">{T("Situación", "Situação")}</dt>
          <dd className="mt-0.5 font-bold">{L(STATUS_LABELS[status])}</dd>
        </div>
        <div className="card p-4">
          <dt className="text-xs text-muted">{T("Primera respuesta", "Primeira resposta")}</dt>
          <dd className="mt-0.5 font-bold">{x.firstResponseAt ? `${T("respondido", "respondido")} ${fmtDate(x.firstResponseAt)}` : `${T("hasta", "até")} ${fmtDate(x.firstResponseDueAt)}`}</dd>
        </div>
        <div className="card p-4">
          <dt className="text-xs text-muted">{T("Solución", "Solução")} · {L(SLA[x.priority as Priority].label)}</dt>
          <dd className="mt-0.5 font-bold">{x.resolvedAt ? `${T("resuelto", "resolvido")} ${fmtDate(x.resolvedAt)}` : `${T("hasta", "até")} ${fmtDate(x.resolutionDueAt)} · ${remaining(x.resolutionDueAt, new Date(), locale)}`}</dd>
        </div>
      </dl>

      <ol className="space-y-3" aria-label={T("Conversación", "Conversa")}>
        {msgs.map((m) => (
          <li key={m.id} className={`flex ${m.author === "cliente" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.author === "cliente" ? "rounded-br-md bg-[#1F7FD8] text-white" : "card rounded-bl-md"}`}>
              <p className={`text-xs font-semibold ${m.author === "cliente" ? "text-white/80" : "text-[#1F7FD8]"}`}>{m.author === "suporte" ? `${T("Soporte GoWeb", "Suporte GoWeb")} · ${m.authorName}` : m.authorName} · {fmtDate(m.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap text-[15px]">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {status === "RESOLVED" && !x.rating && (
        <form action={rateTicket.bind(null, slug, x.id)} className="card p-4">
          <p className="font-semibold">{T("¿Cómo fue la atención?", "Como foi o atendimento?")}</p>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} name="rating" value={n} className="btn-ghost h-11 w-11 p-0" aria-label={`${n} / 5`}>{n}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{T("Calificar cierra el chamado. Si el problema volvió, respondé abajo.", "Avaliar encerra o chamado. Se o problema voltou, responda abaixo.")}</p>
        </form>
      )}

      {status !== "CLOSED" && (
        <form action={replyTicket.bind(null, slug, x.id)} className="card space-y-3 p-4">
          <label className="label" htmlFor="body">{open ? T("Responder", "Responder") : T("¿El problema volvió? Escribí y lo reabrimos", "O problema voltou? Escreva e reabrimos")}</label>
          <textarea id="body" name="body" className="input min-h-24" maxLength={4000} required />
          <button className="btn-brand">{T("Enviar", "Enviar")}</button>
        </form>
      )}
    </div>
  );
}
