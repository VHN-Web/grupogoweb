"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const ITEMS = [
  { href: "/afiliados", label: "Início", icon: "growth" },
  { href: "/afiliados/indicacoes", label: "Indicações", icon: "calendar" },
  { href: "/afiliados/ganhos", label: "Ganhos", icon: "cash" },
  { href: "/afiliados/ranking", label: "Ranking", icon: "star" },
  { href: "/afiliados/rede", label: "Minha rede", icon: "team" },
  { href: "/afiliados/materiais", label: "Materiais e lives", icon: "megaphone" },
  { href: "/afiliados/perfil", label: "Perfil e Pix", icon: "settings" },
];

export function AffNav({ locked }: { locked: boolean }) {
  const path = usePathname();
  const items = locked ? ITEMS.filter((i) => i.href === "/afiliados" || i.href === "/afiliados/perfil") : ITEMS;
  return (
    <nav aria-label="Portal do afiliado" className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1">
      {items.map((i) => {
        const active = i.href === "/afiliados" ? path === "/afiliados" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${active ? "bg-[#3CC46B] text-[#0E0E10]" : "text-[#B9B3A7] hover:bg-white/10 hover:text-white"}`}
          >
            <Icon name={i.icon} size={16} /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
