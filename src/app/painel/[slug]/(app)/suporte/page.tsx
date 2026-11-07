import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { CATEGORIES, CATEGORY_LABELS, PRIORITIES, SLA, STATUS_LABELS, isOpenStatus, type TicketStatus } from "@/core/support";
import { tenantTickets } from "@/services/support";
import { newTicket } from "../support-actions";

export const dynamic = "force-dynamic";

export default async function SupportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug);
  const { T, locale, fmtDate } = panelI18n(t);
  const L = (o: { es: string; pt: string }) => (locale === "pt" ? o.pt : o.es);
  const tickets = await tenantTickets(t.id);
  const open = tickets.filter((x) => isOpenStatus(x.status as TicketStatus));
  const closed = tickets.filter((x) => !isOpenStatus(x.status as TicketStatus));

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <div>
          <h1>{T("Soporte GoWeb", "Suporte GoWeb")}</h1>
          <p className="mt-1 text-muted">{T("Abrí un chamado y recibí un protocolo. Respondemos dentro del plazo de cada prioridad.", "Abra um chamado e receba um protocolo. Respondemos dentro do prazo de cada prioridade.")}</p>
        </div>
        {sp.err && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
        <form action={newTicket.bind(null, slug)} className="card space-y-4 p-5">
          <h2 className="font-semibold">{T("Nuevo chamado", "Novo chamado")}</h2>
          <fieldset>
            <legend className="label">{T("¿Sobre qué es?", "Sobre o que é?")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CATEGORIES.map((c, i) => (
                <label key={c} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-[var(--section)] has-[:checked]:bg-[var(--section-soft)]">
                  <input type="radio" name="category" value={c} defaultChecked={i === 0} className="accent-[var(--section)]" />
                  {L(CATEGORY_LABELS[c])}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">{T("¿Cuánto afecta a tu negocio?", "Quanto isso afeta o seu negócio?")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRIORITIES.map((p) => (
                <label key={p} className="flex cursor-pointer items-start gap-2 rounded-xl border border-line px-3 py-2.5 text-sm has-[:checked]:border-[var(--section)] has-[:checked]:bg-[var(--section-soft)]">
                  <input type="radio" name="priority" value={p} defaultChecked={p === "normal"} className="mt-0.5 accent-[var(--section)]" />
                  <span>
                    <b>{L(SLA[p].impact)}</b>
                    <span className="block text-xs text-muted">{T(`Respuesta en hasta ${SLA[p].first} h · solución en hasta ${SLA[p].resolve} h`, `Resposta em até ${SLA[p].first} h · solução em até ${SLA[p].resolve} h`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="subject">{T("Asunto", "Assunto")}</label>
            <input id="subject" name="subject" className="input" maxLength={120} required placeholder={T("Ej.: el pago por Pix no aparece", "Ex.: o pagamento por Pix não aparece")} />
          </div>
          <div>
            <label className="label" htmlFor="body">{T("Contanos qué pasó", "Conte o que aconteceu")}</label>
            <textarea id="body" name="body" className="input min-h-32" maxLength={4000} required placeholder={T("Qué intentaste hacer, qué apareció y desde cuándo.", "O que você tentou fazer, o que apareceu e desde quando.")} />
          </div>
          <button className="btn-brand">{T("Abrir chamado", "Abrir chamado")}</button>
        </form>
      </div>

      <aside className="space-y-4">
        <section className="card divide-y divide-line">
          <h2 className="px-4 py-3 font-semibold">{T("En curso", "Em andamento")} ({open.length})</h2>
          {open.length === 0 && <p className="px-4 py-3 text-sm text-muted">{T("Ningún chamado abierto.", "Nenhum chamado aberto.")}</p>}
          {open.map((x) => <Row key={x.id} x={x} slug={slug} L={L} fmtDate={fmtDate} />)}
        </section>
        {closed.length > 0 && (
          <section className="card divide-y divide-line">
            <h2 className="px-4 py-3 font-semibold">{T("Finalizados", "Finalizados")}</h2>
            {closed.slice(0, 20).map((x) => <Row key={x.id} x={x} slug={slug} L={L} fmtDate={fmtDate} />)}
          </section>
        )}
      </aside>
    </div>
  );
}

function Row({ x, slug, L, fmtDate }: { x: { id: string; protocol: string; subject: string; status: string; unreadByCustomer: boolean; lastMessageAt: Date }; slug: string; L: (o: { es: string; pt: string }) => string; fmtDate: (d: Date, o?: Intl.DateTimeFormatOptions) => string }) {
  return (
    <Link href={`/painel/${slug}/suporte/${x.id}`} className="block px-4 py-3 text-sm hover:bg-black/5">
      <p className="flex items-center gap-2 font-semibold">
        {x.unreadByCustomer && <span className="h-2 w-2 rounded-full bg-[#1F7FD8]" aria-label="nova resposta" />}
        <span className="truncate">{x.subject}</span>
      </p>
      <p className="text-xs text-muted">{x.protocol} · {L(STATUS_LABELS[x.status as TicketStatus])} · {fmtDate(x.lastMessageAt, { dateStyle: "short" })}</p>
    </Link>
  );
}
