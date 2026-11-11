import type { Metadata } from "next";
import { headers } from "next/headers";
import { detectLocale, tr, type Locale } from "@/core/region";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { H, wrap } from "@/components/site/tokens";

// Política de privacidade da GoWeb (exigida pela Meta para WhatsApp/Instagram e pela LGPD).
// Texto descreve o que o sistema faz hoje — revisar com o jurídico a cada mudança relevante.
export const metadata: Metadata = { title: "Política de privacidade — GoWeb", description: "Como a GoWeb trata dados de lojistas e de clientes das lojas." };

export default async function Privacidade({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  const T = tr(locale);
  const sections: [string, string[]][] = [
    [T("Quiénes somos", "Quem somos"), [T("GoWeb (goweboficial.com) ofrece a restaurantes y comercios un sitio con menú digital, pedidos, cobros y atención automática por WhatsApp e Instagram. Contacto: suporte@goweboficial.com.", "A GoWeb (goweboficial.com) oferece a restaurantes e comércios um site com cardápio digital, pedidos, cobranças e atendimento automático por WhatsApp e Instagram. Contato: suporte@goweboficial.com.")]],
    [T("Qué datos tratamos", "Quais dados tratamos"), [
      T("De los comercios que contratan: nombre, e-mail, WhatsApp, datos de facturación (CPF/CNPJ o RUC) y datos del comercio.", "Dos estabelecimentos que contratam: nome, e-mail, WhatsApp, dados de cobrança (CPF/CNPJ ou RUC) e dados do negócio."),
      T("De los clientes de cada tienda: nombre, teléfono, dirección de entrega y pedidos, informados por la propia persona al comprar.", "Dos clientes de cada loja: nome, telefone, endereço de entrega e pedidos, informados pela própria pessoa ao comprar."),
      T("Mensajes de WhatsApp y del Direct de Instagram enviados a una cuenta conectada a la GoWeb, para responder esas conversaciones.", "Mensagens de WhatsApp e do Direct do Instagram enviadas a uma conta conectada à GoWeb, para responder essas conversas."),
    ]],
    [T("Para qué los usamos", "Para que usamos"), [
      T("Procesar pedidos, entregas y cobros; responder mensajes con la asistente Geovana (inteligencia artificial) o con el equipo de la tienda; dar soporte; y cumplir obligaciones legales.", "Processar pedidos, entregas e cobranças; responder mensagens com a assistente Geovana (inteligência artificial) ou com a equipe da loja; dar suporte; e cumprir obrigações legais."),
      T("No vendemos datos personales ni los usamos para publicidad de terceros. Los mensajes de Instagram y WhatsApp solo se usan para responder a la persona que escribió.", "Não vendemos dados pessoais nem os usamos para publicidade de terceiros. As mensagens do Instagram e do WhatsApp só são usadas para responder a pessoa que escreveu."),
    ]],
    [T("Instagram", "Instagram"), [
      T("Usamos la API oficial de Meta, solo con autorización del titular de la cuenta profesional. Accedemos al perfil básico y a los mensajes del Direct de esa cuenta; no publicamos contenido ni leemos otros datos.", "Usamos a API oficial da Meta, só com autorização do titular da conta profissional. Acessamos o perfil básico e as mensagens do Direct dessa conta; não publicamos conteúdo nem lemos outros dados."),
      T("Solo respondemos dentro de las 24 h siguientes al último mensaje de la persona y nunca iniciamos conversaciones.", "Só respondemos dentro de 24 h após a última mensagem da pessoa e nunca iniciamos conversas."),
      T("Al desconectar la cuenta, borramos el acceso y las conversaciones guardadas de esa cuenta.", "Ao desconectar a conta, apagamos o acesso e as conversas guardadas dessa conta."),
    ]],
    [T("Con quién compartimos", "Com quem compartilhamos"), [T("Solo con proveedores necesarios para el servicio: alojamiento (Vercel), mensajería (Meta: WhatsApp e Instagram), inteligencia artificial (Google Gemini, solo el texto de la conversación necesario para responder), cobros (Asaas, Mercado Pago) y e-mail (Resend).", "Só com fornecedores necessários ao serviço: hospedagem (Vercel), mensagens (Meta: WhatsApp e Instagram), inteligência artificial (Google Gemini, só o texto da conversa necessário para responder), cobranças (Asaas, Mercado Pago) e e-mail (Resend).")]],
    [T("Seguridad y plazo", "Segurança e prazo"), [T("Las credenciales de acceso se guardan cifradas. Los registros técnicos de mensajes se borran en hasta 40 días; los datos de pedidos y facturación se guardan mientras dure la relación y por el plazo que exija la ley.", "As credenciais de acesso ficam criptografadas. Os registros técnicos de mensagens são apagados em até 40 dias; os dados de pedidos e cobrança ficam enquanto durar a relação e pelo prazo exigido por lei.")]],
    [T("Tus derechos", "Seus direitos"), [T("Podés pedir acceso, corrección o eliminación de tus datos escribiendo a suporte@goweboficial.com. Ver también la página de eliminación de datos.", "Você pode pedir acesso, correção ou exclusão dos seus dados escrevendo para suporte@goweboficial.com (direitos da LGPD). Veja também a página de exclusão de dados.")]],
  ];
  return (
    <div className="site font-sans" lang={locale === "pt" ? "pt-BR" : "es"}>
      <SiteHeader locale={locale} path="/privacidade" wa="mailto:suporte@goweboficial.com" />
      <main id="conteudo" className="bg-[var(--s-bg)] py-12 text-[var(--s-ink)]">
        <div className={`${wrap} max-w-3xl`}>
          <h1 className="text-3xl font-bold" style={{ fontFamily: H }}>{T("Política de privacidad", "Política de privacidade")}</h1>
          <p className="mt-2 text-sm text-[var(--s-muted)]">{T("Última actualización: 11/11/2026", "Última atualização: 11/11/2026")}</p>
          {sections.map(([title, ps]) => (
            <section key={title} className="mt-8">
              <h2 className="text-lg font-bold">{title}</h2>
              {ps.map((p) => <p key={p} className="mt-2 leading-relaxed">{p}</p>)}
            </section>
          ))}
          <p className="mt-8"><a className="underline" href="/exclusao-de-dados">{T("Cómo pedir la eliminación de datos", "Como pedir a exclusão de dados")}</a></p>
        </div>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
