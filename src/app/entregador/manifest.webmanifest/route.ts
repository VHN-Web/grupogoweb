// Manifesto do app do entregador — instalável pelo navegador (Android, iPhone), sem loja de apps.
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Entregas GoWeb",
      short_name: "Entregas",
      description: "App do entregador: entregas, rota, GPS ao vivo e ganhos · App del repartidor",
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
    { headers: { "content-type": "application/manifest+json" } },
  );
}
