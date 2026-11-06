import { AtlasLogo, AtlasMark } from "./AtlasLogo";

/** Tela de acesso (login) com a identidade Atlas. */
export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0E0E10] px-6 py-16 text-[#F4F1EA]" style={{ ["--brand" as string]: "#C9A24A" }}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-24 opacity-[0.06]">
        <AtlasMark size={720} ink="#F4F1EA" accent="#F4F1EA" />
      </div>
      <div className="relative w-full max-w-sm">
        <AtlasLogo height={26} />
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.22em] text-[#C9A24A]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <div className="atlas-auth mt-8">{children}</div>
      </div>
    </main>
  );
}
