// Manifesto do app do entregador — instalável pelo navegador (Android, iPhone), no idioma escolhido (pt/es/en).
import { intlOf } from "@/core/courier-i18n";
import { requestCourierT } from "@/lib/courier-lang";

export const dynamic = "force-dynamic";

export async function GET() {
  const { lang, T } = await requestCourierT();
  return Response.json(
    {
      name: T("Entregas GoWeb", "Entregas GoWeb", "GoWeb Deliveries"),
      short_name: T("Entregas", "Entregas", "Deliveries"),
      description: T("App del repartidor: entregas, ruta, GPS en vivo y ganancias", "App do entregador: entregas, rota, GPS ao vivo e ganhos", "Courier app: deliveries, route, live GPS and earnings"),
      lang: intlOf(lang),
      id: "/entregador",
      start_url: "/entregador?app=1",
      scope: "/entregador",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0E0E10",
      theme_color: "#0E0E10",
      icons: [
        { src: "/entregador/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/entregador/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/entregador/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } },
  );
}
