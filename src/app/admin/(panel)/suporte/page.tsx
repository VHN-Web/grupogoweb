import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { SLA, STATUS_LABELS, isOpenStatus, remaining, slaState, type Priority, type SlaState, type TicketStatus } from "@/core/support";

export const dynamic = "force-dynamic";

const CHIP: Record<SlaState, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  risco: "bg-amber-100 text-amber-900",
  atrasado: "bg-red-600 text-white",
  cumprido: "bg-emerald-100 text-emerald-800",
  violado: "bg-red-100 text-red-800",
};
const LABEL: Record<SlaState, string> = { ok: "no prazo", risco: "perto do prazo", atrasado: "atrasado", cumprido: "cumprido", violado: "fora do prazo" };

export default async function SupportQueue({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const filter = sp.f === "todos" || sp.f === "finalizados" ? sp.f : "abertos";
  const all = await db.query.supportTickets.findMany({ orderBy: desc(schema.supportTickets.lastMessageAt), limit: 300, with: { tenant: { columns: { name: true, slug: true } } } });
  const now = new Date();
  const rows = all
    .filter((t) => (filter === "todos" ? true : filter === "abertos" ? isOpenStatus(t.status as TicketStatus) : !isOpenStatus(t.status as TicketStatus)))
    .map((t) => {
      const first = slaState(t.firstResponseDueAt, t.firstResponseAt, t.createdAt, now);
      const res = slaState(t.resolutionDueAt, t.resolvedAt, t.createdAt, now);
      return { t, first, res };
    })
    // abertos: mais urgentes primeiro (atrasados, depois menor prazo)
    .sort((a, b) => (filter === "abertos" ? a.t.resolutionDueAt.getTime() - b.t.resolutionDueAt.getTime() : 0));
  const openAll = all.filter((t) => isOpenStatus(t.status as TicketStatus));
  const late = openAll.filter((t) => slaState(t.resolutionDueAt, null, t.createdAt, now) === "atrasado" || slaState(t.firstResponseDueAt, t.firstResponseAt, t.createdAt, now) === "atrasado").length;
  const rated = all.filter((t) => t.rating);
  const avg = rated.length ? (rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length).toFixed(1) : "—";
  const done = all.filter((t) => t.resolvedAt);
  const onTime = done.length ? Math.round((done.filter((t) => t.resolvedAt! <= t.resolutionDueAt).length / done.length) * 100) : null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Suporte</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat k="Em aberto" v={String(openAll.length)} />
        <Stat k="Atrasados" v={String(late)} alert={late > 0} />
        <Stat k="Resolvidos no prazo" v={onTime === null ? "—" : `${onTime}%`} />
        <Stat k="Nota média" v={avg} />
      </div>
      <nav className="flex gap-1 text-sm">
        {[["abertos", "Abertos"], ["finalizados", "Finalizados"], ["todos", "Todos"]].map(([k, l]) => (
          <Link key={k} href={`?f=${k}`} className={`${filter === k ? "btn border border-transparent bg-ink text-white" : "btn-ghost"}`}>{l}</Link>
        ))}
      </nav>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="px-4 py-2.5">Protocolo / assunto</th><th>Loja</th><th>Prioridade</th><th>Situação</th><th>1ª resposta</th><th>Solução</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">Nenhum chamado aqui.</td></tr>}
            {rows.map(({ t, first, res }) => (
              <tr key={t.id} className={t.unreadByAdmin ? "bg-[#1F7FD8]/5" : ""}>
                <td className="px-4 py-3">
                  <Link href={`/admin/suporte/${t.id}`} className="font-semibold hover:underline">{t.unreadByAdmin && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#1F7FD8]" />}{t.subject}</Link>
                  <p className="font-mono text-xs text-muted">{t.protocol}</p>
                </td>
                <td>{t.tenant.name}</td>
                <td>{SLA[t.priority as Priority].label.pt}</td>
                <td>{STATUS_LABELS[t.status as TicketStatus].pt}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[first]}`}>{LABEL[first]}</span>{!t.firstResponseAt && <span className="block text-xs text-muted">{remaining(t.firstResponseDueAt, now)}</span>}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[res]}`}>{LABEL[res]}</span>{!t.resolvedAt && <span className="block text-xs text-muted">{remaining(t.resolutionDueAt, now)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Prazos (horas corridas): {Object.entries(SLA).map(([k, v]) => `${v.label.pt} ${v.first} h / ${v.resolve} h`).join(" · ")}. Responder pela primeira vez marca a 1ª resposta; mudar para Resolvido marca a solução.</p>
    </div>
  );
}

function Stat({ k, v, alert }: { k: string; v: string; alert?: boolean }) {
  return (
    <div className={`card px-4 py-3 ${alert ? "border-red-300" : ""}`}>
      <p className="text-xs text-muted">{k}</p>
      <p className={`text-xl font-bold ${alert ? "text-red-600" : ""}`}>{v}</p>
    </div>
  );
}
