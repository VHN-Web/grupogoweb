"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const MAIN = [
  { href: "/crm", label: "Hoje", icon: "home" },
  { href: "/crm/leads", label: "Leads", icon: "customers" },
  { href: "/crm/agenda", label: "Agenda", icon: "calendar" },
  { href: "/crm/notas", label: "Notas", icon: "note" },
];
const MORE = [
  { href: "/crm/lembretes", label: "Lembretes", icon: "alarm" },
  { href: "/crm/funil", label: "Funil", icon: "funnel" },
  { href: "/crm/busca", label: "Busca de leads", icon: "search" },
  { href: "/crm/acessos", label: "Acessos", icon: "growth" },
  { href: "/crm/avisos", label: "Avisos", icon: "bell" },
  { href: "/crm/equipe", label: "Equipe e metas", icon: "team" },
  { href: "/crm/ferramentas", label: "Scripts e detector", icon: "chat" },
  { href: "/crm/config", label: "App e notificações", icon: "settings" },
];

export function CrmNav({ variant }: { variant: "side" | "bottom" }) {
  const path = usePathname();
  const on = (h: string) => (h === "/crm" ? path === "/crm" : path.startsWith(h));
  if (variant === "bottom") {
    const items = [...MAIN, { href: "/crm/mais", label: "Mais", icon: "menu" }];
    const moreOn = MORE.some((m) => on(m.href)) || path.startsWith("/crm/mais");
    return (
      <ul className="grid grid-cols-5">
        {items.map((i) => {
          const active = i.href === "/crm/mais" ? moreOn : on(i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined} className={`relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] font-semibold ${active ? "text-[#3CC46B]" : "text-[#B9B3A7]"}`}>
                {active && <span className="absolute top-0 h-1 w-8 rounded-b-full bg-[#3CC46B]" aria-hidden />}
                <Icon name={i.icon} size={24} />
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <ul className="space-y-1">
      {[...MAIN, ...MORE].map((i, n) => (
        <li key={i.href}>
          {n === MAIN.length && <p className="mb-1 mt-5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6f6a62]">Mais</p>}
          <Link href={i.href} aria-current={on(i.href) ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${on(i.href) ? "bg-[#3CC46B] text-[#0E0E10]" : "text-[#C9C3B7] hover:bg-white/5 hover:text-white"}`}>
            <Icon name={i.icon} size={18} />
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
