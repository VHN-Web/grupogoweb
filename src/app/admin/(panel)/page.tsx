import Link from "next/link";
import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { CURRENCIES, type Currency } from "@/core/types";
import { formatMinor } from "@/core/money";
import { amountIn, fmtDate } from "@/core/billing";
import { Flash } from "@/components/Flash";
import { StatusPill } from "@/components/StatusPill";
import { runCycleNow } from "./actions";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const customers = await db.query.customers.findMany({ with: { plan: true }, orderBy: desc(schema.customers.createdAt) });
  const tasks = await db.query.adminTasks.findMany({ where: eq(schema.adminTasks.done, false), with: { customer: true }, orderBy: desc(schema.adminTasks.createdAt) });
  const overdue = await db.query.invoices.findMany({ where: and(eq(schema.invoices.status, "OPEN"), lt(schema.invoices.dueAt, new Date())), with: { customer: true } });
  const recentPaid = await db.query.invoices.findMany({ where: eq(schema.invoices.status, "PAID"), with: { customer: true }, orderBy: desc(schema.invoices.paidAt), limit: 8 });

  const paying = customers.filter((c) => ["ACTIVE", "PAST_DUE"].includes(c.status));
  // Receita recorrente mensal (anual / 12), na moeda preferida de cada cliente
  const mrr: Record<Currency, number> = { PYG: 0, USD: 0, BRL: 0 };
  for (const c of paying) {
    const v = amountIn({ amountPyg: c.plan.pricePyg, amountUsdMinor: c.plan.priceUsdMinor, amountBrlMinor: c.plan.priceBrlMinor }, c.preferredCurrency);
    mrr[c.preferredCurrency] += c.plan.interval === "YEARLY" ? Math.round(v / 12) : v;
  }
  const count = (s: string[]) => customers.filter((c) => s.includes(c.status)).length;
  const implementing = customers.filter((c) => c.status === "IMPLEMENTING");
  const awaiting = customers.filter((c) => c.status === "AWAITING_SETUP_PAYMENT");

  return (
    <div className="space-y-6">
      <Flash {...sp} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat k="Clientes ativos" v={String(count(["ACTIVE"]))} />
        <Stat k="Em implantação" v={String(implementing.length)} />
        <Stat k="Em atraso / suspensos" v={`${count(["PAST_DUE"])} / ${count(["SUSPENDED"])}`} />
        <Stat k="Aguardando pagamento" v={String(awaiting.length)} />
      </div>
      <div className="card p-4">
        <p className="text-xs text-muted">Receita recorrente mensal (por moeda de pagamento)</p>
        <p className="mt-1 text-xl font-bold">
          {CURRENCIES.filter((c) => mrr[c] > 0).map((c) => formatMinor(mrr[c], c)).join("  ·  ") || "—"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-semibold">Tarefas pendentes</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {tasks.length === 0 && <li className="py-3 text-muted">Nada pendente</li>}
            {tasks.map((t) => (
              <li key={t.id} className="py-2.5">
                <Link href={`/admin/clientes/${t.customerId}`} className="font-medium hover:underline">{t.title}</Link>
                <p className="text-xs text-muted">{t.customer.businessName}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Faturas vencidas</h2>
            <form action={runCycleNow}><button className="btn-ghost px-3 py-1.5 text-xs">Rodar cobranças agora</button></form>
          </div>
          <ul className="mt-2 divide-y divide-line text-sm">
            {overdue.length === 0 && <li className="py-3 text-muted">Nenhuma</li>}
            {overdue.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-2.5">
                <Link href={`/admin/clientes/${i.customerId}`} className="hover:underline">{i.customer.businessName}</Link>
                <span className="text-red-600">venceu {fmtDate(i.dueAt)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">O ciclo roda sozinho 1x por dia (cron). Gera faturas, avisa atrasos e suspende após a tolerância.</p>
        </section>
      </div>

      <section className="card p-4">
        <h2 className="font-semibold">Últimos pagamentos</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {recentPaid.length === 0 && <li className="py-3 text-muted">Nenhum ainda</li>}
          {recentPaid.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 truncate">{i.customer.businessName} <span className="text-muted">· {i.description}</span></span>
              <b className="shrink-0">{i.paidCurrency && i.paidAmountMinor != null ? formatMinor(i.paidAmountMinor, i.paidCurrency) : "—"}</b>
            </li>
          ))}
        </ul>
      </section>

      {customers.length > 0 && (
        <section className="card divide-y divide-line">
          <h2 className="px-4 py-3 font-semibold">Clientes recentes</h2>
          {customers.slice(0, 6).map((c) => (
            <Link key={c.id} href={`/admin/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper">
              <span className="flex-1 font-medium">{c.businessName}</span>
              <span className="text-muted">{c.plan.name}</span>
              <StatusPill status={c.status} />
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{v}</p>
    </div>
  );
}
