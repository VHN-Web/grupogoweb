import Link from "next/link";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { Icon } from "@/components/ui/Icon";
import { LAUNCH_AT } from "@/core/launch";
import { tr, type Locale } from "@/core/region";
import { LaunchClock } from "./LaunchClock";
import { joinWaitlist } from "@/app/launch-actions";

/** Tela de lançamento (até 12/11/2026): contagem regressiva + lista de espera. */
export function LaunchPage({ locale, lista, whatsapp }: { locale: Locale; lista?: string; whatsapp: string | null }) {
  const pt = locale === "pt";
  const T = tr(locale);
  const items = pt
    ? [
        ["store", "Seu site de vendas próprio", "Cardápio ou catálogo com pedidos, Pix e cartão — sem comissão por venda."],
        ["bike", "Delivery com motoboy ao vivo", "O cliente acompanha a entrega no mapa, do preparo até a porta."],
        ["chat", "Atendimento com IA no WhatsApp", "A Geovana responde, monta o pedido e chama a equipe quando precisa."],
      ]
    : [
        ["store", "Tu propio sitio de ventas", "Menú o catálogo con pedidos y cobros, sin comisión por venta."],
        ["bike", "Delivery con repartidor en vivo", "El cliente sigue la entrega en el mapa, hasta la puerta."],
        ["chat", "Atención con IA en WhatsApp", "La Geovana responde, arma el pedido y llama al equipo si hace falta."],
      ];
  const date = new Intl.DateTimeFormat(pt ? "pt-BR" : "es-PY", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(LAUNCH_AT);
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0E0E10] font-sans text-[#F4F1EA]" lang={pt ? "pt-BR" : "es"}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&display=swap" precedence="default" />
      {/* luzes de fundo */}
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#3CC46B]/25 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-40 h-[36rem] w-[36rem] rounded-full bg-[#1F7FD8]/25 blur-[130px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:22px_22px]" />

      <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <GoWebLogo height={34} />
          <div className="flex items-center gap-3 text-xs">
            <Link href={`/?lang=${pt ? "es" : "pt"}`} className="rounded-full border border-white/15 px-3 py-1.5 text-[#B9B3A7] hover:text-white">{pt ? "Español" : "Português"}</Link>
          </div>
        </header>

        <section className="mt-12 text-center sm:mt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#3CC46B]/40 bg-[#3CC46B]/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[.2em] text-[#3CC46B]">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3CC46B] opacity-70" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#3CC46B]" /></span>
            {T("Lanzamiento oficial", "Lançamento oficial")} · {date}
          </p>
          <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }} className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
            {T("Tu negocio vendiendo online.", "Seu negócio vendendo online.")}{" "}
            <span className="bg-gradient-to-r from-[#3CC46B] to-[#1F7FD8] bg-clip-text text-transparent">{T("Falta poco.", "Falta pouco.")}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-[#B9B3A7] sm:text-lg">Clique, Conecte, Venda.</p>
          <div className="mx-auto mt-10 max-w-3xl">
            <LaunchClock to={LAUNCH_AT.toISOString()} labels={pt ? ["dias", "horas", "min", "seg"] : ["días", "horas", "min", "seg"]} />
          </div>
        </section>

        <section className="mt-14 grid gap-3 sm:grid-cols-3">
          {items.map(([icon, t, d]) => (
            <div key={t} className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#3CC46B]/15 text-[#3CC46B]"><Icon name={icon} size={20} /></span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="mt-1 text-sm text-[#B9B3A7]">{d}</p>
            </div>
          ))}
        </section>

        <section id="lista" className="mx-auto mt-14 w-full max-w-2xl scroll-mt-8 rounded-3xl border border-white/10 bg-[#F4F1EA] p-6 text-[#0E0E10] sm:p-8">
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }} className="text-2xl font-extrabold">{T("Sé de los primeros", "Seja um dos primeiros")}</h2>
          <p className="mt-1 text-sm text-[#5b574f]">{T("Dejá tu contacto y te avisamos por WhatsApp el día del lanzamiento.", "Deixe seu contato e avisamos você pelo WhatsApp no dia do lançamento.")}</p>
          {lista === "ok" ? (
            <p className="mt-5 rounded-2xl bg-[#3CC46B]/15 px-4 py-3 font-semibold text-[#1d7a41]">{T("¡Listo! Te escribimos por WhatsApp el día del lanzamiento. 🚀", "Pronto! Vamos te chamar no WhatsApp no dia do lançamento. 🚀")}</p>
          ) : (
            <form action={joinWaitlist} className="mt-5 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="lang" value={locale} />
              <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <input name="name" placeholder={T("Tu nombre", "Seu nome")} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#3CC46B]" maxLength={80} />
              <input name="business" required placeholder={T("Nombre del negocio", "Nome do negócio")} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#3CC46B]" maxLength={80} />
              <input name="phone" required inputMode="tel" placeholder={T("WhatsApp con código de área", "WhatsApp com DDD")} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#3CC46B]" maxLength={20} />
              <input name="city" placeholder={T("Ciudad", "Cidade")} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#3CC46B]" maxLength={60} />
              <button className="rounded-2xl bg-[#0E0E10] px-5 py-3.5 text-sm font-bold text-[#F4F1EA] transition hover:bg-[#1d1d22] sm:col-span-2">{T("Quiero ser avisado", "Quero ser avisado")}</button>
              {lista === "erro" && <p className="text-sm text-red-600 sm:col-span-2">{T("Revisá el nombre del negocio y el WhatsApp.", "Confira o nome do negócio e o WhatsApp.")}</p>}
              {lista === "limite" && <p className="text-sm text-red-600 sm:col-span-2">{T("Demasiados intentos. Probá más tarde.", "Muitas tentativas. Tente mais tarde.")}</p>}
            </form>
          )}
        </section>

        <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-14 text-xs text-[#8a857b]">
          {whatsapp && <a href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp</a>}
          {pt && <Link href="/afiliados" className="hover:text-white">Seja afiliado</Link>}
          <span>goweboficial.com</span>
        </footer>
      </main>
    </div>
  );
}
