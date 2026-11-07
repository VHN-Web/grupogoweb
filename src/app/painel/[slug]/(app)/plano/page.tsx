import { desc, eq } from "drizzle-orm";
import { customerCurrency, customerDocuments } from "@/services/documents";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatMinor } from "@/core/money";
import { fmtDate } from "@/core/billing";
import { invoiceUrl } from "@/services/billing";
import { planFeature, planName } from "@/core/plans";
import { ProUpsell } from "@/components/ProUpsell";
import { MODULES, MODULE_INFO, parseModulePrices, parseModules, type ModuleKey } from "@/core/modules";
import { waLink } from "@/core/intelligence";
import { getSettings } from "@/services/billing";
import type { Currency } from "@/core/types";

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

export default async function MyPlan({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ modulo?: string }> }) {
  const { slug } = await params;
  const { modulo } = await searchParams;
  const t = await requireTenantAdmin(slug, "team");
  const { T, region } = panelI18n(t);
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, t.id), with: { plan: true } });
  if (!c) return <p className="text-sm text-muted">{T("Este local no tiene un plan asociado.", "Este estabelecimento não tem plano associado.")}</p>;
  const invoices = await db.query.invoices.findMany({ where: eq(schema.invoices.customerId, c.id), orderBy: desc(schema.invoices.createdAt) });
  const cur = customerCurrency(c); // Brasil sempre em R$
  const docs = await customerDocuments(c.id);
  const price = cur === "PYG" ? c.plan.pricePyg : cur === "USD" ? c.plan.priceUsdMinor : c.plan.priceBrlMinor;
  // Plano personalizado: módulos contratados e os que dá para adicionar
  const mods = parseModules(t.modules);
  const settings = await getSettings();
  const mp = parseModulePrices(settings.modulePrices);
  const L = (m: ModuleKey) => (region.locale === "pt" ? MODULE_INFO[m].pt : MODULE_INFO[m].es);
  const blocked = modulo ? MODULES.find((m) => (modulo === "team" ? m === "equipe" : MODULE_INFO[m].areas.includes(modulo as never))) : undefined;
  const ask = (m: ModuleKey) =>
    settings.supportWhatsapp
      ? waLink(settings.supportWhatsapp, T(`Hola! Quiero agregar el módulo "${L(m)}" a ${t.name} (${slug}).`, `Olá! Quero adicionar o módulo "${L(m)}" na ${t.name} (${slug}).`))
      : `mailto:${settings.supportEmail ?? "suporte@goweboficial.com"}?subject=${encodeURIComponent(L(m))}`;

  return (
    <div className="max-w-3xl space-y-5">
      {blocked && mods && !mods.includes(blocked) && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{T(`"${L(blocked)}" no está en tu plan.`, `"${L(blocked)}" não faz parte do seu plano.`)}</p>
          <p className="mt-1">{region.locale === "pt" ? MODULE_INFO[blocked].descPt : MODULE_INFO[blocked].descEs} +{formatMinor(mp.modules[blocked][cur as Currency], cur)}/{T("mes", "mês")}.</p>
          <a href={ask(blocked)} target="_blank" rel="noopener noreferrer" className="btn-brand mt-3 inline-block px-4 py-2 text-xs">{T("Quiero agregarlo", "Quero adicionar")}</a>
        </div>
      )}
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
      {mods && MODULES.some((m) => !mods.includes(m)) && (
        <div className="card divide-y divide-line">
          <h2 className="px-4 py-3 font-semibold">{T("Módulos que podés agregar", "Módulos que você pode adicionar")}</h2>
          {MODULES.filter((m) => !mods.includes(m)).map((m) => (
            <div key={m} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="min-w-40 flex-1"><b>{L(m)}</b>{MODULE_INFO[m].pro && " ✨"}<br /><span className="text-xs text-muted">{region.locale === "pt" ? MODULE_INFO[m].descPt : MODULE_INFO[m].descEs}</span></span>
              <span className="font-semibold">+{formatMinor(mp.modules[m][cur as Currency], cur)}</span>
              <a href={ask(m)} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs">{T("Agregar", "Adicionar")}</a>
            </div>
          ))}
        </div>
      )}
      {mods ? null : t.tier === "pro" ? (
        <p className="rounded-2xl bg-gradient-to-r from-[#1F7FD8]/10 to-[#3CC46B]/10 px-5 py-4 text-sm font-semibold ring-1 ring-[#3CC46B]/40">
          GoInteligence {T("activo", "ativo")}
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
      <div className="card divide-y divide-line">
        <h2 className="px-4 py-3 font-semibold">{T("Contrato y recibos", "Contrato e recibos")}</h2>
        {docs.contracts.length === 0 && docs.receipts.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted">{T("Aparecen aquí después de cada pago.", "Aparecem aqui depois de cada pagamento.")}</p>
        )}
        {docs.contracts.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-40 flex-1">{T("Contrato", "Contrato")} {d.number}<br /><span className="text-xs text-muted">{T("aceptado el", "aceito em")} {fmtDate(d.acceptedAt)}</span></span>
            <a href={`/contrato/${d.id}`} target="_blank" className="btn-ghost px-3 py-1.5 text-xs">{T("Ver / imprimir", "Ver / imprimir")}</a>
          </div>
        ))}
        {docs.receipts.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-40 flex-1">{r.kind === "NFSE" ? T("Factura", "Nota fiscal") : T("Recibo", "Recibo")} {r.number}<br /><span className="text-xs text-muted">{r.description}</span></span>
            <b>{formatMinor(r.amountMinor, r.currency)}</b>
            <a href={`/recibo/${r.id}`} target="_blank" className="btn-ghost px-3 py-1.5 text-xs">{T("Ver", "Ver")}</a>
          </div>
        ))}
      </div>
    </div>
  );
}
