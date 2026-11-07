import { requirePlatformAdmin } from "@/lib/auth";
import { AdminNav } from "./AdminNav";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { adminLogout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "GoWeb — Administração", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePlatformAdmin();
  return (
    <div className="min-h-dvh" style={{ ["--brand" as string]: "#3CC46B" }}>
      <header className="sticky top-0 z-20 bg-[#0E0E10] text-[#F4F1EA]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5">
          <GoWebLogo height={26} />
          <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] uppercase tracking-[0.18em] text-[#B9B3A7]">Admin</span>
          <div className="flex-1" />
          <span className="hidden text-xs text-[#B9B3A7] sm:inline">{me.name}</span>
          <form action={adminLogout}><button className="text-xs text-[#B9B3A7] hover:underline">Sair</button></form>
        </div>
        <AdminNav />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
