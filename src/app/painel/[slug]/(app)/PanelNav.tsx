"use client";
// Estrutura do painel: barra lateral agrupada por área (cada área com a sua cor), barra inferior no celular
// e uma faixa colorida no topo do conteúdo que indica em qual área o lojista está.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PanelArea } from "@/core/types";
import type { ModuleKey } from "@/core/modules";
import { Icon } from "@/components/ui/Icon";

type Group = "sales" | "catalog" | "customers" | "admin";
type Item = { href: string; es: string; pt: string; area: PanelArea; icon: string; group: Group; pro?: boolean; module?: ModuleKey };

export const GROUPS: Record<Group, { es: string; pt: string; color: string; soft: string }> = {
  sales: { es: "Ventas", pt: "Vendas", color: "#2FAE5F", soft: "#E3F5EA" },
  catalog: { es: "Catálogo", pt: "Catálogo", color: "#E0891F", soft: "#FCEEDB" },
  customers: { es: "Clientes", pt: "Clientes", color: "#1F7FD8", soft: "#E1EEFB" },
  admin: { es: "Gestión", pt: "Gestão", color: "#3F5E8C", soft: "#E6EBF3" },
};

const ITEMS: Item[] = [
  { href: "", es: "Pedidos", pt: "Pedidos", area: "orders", icon: "orders", group: "sales" },
  { href: "/caixa", es: "Caja", pt: "Caixa", area: "cash", icon: "cash", group: "sales" },
  { href: "/mesas", es: "Mesas y QR", pt: "Mesas e QR", area: "tables", icon: "qr", group: "sales" },
  { href: "/motoboys", es: "Repartidores", pt: "Motoboys", area: "couriers", icon: "bike", group: "sales" },
  { href: "/agenda", es: "Agenda", pt: "Agenda", area: "agenda", icon: "calendar", group: "sales", pro: true },
  { href: "/produtos", es: "Productos y stock", pt: "Produtos e estoque", area: "products", icon: "products", group: "catalog" },
  { href: "/aparencia", es: "Apariencia del sitio", pt: "Aparência do site", area: "appearance", icon: "palette", group: "catalog" },
  { href: "/clientes", es: "Clientes", pt: "Clientes", area: "customers", icon: "customers", group: "customers" },
  { href: "/crescimento", es: "Crecimiento", pt: "Crescimento", area: "customers", icon: "growth", group: "customers" },
  { href: "/divulgacao", es: "Divulgación", pt: "Divulgação", area: "customers", icon: "megaphone", group: "customers" },
  { href: "/marketing", es: "Marketing", pt: "Marketing", area: "marketing", icon: "tag", group: "customers", pro: true },
  { href: "/notas", es: "Facturas", pt: "Notas fiscais", area: "fiscal", icon: "receipt", group: "admin" },
  { href: "/equipe", es: "Equipo", pt: "Equipe", area: "team", icon: "team", group: "admin", pro: true, module: "equipe" },
  { href: "/config", es: "Configuración", pt: "Configurações", area: "settings", icon: "settings", group: "admin" },
  { href: "/plano", es: "Mi plan", pt: "Meu plano", area: "team", icon: "plan", group: "admin" },
];

const MOBILE_TABS = ["", "/produtos", "/clientes", "/caixa"];

type Props = {
  slug: string;
  locale: "es" | "pt";
  areas: PanelArea[];
  pro: boolean;
  modules?: ModuleKey[] | null;
  store: React.ReactNode; // nome/logo + "ver meu site"
  actions: React.ReactNode; // abrir/fechar
  footer: React.ReactNode; // sair, acessibilidade
  children: React.ReactNode;
};

export function PanelShell({ slug, locale, areas, pro, modules = null, store, actions, footer, children }: Props) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const base = `/painel/${slug}`;
  const L = (o: { es: string; pt: string }) => (locale === "pt" ? o.pt : o.es);
  const items = ITEMS.filter((i) => areas.includes(i.area) && (!i.module || !modules || modules.includes(i.module)));
  const isActive = (i: Item) => (i.href === "" ? path === base || path.startsWith(`${base}/pedidos`) : path.startsWith(base + i.href));
  const current = items.find(isActive);
  const g = GROUPS[current?.group ?? "sales"];

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = (
    <nav aria-label={locale === "pt" ? "Menu do painel" : "Menú del panel"} className="space-y-5">
      {(Object.keys(GROUPS) as Group[]).map((k) => {
        const list = items.filter((i) => i.group === k);
        if (!list.length) return null;
        return (
          <div key={k}>
            <p className="mb-1.5 flex items-center gap-2 px-3 text-[12px] font-semibold text-white/55">
              <span className="h-2 w-2 rounded-full" style={{ background: GROUPS[k].color }} aria-hidden="true" />
              {L(GROUPS[k])}
            </p>
            <ul className="space-y-0.5">
              {list.map((i) => {
                const active = isActive(i);
                return (
                  <li key={i.href}>
                    <Link
                      href={base + i.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors ${active ? "bg-white text-[#0F2747]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: active ? GROUPS[k].color : "rgba(255,255,255,.08)", color: "#fff" }}>
                        <Icon name={i.icon} size={16} />
                      </span>
                      <span className="flex-1 truncate">{L(i)}</span>
                      {i.pro && !pro && <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold">PRO</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="panel-shell min-h-dvh bg-[#F3F5F9] lg:grid lg:grid-cols-[260px_1fr]" style={{ ["--brand" as string]: "#2FAE5F", ["--brand-fg" as string]: "#FFFFFF", ["--section" as string]: g.color, ["--section-soft" as string]: g.soft }}>
      <a href="#conteudo" className="skip-link">{locale === "pt" ? "Pular para o conteúdo" : "Saltar al contenido"}</a>

      {/* Barra lateral (computador) */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-[#0F2747] px-3 py-4 text-white lg:flex">
        <div className="px-2">{store}</div>
        <div className="mt-4 px-2">{actions}</div>
        <div className="mt-6 flex-1">{nav}</div>
        <div className="mt-6 border-t border-white/10 px-2 pt-3">{footer}</div>
      </aside>

      {/* Topo (celular) */}
      <header className="no-print sticky top-0 z-30 flex items-center gap-3 bg-[#0F2747] px-4 py-2.5 text-white lg:hidden">
        <div className="min-w-0 flex-1">{store}</div>
        {actions}
        <button type="button" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10" aria-label={locale === "pt" ? "Abrir menu" : "Abrir menú"} aria-expanded={open}>
          <Icon name="menu" />
        </button>
      </header>

      {/* Menu completo (celular) */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={locale === "pt" ? "Menu" : "Menú"}>
          <button type="button" className="absolute inset-0 bg-black/50" aria-label={locale === "pt" ? "Fechar menu" : "Cerrar menú"} onClick={() => setOpen(false)} />
          <div className="anim-drawer absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-[#0F2747] px-3 py-4 text-white">
            <div className="mb-4 flex items-center justify-between px-2">
              <span className="font-semibold">Menu</span>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10" aria-label={locale === "pt" ? "Fechar menu" : "Cerrar menú"}>
                <Icon name="close" />
              </button>
            </div>
            <div className="flex-1">{nav}</div>
            <div className="mt-6 border-t border-white/10 px-2 pt-3">{footer}</div>
          </div>
        </div>
      )}

      <div className="min-w-0">
        {/* Faixa da área atual */}
        <div className="no-print relative h-28 overflow-hidden" style={{ background: "var(--section-soft)" }} aria-hidden="true">
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: "var(--section)" }} />
          <svg className="absolute -right-6 -top-6 h-48 w-48 opacity-[.12]" viewBox="0 0 24 24" fill="none" stroke="var(--section)" strokeWidth="1.2">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <p className="absolute left-5 top-5 flex items-center gap-2 text-[13px] font-semibold lg:left-8" style={{ color: "var(--section)" }}>
            {current && <Icon name={current.icon} size={16} />}
            {L(g)}
          </p>
        </div>
        <main id="conteudo" tabIndex={-1} className="panel-main relative -mt-16 px-4 pb-28 lg:px-8 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Barra inferior (celular) */}
      <nav aria-label={locale === "pt" ? "Atalhos" : "Atajos"} className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-black/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_TABS.map((h) => items.find((i) => i.href === h))
          .filter((i): i is Item => !!i)
          .slice(0, 4)
          .map((i) => {
            const active = isActive(i);
            return (
              <Link key={i.href} href={base + i.href} aria-current={active ? "page" : undefined} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold" style={{ color: active ? GROUPS[i.group].color : "#5B6474" }}>
                <Icon name={i.icon} size={22} />
                {L(i).split(" ")[0]}
              </Link>
            );
          })}
        <button type="button" onClick={() => setOpen(true)} className="col-start-5 flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-[#5B6474]">
          <Icon name="menu" size={22} />
          {locale === "pt" ? "Mais" : "Más"}
        </button>
      </nav>
    </div>
  );
}
