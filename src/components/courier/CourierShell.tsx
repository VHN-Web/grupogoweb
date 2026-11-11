import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CourierSw } from "./CourierSw";
import { NativeLangSync } from "./CourierNative";

type Tab = "home" | "ganhos" | "conta";

/** Moldura do app do entregador: topo com a loja e abas embaixo. */
export function CourierShell({ store, name, online, tab, locale, labels, children }: { store: string; name: string; online: boolean; tab: Tab; locale: "es" | "pt" | "en"; labels: { home: string; earnings: string; account: string; online: string; offline: string; install: string }; children: React.ReactNode }) {
  const tabs: { id: Tab; href: string; icon: "home" | "cash" | "settings"; label: string }[] = [
    { id: "home", href: "/entregador", icon: "home", label: labels.home },
    { id: "ganhos", href: "/entregador/ganhos", icon: "cash", label: labels.earnings },
    { id: "conta", href: "/entregador/conta", icon: "settings", label: labels.account },
  ];
  return (
    <>
      <NativeLangSync lang={locale} />
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-[#0E0E10] px-4 pb-3 text-[#F4F1EA]" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <img src="/entregador/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-bold">{store}</p>
          <p className="truncate text-xs text-[#B9B3A7]">{name}</p>
        </div>
        <CourierSw label={labels.install} />
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${online ? "bg-[#3CC46B]/20 text-[#3CC46B]" : "bg-white/10 text-[#B9B3A7]"}`}>{online ? labels.online : labels.offline}</span>
        <ThemeToggle locale={locale} variant="compact" />
      </header>
      <main id="conteudo" className="page-in mx-auto max-w-xl px-4 pb-28 pt-4 [&_.grid>*]:min-w-0">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0E0E10]/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ul className="mx-auto grid max-w-xl grid-cols-3">
          {tabs.map((t) => (
            <li key={t.id}>
              <Link href={t.href} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${tab === t.id ? "text-[#3CC46B]" : "text-[#B9B3A7]"}`} aria-current={tab === t.id ? "page" : undefined}>
                <Icon name={t.icon} size={22} />
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
