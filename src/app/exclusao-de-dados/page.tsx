import type { Metadata } from "next";
import { headers } from "next/headers";
import { detectLocale, tr, type Locale } from "@/core/region";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { H, wrap } from "@/components/site/tokens";

// Instruções de exclusão de dados (URL exigida pela Meta no app do Instagram/WhatsApp).
export const metadata: Metadata = { title: "Exclusão de dados — GoWeb", description: "Como pedir a exclusão dos seus dados na GoWeb." };

export default async function ExclusaoDeDados({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  const T = tr(locale);
  const steps = [
    T("Si sos dueño de una tienda: en el panel, Instagram → Desconectar borra el acceso y las conversaciones de Instagram guardadas. Para borrar toda la cuenta, escribinos.", "Se você é dono de uma loja: no painel, Instagram → Desconectar apaga o acesso e as conversas do Instagram guardadas. Para apagar a conta inteira, escreva para nós."),
    T("Si conversaste con una tienda o con la GoWeb por Instagram o WhatsApp: mandá un e-mail a suporte@goweboficial.com con tu @ de Instagram o tu número y el nombre de la tienda.", "Se você conversou com uma loja ou com a GoWeb pelo Instagram ou WhatsApp: mande um e-mail para suporte@goweboficial.com com o seu @ do Instagram ou o seu número e o nome da loja."),
    T("Confirmamos el pedido y borramos los datos en hasta 15 días, salvo lo que la ley obligue a guardar (por ejemplo, comprobantes de pago).", "Confirmamos o pedido e apagamos os dados em até 15 dias, exceto o que a lei obriga a guardar (por exemplo, comprovantes de pagamento)."),
  ];
  return (
    <div className="site font-sans" lang={locale === "pt" ? "pt-BR" : "es"}>
      <SiteHeader locale={locale} path="/exclusao-de-dados" wa="mailto:suporte@goweboficial.com" />
      <main id="conteudo" className="bg-[var(--s-bg)] py-12 text-[var(--s-ink)]">
        <div className={`${wrap} max-w-3xl`}>
          <h1 className="text-3xl font-bold" style={{ fontFamily: H }}>{T("Eliminación de datos", "Exclusão de dados")}</h1>
          <ol className="mt-6 list-decimal space-y-3 pl-5 leading-relaxed">
            {steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p className="mt-8"><a className="underline" href="/privacidade">{T("Política de privacidad", "Política de privacidade")}</a></p>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
