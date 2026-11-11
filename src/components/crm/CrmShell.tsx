import Link from "next/link";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CrmNav } from "./CrmNav";
import { SwRegister } from "./SwRegister";
import { CrmIsland } from "./CrmIsland";
import { Icon } from "@/components/ui/Icon";

/** Moldura do app: barra lateral no computador, abas embaixo no celular. */
/** Sininho da central de avisos com o número de não lidos. */
function Bell({ unread, className }: { unread: number; className?: string }) {
  return (
    <Link href="/crm/avisos" className={`relative grid h-10 w-10 place-items-center rounded-xl bg-white/10 ${className ?? ""}`} aria-label={unread ? `${unread} avisos novos` : "Avisos"}>
      <Icon name="bell" size={18} />
      {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#3CC46B] px-1 text-[10px] font-black text-[#0E0E10]">{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

export function CrmShell({ me, unread = 0, children }: { me: { id: string; name: string }; unread?: number; children: React.ReactNode }) {
  return (
    <div className="site aff crm min-h-dvh md:flex" style={{ ["--brand" as string]: "#2FAE5F" }}>
      <SwRegister />
      <CrmIsland />
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0E0E10] p-4 text-[#F4F1EA] md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/crm" className="flex items-center gap-2 px-2 py-2" aria-label="CRM GoWeb">
          <GoWebLogo height={26} />
          <span className="rounded-full bg-[#3CC46B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3CC46B]">CRM</span>
        </Link>
        <div className="mt-6 flex-1">
          <CrmNav variant="side" />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm">
          <span className="truncate text-[#B9B3A7]">{me.name.split(" ")[0]}</span>
          <Bell unread={unread} className="ml-auto" />
          <ThemeToggle locale="pt" variant="compact" />
        </div>
        <Link href="/admin" className="mt-2 rounded-lg px-2 py-1.5 text-xs text-[#8a857b] hover:bg-white/5">Abrir o admin completo →</Link>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-2 bg-[#0E0E10] px-4 pb-3 text-[#F4F1EA] md:hidden" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <Link href="/crm" className="flex items-center gap-2" aria-label="Início do CRM">
            <GoWebLogo height={22} />
            <span className="rounded-full bg-[#3CC46B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#3CC46B]">CRM</span>
          </Link>
          <div className="flex-1" />
          <Bell unread={unread} />
          <ThemeToggle locale="pt" variant="compact" />
          <Link href="/crm/mais" className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-sm font-bold" aria-label="Mais opções">{me.name.slice(0, 1).toUpperCase()}</Link>
        </header>
        <main id="conteudo" className="page-in mx-auto max-w-6xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8 [&_.grid>*]:min-w-0">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0E0E10]/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Navegação do CRM">
        <CrmNav variant="bottom" />
      </nav>
    </div>
  );
}
