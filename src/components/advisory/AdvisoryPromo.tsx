// Chamada da Assessoria GoWeb (painel e "Meu plano"): Geovana chamando + botão em degradê. Só aparece com o
// complemento ligado e sem plano em andamento — quem decide é a página que chama (conferido no servidor).
import Link from "next/link";
import { GeovanaHero } from "@/components/geovana/Geovana";
import { Dismissible } from "./Dismissible";

export function AdvisoryPromo({ slug, locale, country, dismissible = true }: { slug: string; locale: "es" | "pt"; country: string; dismissible?: boolean }) {
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  const card = (
    <section className="relative overflow-hidden rounded-[28px] text-white" style={{ background: "linear-gradient(120deg, #1D4F91, #1F7FD8 45%, #22A8B8 75%, #3CC46B)" }}>
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_260px]">
        <div className="p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-[#3CC46B] shadow-[0_0_0_3px_rgba(255,255,255,.35)]" />
            {T("Nuevo · Asesoría GoWeb", "Novo · Assessoria GoWeb")}
          </p>
          <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl" style={{ fontFamily: "'Bricolage Grotesque', Inter, sans-serif" }}>
            {T("Tu tienda puede vender más. Yo te muestro cómo.", "Sua loja pode vender mais. Eu te mostro como.")}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white/90 sm:text-base">
            {T("Diagnóstico gratis en 1 minuto, plan mes a mes, calendario de posteos y guía de anuncios. Vos decidís cuánto invertir.", "Diagnóstico grátis em 1 minuto, plano mês a mês, calendário de posts e roteiro de anúncios. Você decide quanto investir.")}
          </p>
          <Link href={`/painel/${slug}/crescer`} className="btn-shine mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-[#1D4F91] shadow-lg transition hover:-translate-y-0.5">
            {T("Hacer mi diagnóstico gratis", "Fazer meu diagnóstico grátis")} →
          </Link>
        </div>
        <div className="mx-auto w-[220px] sm:w-[260px]">
          <GeovanaHero locale={locale} variant="advisory" country={country} />
        </div>
      </div>
    </section>
  );
  return dismissible ? (
    <Dismissible id={`advisory-promo-${slug}`} label={T("Ahora no", "Agora não")}>
      {card}
    </Dismissible>
  ) : (
    card
  );
}
