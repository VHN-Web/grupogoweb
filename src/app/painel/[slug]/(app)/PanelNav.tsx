"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "", label: "Pedidos" },
  { href: "/caixa", label: "Caja" },
  { href: "/produtos", label: "Productos y stock" },
  { href: "/notas", label: "Facturas" },
  { href: "/mesas", label: "Mesas y QR" },
  { href: "/aparencia", label: "Apariencia" },
  { href: "/config", label: "Configuración" },
  { href: "/plano", label: "Mi plan" },
];

export function PanelNav({ slug }: { slug: string }) {
  const path = usePathname();
  const base = `/painel/${slug}`;
  return (
    <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
      {ITEMS.map((i) => {
        const href = base + i.href;
        const active = i.href === "" ? path === base || path.startsWith(`${base}/pedidos`) : path.startsWith(href);
        return (
          <Link
            key={i.href}
            href={href}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${active ? "bg-[#C9A24A] text-[#0E0E10]" : "text-[#B9B3A7] hover:bg-white/10 hover:text-white"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
