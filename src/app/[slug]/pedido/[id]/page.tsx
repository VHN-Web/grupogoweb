import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLabels, type OrderStatus } from "@/core/types";
import { getRegion, tr } from "@/core/region";
import { parsePaymentConfig } from "@/core/tenant-config";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Receipt } from "@/components/Receipt";
import { PrintButton } from "@/components/PrintButton";
import { getTheme, themeVars } from "@/core/themes";
import { orderGrowthView } from "@/services/growth";
import { CopyLink } from "@/components/storefront/CopyLink";

export const dynamic = "force-dynamic";

const STEPS: Record<string, OrderStatus[]> = {
  DINE_IN: ["RECEIVED", "PREPARING", "READY", "COMPLETED"],
  PICKUP: ["RECEIVED", "PREPARING", "READY", "COMPLETED"],
  DELIVERY: ["RECEIVED", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"],
};

export default async function OrderPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) notFound();
  const order = await db.query.orders.findFirst({
    where: and(eq(schema.orders.id, id), eq(schema.orders.tenantId, tenant.id)),
    with: { items: true },
  });
  if (!order) notFound();

  const region = getRegion(tenant.country);
  const T = tr(region.locale);
  const LABELS = getLabels(region.locale);
  const steps = STEPS[order.type];
  const current = steps.indexOf(order.status);
  const cancelled = order.status === "CANCELLED";
  const done = order.status === "COMPLETED" || cancelled;
  const pay = parsePaymentConfig(tenant.paymentConfig);
  const g = cancelled ? null : await orderGrowthView(tenant, order).catch(() => null);

  return (
    <div style={themeVars(tenant.theme, tenant.primaryColor) as React.CSSProperties} className="th min-h-dvh">
    <link rel="stylesheet" href={getTheme(tenant.theme).fonts.google} precedence="default" />
    <div className="mx-auto max-w-xl px-5 py-8">
      {!done && <AutoRefresh ms={6000} />}
      <div className="no-print">
        <Link href={`/${slug}`} className="th-muted text-sm">← {tenant.name}</Link>
        <div className="mt-5 text-center">
          <p className="th-muted text-sm">{T("Tu número de pedido", "Número do seu pedido")}</p>
          <p className="th-h th-accent-text text-6xl font-black tracking-tight tabular-nums">{order.number}</p>
          <p className="th-muted mt-1 text-sm">
            {order.customerName}
            {order.tableLabel && ` · ${order.tableLabel}`}
          </p>
        </div>

        {cancelled ? (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">{T("Pedido cancelado", "Pedido cancelado")}</p>
        ) : (
          <ol className="mt-8 grid grid-cols-4 gap-2">
            {steps.map((s, i) => (
              <li key={s} className="text-center">
                <div className={`h-1.5 rounded-full ${i <= current ? "th-accent" : "th-surface"}`} />
                <p className={`mt-2 text-[11px] font-semibold leading-tight ${i <= current ? "" : "th-muted"}`}>
                  {LABELS.orderStatus[s]}
                </p>
              </li>
            ))}
          </ol>
        )}

        {order.paymentStatus === "PENDING" && !cancelled && (
          <div className="th-surface th-line mt-6 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">{T("Pago pendiente", "Pagamento pendente")} · {LABELS.paymentMethod[order.paymentMethod]}</p>
            <p className="th-muted mt-1">
              {order.paymentMethod === "PIX" && pay.pixKey
                ? T(`Enviá el Pix a la clave ${pay.pixKey}${pay.pixHolder ? ` (${pay.pixHolder})` : ""} y mostrá el comprobante.`, `Envie o Pix para a chave ${pay.pixKey}${pay.pixHolder ? ` (${pay.pixHolder})` : ""} e mostre o comprovante.`)
                : order.paymentMethod === "TRANSFER" && pay.bankInfo
                  ? pay.bankInfo
                  : order.paymentMethod === "CASH"
                    ? T("Pagás en efectivo al recibir o en caja.", "Você paga em dinheiro ao receber ou no caixa.")
                    : T("Pagás al recibir o en caja.", "Você paga ao receber ou no caixa.")}
            </p>
          </div>
        )}
        {order.paymentStatus === "FAILED" && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{T("El pago fue rechazado. Avisá al personal o pagá en caja.", "O pagamento foi recusado. Avise a equipe ou pague no caixa.")}</p>
        )}
        {order.paymentStatus === "PAID" && (
          <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">{T("Pago confirmado", "Pagamento confirmado")} ✓</p>
        )}

        {g?.rewards && g.rewards.length > 0 && (
          <div className="mt-6 rounded-2xl p-4 text-sm" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
            <p className="font-bold">{T("¡Tenés un regalo!", "Você ganhou um presente!")}</p>
            {g.rewards.map((r) => (
              <p key={r.code} className="mt-1">
                {T("Cupón", "Cupom")} <b className="tracking-wider">{r.code}</b> · {r.off} {T("de descuento en la próxima compra", "de desconto na próxima compra")}
                {r.until && ` · ${T("válido hasta", "válido até")} ${new Date(r.until).toLocaleDateString("pt-BR")}`}
              </p>
            ))}
          </div>
        )}
        {g?.loyalty && (
          <div className="th-surface th-line mt-6 rounded-2xl border p-4 text-sm">
            {g.loyalty.mode === "stamps" ? (
              <>
                <p className="font-semibold">{T("Tarjeta de fidelidad", "Cartão fidelidade")}: {g.loyalty.stamps}/{g.loyalty.needed}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from({ length: g.loyalty.needed }, (_, i) => (
                    <span key={i} className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i < g.loyalty!.stamps ? "th-accent" : "th-line border"}`}>{i < g.loyalty!.stamps ? "✓" : ""}</span>
                  ))}
                </div>
                <p className="th-muted mt-2">{T(`Completá y ganá ${g.loyalty.rewardPct}% de descuento. El sello se suma cuando el pedido se entrega.`, `Complete e ganhe ${g.loyalty.rewardPct}% de desconto. O selo entra quando o pedido é finalizado.`)}</p>
              </>
            ) : (
              <p className="font-semibold">{T(`Cashback: ${g.loyalty.cashbackPct}% de este pedido vuelve como cupón al entregarse.`, `Cashback: ${g.loyalty.cashbackPct}% deste pedido volta como cupom quando ele for finalizado.`)}</p>
            )}
          </div>
        )}
        {g?.referral && (
          <div className="th-surface th-line mt-6 rounded-2xl border p-4 text-sm">
            <p className="font-semibold">{T("Recomendá y ganá", "Indique e ganhe")}</p>
            <p className="th-muted mt-1">{T(`Tu amigo gana ${g.referral.friendPct}% en la primera compra y vos ganás ${g.referral.referrerPct}% cuando él compre.`, `Seu amigo ganha ${g.referral.friendPct}% na primeira compra e você ganha ${g.referral.referrerPct}% quando ele comprar.`)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="th-accent rounded-xl px-4 py-2.5 font-semibold" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(T(`¡Mirá ${tenant.name}! Con mi enlace ganás ${g.referral.friendPct}% en la primera compra: ${g.referral.link}`, `Conhece a ${tenant.name}? Com meu link você ganha ${g.referral.friendPct}% de desconto na primeira compra: ${g.referral.link}`))}`}>{T("Compartir por WhatsApp", "Compartilhar no WhatsApp")}</a>
              <CopyLink text={g.referral.link} label={T("Copiar enlace", "Copiar link")} done={T("¡Copiado!", "Copiado!")} />
            </div>
          </div>
        )}
        {g?.review && order.status === "COMPLETED" && (
          <div className="th-surface th-line mt-6 rounded-2xl border p-4 text-center text-sm">
            <p className="font-semibold">{T("¿Te gustó? Contalo en Google", "Gostou? Conte no Google")}</p>
            <p className="th-muted mt-1">{T("Tu reseña ayuda mucho a este negocio.", "Sua avaliação ajuda muito este negócio.")}</p>
            <a className="th-accent mt-3 inline-block rounded-xl px-5 py-2.5 font-semibold" target="_blank" rel="noopener noreferrer" href={g.review}>{T("Dejar reseña", "Avaliar no Google")}</a>
          </div>
        )}

        <div className="mt-8 mb-3 flex items-center justify-between">
          <h2 className="th-muted text-[13px] font-semibold uppercase tracking-[.12em]">{T("Comprobante", "Comprovante")}</h2>
          <PrintButton label={T("Imprimir / PDF", "Imprimir / PDF")} className="th-surface th-line rounded-xl border px-4 py-2.5 text-sm font-semibold" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl print:rounded-none">
        <Receipt tenant={tenant} order={order} />
      </div>
    </div>
    </div>
  );
}
