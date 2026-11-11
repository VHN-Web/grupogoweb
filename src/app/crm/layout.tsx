import type { Metadata, Viewport } from "next";
import { CrmShell } from "@/components/crm/CrmShell";
import { ensureSeeded, requireCrm } from "@/services/crm";
import { unreadCount } from "@/services/crm-notify";

export const metadata: Metadata = {
  title: { default: "GoWeb CRM", template: "%s · GoWeb CRM" },
  manifest: "/crm/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "GoWeb CRM", statusBarStyle: "black-translucent" },
  icons: { icon: "/crm/icon-192.png", apple: "/crm/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0E0E10", viewportFit: "cover" };

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCrm();
  await ensureSeeded();
  const unread = await unreadCount(me.id).catch(() => 0);
  return <CrmShell me={me} unread={unread}>{children}</CrmShell>;
}
