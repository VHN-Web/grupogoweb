import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { PanelNav } from "./PanelNav";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { toggleOpen, logout } from "./actions";

export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await requireTenantAdmin(slug);
  const { T, locale } = panelI18n(tenant);
  return (
    <div style={{ ["--brand" as string]: "#3CC46B" }} className="min-h-dvh">
      <header className="no-print sticky top-0 z-20 bg-[#0E0E10] text-[#F4F1EA]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <GoWebLogo height={24} />
          <span className="h-6 w-px bg-white/15" aria-hidden="true" />
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold leading-tight">{tenant.name}</p>
            <Link href={`/${slug}`} target="_blank" className="text-xs text-[#B9B3A7] hover:underline">{T("Ver mi sitio", "Ver meu site")} ↗</Link>
          </div>
          <form action={toggleOpen.bind(null, slug)}>
            <button
              className={`btn rounded-full px-3.5 py-2 text-[13px] ${tenant.isOpen ? "bg-emerald-600 text-white" : "bg-white/10 text-[#F4F1EA]"}`}
              title={T("Abrir / cerrar para pedidos online", "Abrir / fechar para pedidos online")}
            >
              <span className={`h-2 w-2 rounded-full ${tenant.isOpen ? "bg-white" : "bg-zinc-500"}`} />
              {tenant.isOpen ? T("Abierto", "Aberto") : T("Cerrado", "Fechado")}
            </button>
          </form>
          <form action={logout.bind(null, slug)} className="hidden sm:block">
            <button className="text-xs text-[#B9B3A7] hover:underline">{T("Salir", "Sair")}</button>
          </form>
        </div>
        <PanelNav slug={slug} locale={locale} />
      </header>
      {tenant.suspended && (
        <div className="no-print bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white">
          {T("Tu servicio está suspendido por falta de pago: el menú no está visible para tus clientes.", "Seu serviço está suspenso por falta de pagamento: o cardápio não está visível para seus clientes.")}{" "}
          <Link href={`/painel/${slug}/plano`} className="underline">{T("Ver facturas y pagar", "Ver faturas e pagar")}</Link>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
