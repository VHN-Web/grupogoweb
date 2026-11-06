"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "", es: "Pedidos", pt: "Pedidos" },
  { href: "/caixa", es: "Caja", pt: "Caixa" },
  { href: "/produtos", es: "Productos y stock", pt: "Produtos e estoque" },
  { href: "/notas", es: "Facturas", pt: "Notas fiscais" },
  { href: "/mesas", es: "Mesas y QR", pt: "Mesas e QR" },
  { href: "/aparencia", es: "Apariencia", pt: "Aparência" },
  { href: "/config", es: "Configuración", pt: "Configurações" },
  { href: "/plano", es: "Mi plan", pt: "Meu plano" },
];

export function PanelNav({ slug, locale }: { slug: string; locale: "es" | "pt" }) {
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
            {locale === "pt" ? i.pt : i.es}
          </Link>
        );
      })}
    </nav>
  );
}
