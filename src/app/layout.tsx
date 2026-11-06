import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { detectLocale } from "@/core/region";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const pt = detectLocale(await headers()) === "pt";
  return pt
    ? {
        title: "GoWeb — Cardápio digital, pedidos e caixa",
        description: "Cardápio e vitrine com QR, pedidos em tempo real, Pix, caixa e estoque para restaurantes, barbearias, perfumarias e lojas.",
      }
    : {
        title: "GoWeb — Menú digital, pedidos y caja",
        description: "Menú con QR, pedidos en tiempo real, caja multi-moneda y stock para restaurantes, bares, cafeterías y tiendas en Paraguay.",
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
    <html lang={lang}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
