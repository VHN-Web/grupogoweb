import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BRAND } from "@/components/brand/GoWebLogo";
import { Icon } from "@/components/ui/Icon";
import { planFeature, planName, sortPlansByPrice } from "@/core/plans";
import { parseModulePrices } from "@/core/modules";
import { detectLocale, tr, type Locale } from "@/core/region";
import { getSettings } from "@/services/billing";
import { PlanCards } from "@/components/site/PlanCards";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { H, INK, IVORY, MUTED, wrap } from "@/components/site/tokens";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planos GoWeb — cardápio digital, pedidos e gestão",
  description: "Planos mensal, anual, GoInteligence e personalizado. Hoje você paga só a implantação; a 1ª mensalidade vence 30 dias após a entrega.",
};

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  const pt = locale === "pt";
  const T = tr(locale);
  const [settings, plans] = await Promise.all([
    getSettings(),
    db.query.plans.findMany({ where: and(eq(schema.plans.active, true), eq(schema.plans.isCustom, false)), orderBy: asc(schema.plans.sortOrder) }).then((ps) => sortPlansByPrice(ps, locale === "pt" ? "BRL" : "PYG")),
  ]);
  const mp = parseModulePrices(settings.modulePrices);
  const wa = settings.supportWhatsapp ? `https://wa.me/${settings.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(T("¡Hola! Tengo dudas sobre los planes de GoWeb.", "Olá! Tenho dúvidas sobre os planos da GoWeb."))}` : `mailto:${settings.supportEmail ?? "suporte@goweboficial.com"}`;

  // Matriz de recursos: linhas = todos os recursos citados nos planos; marca em quais planos aparece
  const lists = plans.map((p) => (p.features ?? "").split("\n").filter(Boolean).map((f) => planFeature(f, locale)));
  const rows = [...new Set(lists.flat())].filter((f) => !/^(Todo|Tudo) /i.test(f));

  return (
    <div className="site font-sans" lang={pt ? "pt-BR" : "es"}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&display=swap" precedence="default" />
      <SiteHeader locale={locale} path="/planos" wa={wa} />

      <section style={{ background: INK, color: IVORY }} className="pb-16 pt-14">
        <div className={`${wrap}`}>
          <Link href={`/?lang=${locale}`} className="text-sm hover:underline" style={{ color: MUTED }}>{T("← Volver al inicio", "← Voltar ao início")}</Link>
          <h1 style={{ fontFamily: H }} className="mt-4 max-w-3xl text-[clamp(38px,5vw,68px)] font-extrabold leading-[1.02] tracking-[-0.02em]">{T("Planes simples. Sin pagar dos veces al empezar.", "Planos simples. Sem pagar duas vezes para começar.")}</h1>
          <p className="mt-4 max-w-2xl text-lg" style={{ color: MUTED }}>{T("Al contratar pagás solo la implementación. La primera mensualidad vence 30 días después de que tu sistema está funcionando.", "Na contratação você paga só a implantação. A primeira mensalidade vence 30 dias depois que o seu sistema está funcionando.")}</p>
          <ol className="mt-10 grid gap-3 md:grid-cols-3" aria-label={T("Cómo funciona el pago", "Como funciona o pagamento")}>
            {[
              ["#2FAE5F", T("Hoy", "Hoje"), T("Pagás la implementación. Cargamos tu menú, marca y mesas.", "Você paga a implantação. Cadastramos cardápio, marca e mesas.")],
              ["#1F7FD8", T("Entrega", "Entrega"), T("Recibís el acceso al panel y empezás a vender.", "Você recebe o acesso ao painel e começa a vender.")],
              ["#9FC6F2", T("30 días después", "30 dias depois"), T("Vence la primera mensualidad. Después, una por mes.", "Vence a primeira mensalidade. Depois, uma por mês.")],
            ].map(([c, k, v], i) => (
              <li key={k} className="pay-step relative rounded-3xl border border-[#2C2C31] bg-[#141417] p-6" style={{ animationDelay: `${i * 120}ms` }}>
                <span className="grid h-11 w-11 place-items-center rounded-full text-lg font-extrabold" style={{ background: c, color: INK, fontFamily: H }}>{i + 1}</span>
                <p style={{ fontFamily: H }} className="mt-4 text-2xl font-extrabold">{k}</p>
                <p className="mt-1" style={{ color: MUTED }}>{v}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16">
        <div className={`${wrap}`}>
          <PlanCards locale={locale} plans={plans} mp={mp} />
          <ul className="mt-8 flex flex-wrap gap-x-8 gap-y-2 text-[15px] text-[var(--s-muted)]">
            {[T("Sin permanencia mínima ni multa", "Sem fidelidade e sem multa"), T("Arrepentimiento en 7 días", "Arrependimento em 7 dias"), T("Contrato digital con aceptación en línea", "Contrato digital com aceite on-line"), pt ? "Pix, cartão ou boleto" : T("Guaraníes, dólares o reales", "")].map((x) => (
              <li key={x} className="flex items-center gap-2"><Icon name="check" size={16} className="text-[#2FAE5F]" />{x}</li>
            ))}
          </ul>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="pb-20">
          <div className={`${wrap}`}>
            <h2 style={{ fontFamily: H }} className="text-[clamp(28px,3vw,40px)] font-extrabold">{T("Qué incluye cada plan", "O que cada plano inclui")}</h2>
            <div className="mt-6 overflow-x-auto rounded-3xl ring-1 ring-[var(--s-line)]">
              <table className="w-full min-w-[640px] bg-[var(--s-card)] text-[15px]">
                <thead>
                  <tr className="bg-[var(--s-soft)] text-left">
                    <th className="px-5 py-4">{T("Recurso", "Recurso")}</th>
                    {plans.map((p) => <th key={p.id} className="px-4 py-4 text-center">{planName(p.name, locale)}</th>)}
                    {mp.enabled && <th className="px-4 py-4 text-center">{T("Personalizado", "Personalizado")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--s-line)]">
                  {rows.map((f) => (
                    <tr key={f}>
                      <td className="px-5 py-3">{f}</td>
                      {plans.map((p, i) => {
                        // planos que dizem "Tudo do plano X" herdam os recursos dos anteriores
                        const inherits = lists[i].some((x) => /^(Todo|Tudo) /i.test(x));
                        const has = lists[i].includes(f) || (inherits && lists.slice(0, i).some((l) => l.includes(f)));
                        return (
                          <td key={p.id} className="px-4 py-3 text-center">
                            {has ? <Icon name="check" size={18} className="mx-auto text-[#2FAE5F]" label={T("Incluido", "Incluso")} /> : <span className="text-[var(--s-muted)]" aria-label={T("No incluido", "Não incluso")}>—</span>}
                          </td>
                        );
                      })}
                      {mp.enabled && <td className="px-4 py-3 text-center text-sm text-[var(--s-muted)]">{T("a elección", "você escolhe")}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="pb-24">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-5 rounded-[32px] p-8 md:p-12`} style={{ background: INK, color: IVORY }}>
          <div className="max-w-xl">
            <h2 style={{ fontFamily: H }} className="text-[clamp(26px,3vw,38px)] font-extrabold">{T("¿Dudas sobre qué plan elegir?", "Dúvida sobre qual plano escolher?")}</h2>
            <p className="mt-2" style={{ color: MUTED }}>{T("Te ayudamos a elegir según tu negocio. Respondemos por WhatsApp.", "A gente ajuda a escolher pelo tipo do seu negócio. Respondemos pelo WhatsApp.")}</p>
          </div>
          <a href={wa} className="rounded-2xl px-6 py-4 font-bold" style={{ background: BRAND, color: INK }}>{T("Hablar con GoWeb", "Falar com a GoWeb")}</a>
        </div>
      </section>
      <SiteFooter locale={locale} />
    </div>
  );
}
