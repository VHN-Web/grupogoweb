import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { formatMinor } from "@/core/money";
import { fmtDate } from "@/core/billing";
import { invoiceUrl } from "@/services/billing";

export const dynamic = "force-dynamic";

const STATUS_ES = { OPEN: "Pendiente", PAID: "Pagada", CANCELLED: "Anulada" } as const;
const CUSTOMER_ES = {
  AWAITING_SETUP_PAYMENT: "Esperando pago de implementación",
  IMPLEMENTING: "En implementación",
  ACTIVE: "Activo",
  PAST_DUE: "Pago atrasado",
  SUSPENDED: "Suspendido",
  CANCELLED: "Cancelado",
} as const;

export default async function MyPlan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug);
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, t.id), with: { plan: true } });
  if (!c) return <p className="text-sm text-muted">Este local no tiene un plan asociado.</p>;
  const invoices = await db.query.invoices.findMany({ where: eq(schema.invoices.customerId, c.id), orderBy: desc(schema.invoices.createdAt) });
  const cur = c.preferredCurrency;
  const price = cur === "PYG" ? c.plan.pricePyg : cur === "USD" ? c.plan.priceUsdMinor : c.plan.priceBrlMinor;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="card p-5">
        <p className="text-xs text-muted">Tu plan</p>
        <p className="text-2xl font-bold">{c.plan.name}</p>
        <p className="mt-1 text-sm">{formatMinor(price, cur)} / {c.plan.interval === "YEARLY" ? "año" : "mes"} · {CUSTOMER_ES[c.status]}</p>
        {c.nextBillingAt && <p className="text-sm text-muted">Próximo vencimiento: {fmtDate(c.nextBillingAt)}</p>}
        {c.plan.features && (
          <ul className="mt-3 space-y-1 text-sm">
            {c.plan.features.split("\n").filter(Boolean).map((f) => <li key={f}>✓ {f}</li>)}
          </ul>
        )}
      </div>
      <div className="card divide-y divide-line">
        <h2 className="px-4 py-3 font-semibold">Facturas</h2>
        {invoices.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-40 flex-1">{i.description}<br /><span className="text-xs text-muted">vence {fmtDate(i.dueAt)}</span></span>
            <b className={i.status === "PAID" ? "text-emerald-700" : ""}>{STATUS_ES[i.status]}</b>
            {i.status === "OPEN" && <a href={invoiceUrl(i.id)} className="btn-brand px-3 py-1.5 text-xs">Pagar</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
