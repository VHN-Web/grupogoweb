import { requestCourierLang, requestCourierT } from "@/lib/courier-lang";
import { intlOf } from "@/core/courier-i18n";
import type { Metadata, Viewport } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { T } = await requestCourierT();
  const app = T("Entregas", "Entregas", "Deliveries");
  return {
    title: { default: app, template: `%s · ${app}` },
    manifest: "/entregador/manifest.webmanifest",
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: app, statusBarStyle: "black-translucent" },
    icons: { icon: "/entregador/icon-192.png", apple: "/entregador/apple-touch-icon.png" },
  };
}
export const viewport: Viewport = { themeColor: "#0E0E10", viewportFit: "cover" };

export default async function CourierLayout({ children }: { children: React.ReactNode }) {
  const lang = await requestCourierLang();
  return (
    <div lang={intlOf(lang)} className="site aff crm min-h-dvh bg-[var(--s-bg)] text-[var(--s-ink)]" style={{ ["--brand" as string]: "#2FAE5F" }}>
      {children}
    </div>
  );
}
