import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import Link from "next/link";
import { requirePanelAccess } from "@/lib/auth";
import { hasModule, parseModules } from "@/core/modules";
import { panelI18n } from "@/lib/panel-i18n";
import { PanelShell } from "./PanelNav";
import { Icon } from "@/components/ui/Icon";
import { A11yMenu } from "@/components/a11y/A11yMenu";
import { Assistant } from "@/components/assistant/Assistant";
import { assistantEnabled } from "@/services/assistant";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { toggleOpen, logout } from "./actions";
import { AutoPrinter } from "@/components/ThermalPrint";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { name: true, country: true } });
  const pt = t?.country === "BR";
  return { title: `${t?.name ?? "GoWeb"} — ${pt ? "Painel" : "Panel"} GoWeb`, robots: { index: false } };
}

export default async function PanelLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requirePanelAccess(slug);
  const tenant = access.tenant;
  const { T, locale } = panelI18n(tenant);
  const store = (
    <div className="flex min-w-0 items-center gap-3">
      {tenant.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tenant.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover ring-2 ring-white/20" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 text-lg font-black" aria-hidden="true">{tenant.name[0]}</span>
      )}
      <div className="min-w-0">
        <p className="truncate font-bold leading-tight">{tenant.name}</p>
        {access.role === "staff" ? (
          <p className="truncate text-xs text-white/60">{access.staffName}</p>
        ) : (
          <Link href={`/${slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white hover:underline">
            {T("Ver mi sitio", "Ver meu site")} <Icon name="external" size={12} />
          </Link>
        )}
      </div>
    </div>
  );
  const actions = (
    <form action={toggleOpen.bind(null, slug)}>
      <button
        className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold lg:w-full lg:justify-center lg:rounded-xl lg:py-2.5 ${tenant.isOpen ? "bg-[#2FAE5F] text-white" : "bg-white/10 text-white"}`}
        aria-label={tenant.isOpen ? T("Abierto — tocá para cerrar los pedidos online", "Aberto — toque para fechar os pedidos online") : T("Cerrado — tocá para abrir los pedidos online", "Fechado — toque para abrir os pedidos online")}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${tenant.isOpen ? "bg-white" : "bg-white/40"}`} aria-hidden="true" />
        <span className="lg:hidden">{tenant.isOpen ? T("Abierto", "Aberto") : T("Cerrado", "Fechado")}</span>
        <span className="hidden lg:inline">{tenant.isOpen ? T("Tienda abierta", "Loja aberta") : T("Tienda cerrada", "Loja fechada")}</span>
      </button>
    </form>
  );
  const footer = (
    <div className="space-y-1">
      <A11yMenu locale={locale} />
      <form action={logout.bind(null, slug)}>
        <button className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-white/80 hover:text-white">
          <Icon name="logout" size={18} /> {T("Salir", "Sair")}
        </button>
      </form>
      <div className="pt-2 opacity-70"><GoWebLogo height={18} /></div>
    </div>
  );
  return (
    <PanelShell slug={slug} locale={locale} areas={[...access.areas]} pro={tenant.tier === "pro"} modules={parseModules(tenant.modules)} store={store} actions={actions} footer={footer}>
      {tenant.suspended && (
        <div className="no-print mb-4 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white">
          {T("Tu servicio está suspendido por falta de pago: el menú no está visible para tus clientes.", "Seu serviço está suspenso por falta de pagamento: o cardápio não está visível para seus clientes.")}{" "}
          <Link href={`/painel/${slug}/plano`} className="underline">{T("Ver facturas y pagar", "Ver faturas e pagar")}</Link>
        </div>
      )}
      {/* impressão automática em qualquer tela do painel, assim que o pedido chega */}
      {access.areas.has("orders") && tenant.autoPrint && hasModule(tenant, "impressora") && (
        <div className="no-print mb-4">
          <AutoPrinter slug={slug} enabled label={T("Reimprimir", "Reimprimir")} />
        </div>
      )}
      {children}
      <Assistant slug={slug} locale={locale} enabled={assistantEnabled()} />
    </PanelShell>
  );
}
