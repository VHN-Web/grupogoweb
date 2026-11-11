import { A11yBoot } from "@/components/a11y/A11yBoot";
import { ThemeBoot } from "@/components/theme/ThemeBoot";
import { VisitBeacon } from "@/components/analytics/VisitBeacon";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { detectLocale } from "@/core/region";
import { isSandbox } from "@/lib/sandbox";
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
        <ThemeBoot />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        {isSandbox() && (
          // prévia (homologação): deixa claro em toda tela que nada aqui é real
          <div role="status" className="keep-light sticky top-0 z-[9999] bg-[#F2C14E] px-3 py-1.5 text-center text-xs font-bold text-[#0E0E10]">
            {lang === "es" ? "AMBIENTE DE PRUEBA — nada aquí es real: no se envían mensajes ni cobros" : "AMBIENTE DE TESTE — nada aqui é real: mensagens e cobranças não saem"}
          </div>
        )}
        {children}
        <VisitBeacon />
      </body>
    </html>
  );
}
