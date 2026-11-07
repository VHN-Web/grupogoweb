import type { Metadata } from "next";
import { headers } from "next/headers";
import { detectLocale, tr, type Locale } from "@/core/region";
import { networkStores } from "@/services/network";
import { appUrl } from "@/lib/urls";
import { ShoppingClient } from "./ShoppingClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shopping GoWeb — lojas e restaurantes parceiros",
    description: "Navegue pelas lojas, restaurantes e serviços da rede GoWeb e compre direto com cada um.",
    alternates: { canonical: `${appUrl()}/shopping` },
  };
}

export default async function Shopping({ searchParams }: { searchParams: Promise<{ lang?: string; de?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  const T = tr(locale);
  const stores = await networkStores();
  const fonts = [...new Set(stores.map((s) => s.fontUrl))];
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&display=swap" precedence="default" />
      {fonts.map((f) => <link key={f} rel="stylesheet" href={f} precedence="default" />)}
      <ShoppingClient
        locale={locale}
        stores={stores}
        country={locale === "pt" ? "BR" : "PY"}
        cameFrom={sp.de ?? null}
        joinUrl={`${appUrl()}/?lang=${locale}`}
        texts={{
          title: T("Shopping GoWeb", "Shopping GoWeb"),
          h1: T("Los comercios de la red GoWeb, en un solo lugar", "Os comércios da rede GoWeb, num só lugar"),
          sub: T("Entrá en cada tienda, mirá el menú y comprá directo con el negocio, sin intermediarios.", "Entre em cada loja, veja o cardápio e compre direto com o negócio, sem intermediário."),
        }}
      />
    </>
  );
}
