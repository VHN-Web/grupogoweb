"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/planos", label: "Planos" },
  { href: "/admin/contratos", label: "Contratos" },
  { href: "/admin/notas", label: "Notas e recibos" },
  { href: "/admin/demos", label: "Demonstrações" },
  { href: "/admin/admins", label: "Administradores" },
  { href: "/admin/config", label: "Configurações" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
      {ITEMS.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold ${active ? "bg-[#3CC46B] text-[#0E0E10]" : "text-[#B9B3A7] hover:bg-white/10 hover:text-white"}`}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
