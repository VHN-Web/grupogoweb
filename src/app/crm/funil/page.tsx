import { desc, gte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { Kanban } from "@/components/crm/Kanban";
import { firstName, fmtBr, partners, requireCrm } from "@/services/crm";

export const metadata = { title: "Funil" };
export const dynamic = "force-dynamic";

export default async function Funnel({ searchParams }: { searchParams: Promise<{ meus?: string }> }) {
  const me = await requireCrm();
  const { meus } = await searchParams;
  const since = new Date(Date.now() - 30 * 86400_000);
  const [leads, people] = await Promise.all([
    // fechados/perdidos só dos últimos 30 dias, para o quadro não ficar enorme
    db.query.crmLeads.findMany({ where: or(ne(schema.crmLeads.status, "WON"), gte(schema.crmLeads.updatedAt, since)), orderBy: desc(schema.crmLeads.updatedAt), limit: 600 }),
    partners(),
  ]);
  const now = Date.now();
  const list = leads
    .filter((l) => (l.status !== "LOST" || l.updatedAt >= since) && (!meus || l.ownerId === me.id))
    .map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      score: l.score,
      place: [l.category, l.neighborhood ?? l.city].filter(Boolean).join(" · "),
      owner: l.ownerId ? firstName(people.find((p) => p.id === l.ownerId)?.name ?? "—") : "Sem dono",
      follow: l.followUpAt ? fmtBr(l.followUpAt) : null,
      late: !!l.followUpAt && l.followUpAt.getTime() < now,
    }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Funil de vendas</h1>
          <p className="text-sm text-[var(--s-muted)]">Arraste os cards entre as etapas. Fechados e perdidos aparecem por 30 dias.</p>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-[var(--s-line)] text-sm font-semibold">
          <a href="/crm/funil" className={`px-3 py-2 ${!meus ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : ""}`}>Todos</a>
          <a href="/crm/funil?meus=1" className={`px-3 py-2 ${meus ? "bg-[var(--s-ink)] text-[var(--s-bg)]" : ""}`}>Meus</a>
        </div>
      </div>
      <Kanban key={meus ? "m" : "t"} initial={list} />
    </div>
  );
}
