import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatMinor } from "@/core/money";
import { fmtDate } from "@/core/billing";
import { invoiceUrl } from "@/services/billing";
import { planFeature, planName } from "@/core/plans";
import { ProUpsell } from "@/components/ProUpsell";

export const dynamic = "force-dynamic";

const STATUS = { OPEN: ["Pendiente", "Pendente"], PAID: ["Pagada", "Paga"], CANCELLED: ["Anulada", "Cancelada"] } as const;
const CUSTOMER = {
  AWAITING_SETUP_PAYMENT: ["Esperando pago de implementación", "Aguardando pagamento da implantação"],
  IMPLEMENTING: ["En implementación", "Em implantação"],
  ACTIVE: ["Activo", "Ativo"],
  PAST_DUE: ["Pago atrasado", "Pagamento atrasado"],
  SUSPENDED: ["Suspendido", "Suspenso"],
  CANCELLED: ["Cancelado", "Cancelado"],
} as const;

export default async function MyPlan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug, "team");
  const { T, region } = panelI18n(t);
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, t.id), with: { plan: true } });
  if (!c) return <p className="text-sm text-muted">{T("Este local no tiene un plan asociado.", "Este estabelecimento não tem plano associado.")}</p>;
  const invoices = await db.query.invoices.findMany({ where: eq(schema.invoices.customerId, c.id), orderBy: desc(schema.invoices.createdAt) });
  const cur = c.preferredCurrency;
  const price = cur === "PYG" ? c.plan.pricePyg : cur === "USD" ? c.plan.priceUsdMinor : c.plan.priceBrlMinor;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="card p-5">
        <p className="text-xs text-muted">{T("Tu plan", "Seu plano")}</p>
        <p className="text-2xl font-bold">{planName(c.plan.name, region.locale)}</p>
        <p className="mt-1 text-sm">{formatMinor(price, cur)} / {c.plan.interval === "YEARLY" ? T("año", "ano") : T("mes", "mês")} · {T(CUSTOMER[c.status][0], CUSTOMER[c.status][1])}</p>
        {c.nextBillingAt && <p className="text-sm text-muted">{T("Próximo vencimiento", "Próximo vencimento")}: {fmtDate(c.nextBillingAt)}</p>}
        {c.plan.features && (
          <ul className="mt-3 space-y-1 text-sm">
            {c.plan.features.split("\n").filter(Boolean).map((f) => <li key={f}>✓ {planFeature(f, region.locale)}</li>)}
          </ul>
        )}
      </div>
      {t.tier === "pro" ? (
        <p className="rounded-2xl bg-gradient-to-r from-[#1F7FD8]/10 to-[#3CC46B]/10 px-5 py-4 text-sm font-semibold ring-1 ring-[#3CC46B]/40">
          ✨ GoInteligence {T("activo", "ativo")}
        </p>
      ) : (
        <ProUpsell locale={region.locale} />
      )}
      <div className="card divide-y divide-line">
        <h2 className="px-4 py-3 font-semibold">{T("Facturas", "Faturas")}</h2>
        {invoices.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-40 flex-1">{i.description}<br /><span className="text-xs text-muted">{T("vence", "vence")} {fmtDate(i.dueAt)}</span></span>
            <b className={i.status === "PAID" ? "text-emerald-700" : ""}>{T(STATUS[i.status][0], STATUS[i.status][1])}</b>
            {i.status === "OPEN" && <a href={invoiceUrl(i.id)} className="btn-brand px-3 py-1.5 text-xs">{T("Pagar", "Pagar")}</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
