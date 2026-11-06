import { GoWebLogo, GoWebMark, BRAND } from "./GoWebLogo";

/** Tela de acesso (login) com a identidade GoWeb. */
export function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#0E0E10] px-6 py-16 text-[#F4F1EA]" style={{ ["--brand" as string]: BRAND }}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-24 opacity-[0.07]">
        <GoWebMark size={520} dark />
      </div>
      <div className="relative w-full max-w-sm">
        <GoWebLogo height={34} />
        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.22em] text-[#3CC46B]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <div className="atlas-auth mt-8">{children}</div>
      </div>
    </main>
  );
}
