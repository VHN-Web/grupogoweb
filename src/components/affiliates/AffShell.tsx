import Link from "next/link";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { A11yMenu } from "@/components/a11y/A11yMenu";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { Icon } from "@/components/ui/Icon";
import { AffNav } from "./AffNav";

/** Moldura do portal: cabeçalho escuro com abas + conteúdo em claro/escuro (vars .site). */
export function AffShell({ name, status, children }: { name: string; status: "PENDING" | "ACTIVE" | "SUSPENDED"; children: React.ReactNode }) {
  return (
    <div className="site aff min-h-dvh overflow-x-clip" style={{ ["--brand" as string]: "#2FAE5F" }}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-black">Pular para o conteúdo</a>
      <RevealOnScroll />
      <A11yMenu locale="pt" variant="floating" />
      <header className="bg-[#0E0E10] text-[#F4F1EA]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link href="/afiliados" aria-label="Portal do afiliado"><GoWebLogo height={28} /></Link>
          <span className="rounded-full bg-[#3CC46B]/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#3CC46B]">Afiliados</span>
          <div className="flex-1" />
          <span className="hidden text-sm text-[#B9B3A7] sm:inline">Olá, <b className="text-white">{name.split(" ")[0]}</b></span>
          <ThemeToggle locale="pt" variant="compact" />
          <form action="/afiliados/sair" method="post">
            <button className="flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/15" aria-label="Sair">
              <Icon name="logout" size={16} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <AffNav locked={status !== "ACTIVE"} />
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 [&_.grid>*]:min-w-0">{children}</main>
    </div>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <p role={err ? "alert" : "status"} className={`anim-fade-up mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${err ? "bg-red-500/15 text-red-600 dark:text-red-300" : "bg-[var(--s-good-bg)] text-[var(--s-good-fg)]"}`}>
      {err ?? ok}
    </p>
  );
}
