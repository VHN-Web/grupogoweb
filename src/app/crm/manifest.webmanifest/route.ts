// Manifesto do app instalável (Android, iPhone, Windows e Mac) — sem loja de aplicativos.
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "GoWeb CRM",
      short_name: "GoWeb CRM",
      description: "Prospecção, funil e jornada dos sócios da GoWeb",
      id: "/crm",
      start_url: "/crm?app=1",
      scope: "/crm",
      display: "standalone",
      orientation: "portrait",
      background_color: "#0E0E10",
      theme_color: "#0E0E10",
      lang: "pt-BR",
      icons: [
        { src: "/crm/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/crm/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/crm/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Leads", url: "/crm/leads", icons: [{ src: "/crm/icon-192.png", sizes: "192x192" }] },
        { name: "Funil", url: "/crm/funil", icons: [{ src: "/crm/icon-192.png", sizes: "192x192" }] },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
