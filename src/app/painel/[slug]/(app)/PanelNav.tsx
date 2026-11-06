"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PanelArea } from "@/core/types";

const ITEMS: { href: string; es: string; pt: string; area: PanelArea; pro?: boolean }[] = [
  { href: "", es: "Pedidos", pt: "Pedidos", area: "orders" },
  { href: "/caixa", es: "Caja", pt: "Caixa", area: "cash" },
  { href: "/produtos", es: "Productos y stock", pt: "Produtos e estoque", area: "products" },
  { href: "/agenda", es: "Agenda", pt: "Agenda", area: "agenda", pro: true },
  { href: "/marketing", es: "Marketing", pt: "Marketing", area: "marketing", pro: true },
  { href: "/notas", es: "Facturas", pt: "Notas fiscais", area: "fiscal" },
  { href: "/mesas", es: "Mesas y QR", pt: "Mesas e QR", area: "tables" },
  { href: "/aparencia", es: "Apariencia", pt: "Aparência", area: "appearance" },
  { href: "/equipe", es: "Equipo", pt: "Equipe", area: "team", pro: true },
  { href: "/config", es: "Configuración", pt: "Configurações", area: "settings" },
  { href: "/plano", es: "Mi plan", pt: "Meu plano", area: "team" },
];

export function PanelNav({ slug, locale, areas, pro }: { slug: string; locale: "es" | "pt"; areas: PanelArea[]; pro: boolean }) {
  const path = usePathname();
  const base = `/painel/${slug}`;
  return (
    <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
      {ITEMS.filter((i) => areas.includes(i.area)).map((i) => {
        const href = base + i.href;
        const active = i.href === "" ? path === base || path.startsWith(`${base}/pedidos`) : path.startsWith(href);
        return (
          <Link
            key={i.href}
            href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${active ? "bg-[#3CC46B] text-[#0E0E10]" : "text-[#B9B3A7] hover:bg-white/10 hover:text-white"}`}
          >
            {locale === "pt" ? i.pt : i.es}
            {i.pro && !pro && <span className="rounded bg-gradient-to-r from-[#1F7FD8] to-[#3CC46B] px-1 text-[9px] font-black text-white">PRO</span>}
          </Link>
        );
      })}
    </nav>
  );
}
