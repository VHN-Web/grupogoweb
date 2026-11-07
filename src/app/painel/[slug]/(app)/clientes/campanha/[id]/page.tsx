import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatPhone } from "@/core/region";
import { SEGMENT_LABELS, type Segment } from "@/core/growth";
import { waLink } from "@/core/intelligence";
import { campaignMessage, canAutoSend } from "@/services/growth";
import { autoSendCampaign } from "../../../growth-actions";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, locale, fmtDate } = panelI18n(t);
  const c = await db.query.campaigns.findFirst({ where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.tenantId, t.id)) });
  if (!c) notFound();
  const list = JSON.parse(c.recipients) as { id: string; name: string; phone: string }[];
  const auto = canAutoSend(t);
  const seg = SEGMENT_LABELS[c.segment as Segment] ?? SEGMENT_LABELS.all;
  return (
    <div className="max-w-4xl space-y-5">
      <Link href={`/painel/${slug}/clientes`} className="text-sm text-muted">← {T("Clientes", "Clientes")}</Link>
      <div>
        <h1 className="text-xl font-bold">{c.name}</h1>
        <p className="text-sm text-muted">{locale === "pt" ? seg.pt : seg.es} · {list.length} {T("destinatarios", "destinatários")} · {fmtDate(c.createdAt)}{c.couponCode && ` · ${T("cupón", "cupom")} ${c.couponCode}`}</p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
      <div className="card whitespace-pre-wrap p-4 text-sm">{list[0] ? campaignMessage(t, c, list[0]) : c.message}</div>
      {auto ? (
        <form action={autoSendCampaign.bind(null, slug, c.id)} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>{T(`Enviados automáticamente: ${c.sentCount} de ${list.length}.`, `Enviados automaticamente: ${c.sentCount} de ${list.length}.`)}</span>
          {c.sentCount < list.length && <button className="btn-brand rounded-xl px-4 py-2 font-semibold">{T("Enviar ahora (hasta 300)", "Enviar agora (até 300)")}</button>}
        </form>
      ) : (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{T("Tocá en cada cliente: abre WhatsApp con el mensaje listo. Recomendamos hasta 30 por día para no ser bloqueado.", "Toque em cada cliente: abre o WhatsApp com a mensagem pronta. Recomendamos até 30 por dia para não ser bloqueado.")}</p>
      )}
      <div className="card divide-y divide-line">
        {list.map((r) => (
          <a key={r.id} target="_blank" rel="noopener noreferrer" href={waLink(r.phone, campaignMessage(t, c, r))} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/5">
            <span><b>{r.name}</b> <span className="text-muted">· {formatPhone(r.phone)}</span></span>
            <span className="font-semibold text-[#3CC46B]">WhatsApp →</span>
          </a>
        ))}
      </div>
    </div>
  );
}
