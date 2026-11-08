import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Entregas", template: "%s · Entregas" },
  manifest: "/entregador/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Entregas", statusBarStyle: "black-translucent" },
  icons: { icon: "/entregador/icon-192.png", apple: "/entregador/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0E0E10", viewportFit: "cover" };

export default function CourierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site aff crm min-h-dvh bg-[var(--s-bg)] text-[var(--s-ink)]" style={{ ["--brand" as string]: "#2FAE5F" }}>
      {children}
    </div>
  );
}
