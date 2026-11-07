import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { citySlug } from "@/core/growth";
import { appUrl } from "@/lib/urls";
import { growthOf } from "@/services/growth";
import { ProBadge } from "@/components/ProUpsell";
import { saveGrowth } from "../growth-actions";

export const dynamic = "force-dynamic";

function Feature({ name, title, desc, on, locked, lockText, children }: { name: string; title: string; desc: string; on: boolean; locked?: boolean; lockText?: string; children?: React.ReactNode }) {
  return (
    <section className={`card p-5 ${locked ? "opacity-70" : ""}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name={`${name}_on`} defaultChecked={on && !locked} disabled={locked} className="mt-1 h-5 w-5 accent-[#3CC46B]" />
        <span className="flex-1">
          <span className="font-semibold">{title}</span>
          <span className="mt-0.5 block text-sm text-muted">{desc}</span>
          {locked && <span className="mt-1 block text-xs font-semibold">{lockText}</span>}
        </span>
      </label>
      {children && !locked && <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">{children}</div>}
    </section>
  );
}

export default async function CrescimentoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T } = panelI18n(t);
  const { cfg, pro } = growthOf(t);
  const lock = T("Disponible en GoInteligence", "Disponível no GoInteligence");
  const pctField = (name: string, label: string, v: number) => (
    <label className="text-sm">{label}<input name={name} defaultValue={v} inputMode="numeric" className="input mt-1" /></label>
  );
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">{T("Crecimiento", "Crescimento")}</h1>
        <p className="text-sm text-muted">{T("Herramientas para traer clientes nuevos y hacer que vuelvan. Encendé solo lo que quieras usar.", "Ferramentas para trazer clientes novos e fazer eles voltarem. Ligue só o que quiser usar.")}</p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <div className="rounded-2xl bg-black/5 p-4 text-sm">
        <b>{T("Siempre activos en tu plan:", "Sempre ativos no seu plano:")}</b> {T("cartera de clientes, origen de las ventas, kit de divulgación y tienda optimizada para Google.", "carteira de clientes, origem das vendas, kit de divulgação e loja otimizada para o Google.")}{" "}
        <Link href={`/painel/${slug}/divulgacao`} className="font-semibold underline">{T("Abrir kit", "Abrir kit")}</Link>
      </div>

      <form action={saveGrowth.bind(null, slug)} className="space-y-4">
        <Feature name="reviews" on={cfg.reviews.enabled} title={T("Pedir reseña en Google", "Pedir avaliação no Google")} desc={T("Después de entregar el pedido, mostramos un botón para reseñar (y avisamos por WhatsApp si tenés la integración).", "Depois que o pedido é finalizado, mostramos um botão para avaliar (e avisamos pelo WhatsApp se a integração estiver ligada).")}>
          <label className="text-sm sm:col-span-2">{T("Enlace de reseñas de tu ficha de Google", "Link de avaliação do seu Perfil da Empresa no Google")}<input name="googleUrl" defaultValue={cfg.reviews.googleUrl} placeholder="https://g.page/r/..." className="input mt-1" /></label>
          <p className="text-xs text-muted sm:col-span-2">{T("En Google Business Profile: «Pedir reseñas» → copiar enlace.", "No Google Perfil da Empresa: “Pedir avaliações” → copiar link.")}</p>
        </Feature>

        <Feature name="directory" on={cfg.directory.enabled} title={T("Vitrina de la ciudad", "Vitrine da cidade")} desc={T("Tu tienda aparece en la página de negocios de tu ciudad en GoWeb, junto a otros comercios.", "Sua loja aparece na página de negócios da sua cidade na GoWeb, junto com outros comércios.")}>
          <label className="text-sm">{T("Ciudad", "Cidade")}<input name="city" defaultValue={cfg.directory.city} className="input mt-1" maxLength={60} /></label>
          <label className="text-sm">{T("Categoría", "Categoria")}<input name="category" defaultValue={cfg.directory.category} placeholder={T("Hamburguesería, Pizzería…", "Hamburgueria, Pizzaria…")} className="input mt-1" maxLength={40} /></label>
          {cfg.directory.enabled && cfg.directory.city && <p className="text-xs text-muted sm:col-span-2">{`${appUrl()}/vitrine/${citySlug(cfg.directory.city)}`}</p>}
        </Feature>

        <h2 className="pt-2 font-bold">GoInteligence <ProBadge /></h2>

        <Feature name="campaigns" on={cfg.campaigns.enabled} locked={!pro} lockText={lock} title={T("Campañas de reactivación", "Campanhas de reativação")} desc={T("Mensajes con cupón para clientes que no compran hace 30/60/90 días, solo para quien aceptó recibir ofertas.", "Mensagens com cupom para quem sumiu há 30/60/90 dias, só para quem autorizou receber ofertas.")} />

        <Feature name="referral" on={cfg.referral.enabled} locked={!pro} lockText={lock} title={T("Recomendá y ganá", "Indique e ganhe")} desc={T("Cada cliente recibe su enlace. El amigo gana descuento en la primera compra y quien recomendó gana un cupón cuando el pedido se entrega.", "Cada cliente recebe um link próprio. O amigo ganha desconto na primeira compra e quem indicou ganha cupom quando o pedido for finalizado.")}>
          {pctField("friendPct", T("Descuento del amigo (%)", "Desconto do amigo (%)"), cfg.referral.friendPct)}
          {pctField("referrerPct", T("Premio de quien recomienda (%)", "Prêmio de quem indicou (%)"), cfg.referral.referrerPct)}
        </Feature>

        <Feature name="loyalty" on={cfg.loyalty.enabled} locked={!pro} lockText={lock} title={T("Tarjeta de fidelidad / cashback", "Cartão fidelidade / cashback")} desc={T("Sellos por compra (ej.: 10 = premio) o un % de vuelta como cupón. Se identifica por el WhatsApp, sin app.", "Selos por compra (ex.: 10 = prêmio) ou um % de volta em cupom. Identificado pelo WhatsApp, sem app.")}>
          <label className="text-sm sm:col-span-2">{T("Modo", "Modo")}
            <select name="loyaltyMode" defaultValue={cfg.loyalty.mode} className="input mt-1">
              <option value="stamps">{T("Sellos", "Selos")}</option>
              <option value="cashback">Cashback</option>
            </select>
          </label>
          {pctField("stamps", T("Sellos para el premio", "Selos para o prêmio"), cfg.loyalty.stamps)}
          {pctField("rewardPct", T("Premio (% de descuento)", "Prêmio (% de desconto)"), cfg.loyalty.rewardPct)}
          {pctField("cashbackPct", T("Cashback (%)", "Cashback (%)"), cfg.loyalty.cashbackPct)}
        </Feature>

        <Feature name="birthday" on={cfg.birthday.enabled} locked={!pro} lockText={lock} title={T("Cumpleaños", "Aniversário")} desc={T("Pedimos la fecha (opcional) en el checkout y el día del cumpleaños el cliente gana un cupón.", "Pedimos a data (opcional) no checkout e no dia do aniversário o cliente ganha um cupom.")}>
          {pctField("birthdayPct", T("Regalo (% de descuento)", "Presente (% de desconto)"), cfg.birthday.pct)}
        </Feature>

        <button className="btn-brand w-full rounded-xl px-4 py-3 font-semibold">{T("Guardar", "Salvar")}</button>
      </form>
    </div>
  );
}
