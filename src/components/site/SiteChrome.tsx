import Link from "next/link";
import { GoWebLogo, BRAND } from "@/components/brand/GoWebLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { A11yMenu } from "@/components/a11y/A11yMenu";
import { tr, type Locale } from "@/core/region";
import { INK, IVORY, MUTED, wrap } from "./tokens";

export function SiteHeader({ locale, path, wa }: { locale: Locale; path: string; wa: string }) {
  const T = tr(locale);
  const pt = locale === "pt";
  const link = (href: string, label: string) => (
    <Link href={href} className="hidden text-[15px] transition-colors hover:text-white md:inline" style={{ color: MUTED }}>{label}</Link>
  );
  return (
    <header style={{ background: INK }} className="border-b border-[#2C2C31]">
      <A11yMenu locale={locale} variant="floating" />
      <nav className={`${wrap} flex flex-wrap items-center gap-x-6 gap-y-3 py-5`} aria-label={T("Principal", "Principal")}>
        <Link href={`/?lang=${locale}`} aria-label={T("GoWeb, inicio", "GoWeb, início")}>
          <GoWebLogo height={36} />
        </Link>
        <div className="flex-1" />
        {link(`/?lang=${locale}#funciones`, T("Funciones", "Recursos"))}
        {link(`/?lang=${locale}#comparativo`, T("Comparativo", "Comparativo"))}
        {link(`/planos?lang=${locale}`, T("Planes", "Planos"))}
        {link(`/shopping?lang=${locale}`, "Shopping")}
        <ThemeToggle locale={locale} variant="compact" />
        <span className="flex overflow-hidden rounded-xl border border-[#45454B] text-[13px] font-bold">
          <a href={`${path}?lang=es`} className="px-2.5 py-2" style={{ background: pt ? "transparent" : "#2A2B2F", color: pt ? MUTED : IVORY }} aria-current={!pt ? "true" : undefined}>ES</a>
          <a href={`${path}?lang=pt`} className="px-2.5 py-2" style={{ background: pt ? "#2A2B2F" : "transparent", color: pt ? IVORY : MUTED }} aria-current={pt ? "true" : undefined}>PT</a>
        </span>
        <Link href="/painel" className="rounded-xl border border-[#45454B] px-4 py-2.5 text-[15px] font-semibold text-[#F4F1EA]">{T("Ingresar", "Entrar")}</Link>
        <a href={wa} className="rounded-xl px-4 py-2.5 text-[15px] font-bold" style={{ background: BRAND, color: INK }}>{T("Solicitar demo", "Pedir demonstração")}</a>
      </nav>
    </header>
  );
}

export function SiteFooter({ locale }: { locale: Locale }) {
  const T = tr(locale);
  return (
    <footer style={{ background: INK }} className="border-t border-[#2C2C31]">
      <div className={`${wrap} flex flex-wrap items-start justify-between gap-6 py-10 text-sm`} style={{ color: MUTED }}>
        <span className="flex flex-col gap-1.5">
          <GoWebLogo height={26} />
          <span className="text-xs font-semibold" style={{ color: "#7FB8EE" }}>{T("Clic, Conectá, Vendé.", "Clique, Conecte, Venda.")}</span>
        </span>
        <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label={T("Enlaces", "Links")}>
          <Link href={`/planos?lang=${locale}`} className="hover:text-white">{T("Planes", "Planos")}</Link>
          <Link href={`/shopping?lang=${locale}`} className="hover:text-white">Shopping GoWeb</Link>
          {locale === "pt" && <Link href="/afiliados" className="hover:text-white">Seja afiliado</Link>}
          <Link href="/vitrine" className="hover:text-white">{T("Vitrina de la ciudad", "Vitrine da cidade")}</Link>
          <Link href="/painel" className="hover:text-white">{T("Panel del comercio", "Painel do lojista")}</Link>
        </nav>
        <span className="w-full">© {new Date().getFullYear()} GoWeb · {T("Tu negocio online: vitrina, pedidos, pagos y gestión en un solo lugar", "Seu negócio online: vitrine, pedidos, pagamentos e gestão em um só lugar")}</span>
      </div>
    </footer>
  );
}
