import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { cashReport } from "@/services/intelligence";
import { waLink } from "@/core/intelligence";
import { ProBadge, ProUpsell } from "@/components/ProUpsell";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function CashReportPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const t = await requireTenantAdmin(slug, "cash");
  const { T, fm, region } = panelI18n(t);
  if (t.tier !== "pro")
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">{T("Informe de caja", "Relatório de caixa")} <ProBadge /></h1>
        <ProUpsell locale={region.locale} />
      </div>
    );
  const r = await cashReport(t, id);
  if (!r) notFound();
  const to = t.reportTo;
  const sentLabel =
    t.reportChannel === "none" || !to
      ? T("Configurá en Configuración para recibirlo automáticamente.", "Configure em Configurações para receber automaticamente.")
      : `${T("Enviado a", "Enviado para")} ${to}`;
  return (
    <div className="max-w-3xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/painel/${slug}/caixa`} className="text-sm text-muted">← {T("Caja", "Caixa")}</Link>
        <div className="flex flex-wrap gap-2">
          {to && t.reportChannel === "whatsapp" && (
            <a href={waLink(to, r.text)} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white">WhatsApp</a>
          )}
          {to && t.reportChannel === "email" && (
            <a href={`mailto:${to}?subject=${encodeURIComponent(T("Cierre de caja", "Fechamento de caixa"))}&body=${encodeURIComponent(r.text)}`} className="btn-ghost">E-mail</a>
          )}
          <PrintButton label={T("Imprimir", "Imprimir")} />
        </div>
      </div>
      <h1 className="text-xl font-bold">{T("Informe de cierre de caja", "Relatório de fechamento de caixa")} <ProBadge /></h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <K k={T("Total facturado", "Total faturado")} v={fm(r.data.total)} />
        <K k={T("Pedidos", "Pedidos")} v={String(r.data.orders)} />
        <K k={T("Ticket promedio", "Ticket médio")} v={fm(r.data.avgTicket)} />
        <K k={T("Más vendido", "Mais vendido")} v={r.data.top ? r.data.top[0] : "—"} />
      </div>
      <pre className="card whitespace-pre-wrap p-5 font-sans text-sm leading-relaxed">{r.text}</pre>
      <p className="no-print text-xs text-muted">{sentLabel}</p>
    </div>
  );
}

function K({ k, v }: { k: string; v: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{k}</p>
      <p className="mt-0.5 truncate font-bold">{v}</p>
    </div>
  );
}
