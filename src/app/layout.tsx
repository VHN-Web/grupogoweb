import { A11yBoot } from "@/components/a11y/A11yBoot";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { detectLocale } from "@/core/region";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const pt = detectLocale(await headers()) === "pt";
  return pt
    ? {
        title: "GoWeb — Cardápio digital, pedidos e caixa",
        description: "Seu negócio online: vitrine digital, pedidos, pagamentos por Pix e cartão, caixa e estoque em um só lugar.",
      }
    : {
        title: "GoWeb — Menú digital, pedidos y caja",
        description: "Tu negocio online: vitrina digital, pedidos, pagos, caja y stock en un solo lugar.",
      };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0E0E10",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = detectLocale(await headers()) === "pt" ? "pt-BR" : "es";
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <A11yBoot />
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
