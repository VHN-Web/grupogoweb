import { Icon } from "@/components/ui/Icon";
import { and, asc, desc, eq } from "drizzle-orm";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { promoActive } from "@/core/intelligence";
import { CURRENCY_SYMBOL } from "@/core/money";
import { formatPhone } from "@/core/region";
import type { Currency } from "@/core/types";
import { listAbandonedCarts } from "@/services/intelligence";
import { ProBadge, ProUpsell } from "@/components/ProUpsell";
import { contactCart, deleteCoupon, dismissCart, endFlashOffer, saveCoupon, saveFlashOffer, toggleCoupon } from "../pro-actions";

export const dynamic = "force-dynamic";

export default async function MarketingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "marketing");
  const { T, fm, fmtDate, region } = panelI18n(t);
  if (t.tier !== "pro")
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Marketing <ProBadge /></h1>
        <ProUpsell locale={region.locale} />
      </div>
    );
  const sym = CURRENCY_SYMBOL[t.currency as Currency];
  const [prods, coupons, carts] = await Promise.all([
    db.query.products.findMany({ where: and(eq(schema.products.tenantId, t.id), eq(schema.products.active, true)), orderBy: asc(schema.products.name) }),
    db.query.coupons.findMany({ where: eq(schema.coupons.tenantId, t.id), orderBy: desc(schema.coupons.createdAt) }),
    listAbandonedCarts(t.id),
  ]);
  const offers = prods.filter((p) => promoActive(p));
  const activeCoupons = coupons.filter((c) => c.active);
  const couponLabel = (c: (typeof coupons)[number]) => (c.kind === "PERCENT" ? `${c.value}%` : fm(c.value));

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-bold">Marketing <ProBadge /></h1>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      {/* Carrinhos abandonados */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="cart" size={18} className="text-[var(--section)]" />{T("Carritos abandonados", "Carrinhos abandonados")}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {T(
            "Clientes que dejaron el WhatsApp en el checkout y no terminaron el pedido (más de 30 min). Mandales un mensaje con un cupón: el link abre el carrito listo.",
            "Clientes que deixaram o WhatsApp no checkout e não finalizaram o pedido (há mais de 30 min). Mande uma mensagem com cupom: o link abre o carrinho pronto.",
          )}
        </p>
        <div className="mt-4 divide-y divide-line">
          {carts.length === 0 && <p className="py-3 text-sm text-muted">{T("Ningún carrito abandonado por ahora.", "Nenhum carrinho abandonado por enquanto.")}</p>}
          {carts.map((c) => {
            const items = JSON.parse(c.items) as { name: string; quantity: number }[];
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-48 flex-1">
                  <p className="font-semibold">
                    {c.customerName ?? "—"} <span className="font-normal text-muted">· {formatPhone(c.customerPhone)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {items.map((i) => `${i.quantity}× ${i.name}`).join(", ")} · <b className="text-ink">{fm(c.subtotalPyg)}</b> · {fmtDate(c.updatedAt)}
                  </p>
                </div>
                {c.status === "RECOVERED" ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">✓ {T("Recuperado", "Recuperado")}</span>
                ) : (
                  <form action={contactCart.bind(null, slug, c.id)} className="flex items-center gap-2">
                    <select name="couponId" className="input py-2 text-xs" style={{ width: 170 }}>
                      <option value="">{T("Sin cupón", "Sem cupom")}</option>
                      {activeCoupons.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.code} ({couponLabel(k)})
                        </option>
                      ))}
                    </select>
                    <button className="rounded-xl bg-[#25D366] px-3 py-2 text-xs font-bold text-white">
                      {c.status === "CONTACTED" ? T("Reenviar WhatsApp", "Reenviar WhatsApp") : T("Enviar WhatsApp", "Enviar WhatsApp")}
                    </button>
                  </form>
                )}
                <form action={dismissCart.bind(null, slug, c.id)}>
                  <button className="px-1 text-muted hover:text-red-600" aria-label={T("Descartar", "Descartar")}>✕</button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cupons */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="tag" size={18} className="text-[var(--section)]" />{T("Cupones de descuento", "Cupons de desconto")}</h2>
        <form action={saveCoupon.bind(null, slug)} className="mt-4 grid gap-2 sm:grid-cols-6">
          <input name="code" className="input uppercase sm:col-span-2" placeholder={T("CÓDIGO (ej: VOLVE10)", "CÓDIGO (ex: VOLTA10)")} required maxLength={24} />
          <select name="kind" className="input">
            <option value="PERCENT">%</option>
            <option value="FIXED">{sym}</option>
          </select>
          <input name="value" className="input" inputMode="decimal" placeholder={T("Valor", "Valor")} required />
          <MoneyInput name="minSubtotal" currency={t.currency as Currency} placeholder={`${T("Mínimo", "Mínimo")} ${sym}`} />
          <input name="maxUses" className="input" inputMode="numeric" placeholder={T("Usos máx.", "Usos máx.")} />
          <input name="days" className="input" inputMode="numeric" placeholder={T("Válido (días)", "Válido (dias)")} />
          <button className="btn-primary sm:col-span-5">{T("Crear cupón", "Criar cupom")}</button>
        </form>
        <ul className="mt-4 divide-y divide-line text-sm">
          {coupons.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <b className={`font-mono ${c.active ? "" : "text-muted line-through"}`}>{c.code}</b>
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-bold">-{couponLabel(c)}</span>
              <span className="flex-1 text-xs text-muted">
                {c.minSubtotal > 0 && `${T("mín.", "mín.")} ${fm(c.minSubtotal)} · `}
                {c.uses}
                {c.maxUses ? `/${c.maxUses}` : ""} {T("usos", "usos")}
                {c.expiresAt && ` · ${T("vence", "vence")} ${fmtDate(c.expiresAt, { dateStyle: "short" })}`}
              </span>
              <form action={toggleCoupon.bind(null, slug, c.id)}>
                <button className="text-xs text-muted hover:underline">{c.active ? T("Pausar", "Pausar") : T("Activar", "Ativar")}</button>
              </form>
              <form action={deleteCoupon.bind(null, slug, c.id)}>
                <button className="text-xs text-red-600 hover:underline">{T("Eliminar", "Excluir")}</button>
              </form>
            </li>
          ))}
          {coupons.length === 0 && <li className="py-2 text-muted">{T("Todavía no hay cupones.", "Ainda não há cupons.")}</li>}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {T("Compartí el link del menú con el cupón:", "Divulgue o link do cardápio com o cupom já aplicado:")} <code>/{t.slug}?cupom=CODIGO</code>
        </p>
      </section>

      {/* Ofertas relâmpago */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="clock" size={18} className="text-[var(--section)]" />{T("Oferta relámpago", "Oferta relâmpago")}</h2>
        <p className="mt-0.5 text-sm text-muted">
          {T("Precio especial por tiempo limitado, con cuenta regresiva destacada en tu sitio.", "Preço especial por tempo limitado, com contagem regressiva em destaque no seu site.")}
        </p>
        <form action={saveFlashOffer.bind(null, slug)} className="mt-4 grid gap-2 sm:grid-cols-4">
          <select name="productId" className="input sm:col-span-2" required>
            <option value="">{T("Elegí el producto", "Escolha o produto")}</option>
            {prods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {fm(p.pricePyg)}
              </option>
            ))}
          </select>
          <MoneyInput name="promoPrice" currency={t.currency as Currency} placeholder={`${T("Precio oferta", "Preço da oferta")} ${sym}`} required />
          <select name="hours" className="input" defaultValue="2">
            <option value="1">1 h</option>
            <option value="2">2 h</option>
            <option value="4">4 h</option>
            <option value="6">6 h</option>
            <option value="12">12 h</option>
            <option value="24">24 h</option>
            <option value="48">48 h</option>
            <option value="72">72 h</option>
          </select>
          <button className="btn-brand sm:col-span-4">{T("Lanzar oferta", "Lançar oferta")}</button>
        </form>
        <ul className="mt-4 divide-y divide-line text-sm">
          {offers.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <b className="flex-1">{p.name}</b>
              <span className="text-muted line-through">{fm(p.pricePyg)}</span>
              <b className="text-emerald-700">{fm(p.promoPricePyg!)}</b>
              <span className="text-xs text-muted">{T("hasta", "até")} {fmtDate(p.promoEndsAt!)}</span>
              <form action={endFlashOffer.bind(null, slug, p.id)}>
                <button className="text-xs text-red-600 hover:underline">{T("Terminar", "Encerrar")}</button>
              </form>
            </li>
          ))}
          {offers.length === 0 && <li className="py-2 text-muted">{T("Ninguna oferta activa.", "Nenhuma oferta ativa.")}</li>}
        </ul>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="sparkle" size={18} className="text-[var(--section)]" />{T("Sugerencias inteligentes", "Sugestões inteligentes")}</h2>
        <p className="mt-1 text-muted">
          {T(
            "Activas automáticamente: cuando el cliente agrega un producto, el sitio sugiere lo que más se compra junto (y, sin historial, bebidas, acompañamientos y postres).",
            "Ativas automaticamente: quando o cliente adiciona um produto, o site sugere o que mais é comprado junto (e, sem histórico, bebidas, acompanhamentos e sobremesas).",
          )}
        </p>
      </section>
    </div>
  );
}
