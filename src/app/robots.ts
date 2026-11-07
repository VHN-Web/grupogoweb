import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/painel", "/admin", "/api", "/fatura", "/contrato", "/recibo", "/pay", "/*/pedido/"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
