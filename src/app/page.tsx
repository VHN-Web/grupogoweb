import { A11yMenu } from "@/components/a11y/A11yMenu";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { GoWebLogo, BRAND, GW_NAVY } from "@/components/brand/GoWebLogo";
import { Illustration } from "@/components/Illustration";
import { formatMinor, formatPyg } from "@/core/money";
import { THEMES, type ThemeId } from "@/core/themes";
import { getSettings } from "@/services/billing";
import { planFeature, planName } from "@/core/plans";
import { CORE_INFO, parseModulePrices } from "@/core/modules";
import { headers } from "next/headers";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { detectLocale, tr, type Locale } from "@/core/region";

export const dynamic = "force-dynamic";

const COMPARE: { k: { es: string; pt: string }; sem: { es: string; pt: string }; com: { es: string; pt: string } }[] = [
  { k: { es: "El pedido", pt: "O pedido" }, sem: { es: "El cliente manda audio por WhatsApp, alguien lo anota en papel y a veces se equivoca.", pt: "O cliente manda áudio no WhatsApp, alguém anota no papel e às vezes erra." }, com: { es: "El cliente elige en el menú y el pedido llega completo al panel y a la impresora.", pt: "O cliente escolhe no cardápio e o pedido chega completo no painel e na impressora." } },
  { k: { es: "Comisión", pt: "Comissão" }, sem: { es: "Las apps de delivery se quedan con un porcentaje de cada venta.", pt: "Os aplicativos de delivery ficam com uma porcentagem de cada venda." }, com: { es: "Mensualidad fija. Lo que paga el cliente es tuyo.", pt: "Mensalidade fixa. O que o cliente paga é seu." } },
  { k: { es: "El menú", pt: "O cardápio" }, sem: { es: "Cambió un precio: hay que reimprimir o tachar a mano.", pt: "Mudou um preço: tem que reimprimir ou riscar à mão." }, com: { es: "Cambiás el precio en el celular y el menú se actualiza al instante.", pt: "Você muda o preço no celular e o cardápio atualiza na hora." } },
  { k: { es: "El cobro", pt: "O pagamento" }, sem: { es: "Revisar transferencias en el extracto y calcular el vuelto de cabeza.", pt: "Conferir Pix no extrato e calcular o troco de cabeça." }, com: { es: "Pago registrado en cada pedido y vuelto calculado solo.", pt: "Pix, cartão e dinheiro registrados no pedido, com troco calculado." } },
  { k: { es: "El cliente", pt: "O cliente" }, sem: { es: "Compra una vez y no sabés quién es ni cómo hacer que vuelva.", pt: "Compra uma vez e você não sabe quem é nem como fazer ele voltar." }, com: { es: "Cartera con WhatsApp, cupón para volver y tarjeta de fidelidad.", pt: "Carteira com WhatsApp, cupom de volta e cartão fidelidade." } },
  { k: { es: "La entrega", pt: "A entrega" }, sem: { es: "Copiar y pegar la dirección para el repartidor y sumar las entregas a mano.", pt: "Copiar e colar o endereço para o motoboy e somar as entregas à mão." }, com: { es: "Ruta con mapa enviada en un toque y pago al repartidor ya calculado.", pt: "Rota com mapa enviada em um toque e acerto do motoboy já calculado." } },
  { k: { es: "La difusión", pt: "A divulgação" }, sem: { es: "Publicar sin saber si eso trae ventas.", pt: "Postar sem saber se aquilo traz venda." }, com: { es: "Un enlace por red y un informe de dónde viene cada venta.", pt: "Um link para cada rede e um relatório de onde vem cada venda." } },
  { k: { es: "El cierre", pt: "O fechamento" }, sem: { es: "Sumar comanda por comanda al final del día.", pt: "Somar comanda por comanda no fim do dia." }, com: { es: "Caja cerrada con total por forma de pago y lo más vendido.", pt: "Caixa fechado com total por forma de pagamento e o mais vendido." } },
];

const INK = "#0E0E10";
const IVORY = "#F4F1EA";
const MUTED = "#B9B3A7";
const H = "'Bricolage Grotesque', Inter, sans-serif";

// Lojas de demonstração criadas pelo seed (npm run db:setup)
type Demo = { slug: string; name: string; theme: ThemeId; art: string; kind: string };
// Cada país vê lojas demo do próprio país (idioma, produtos e moeda locais)
const DEMOS_PT: Demo[] = [
  { kind: "Hamburgueria", slug: "burguer-da-praca", name: "Burguer da Praça", theme: "burger", art: "burger" },
  { kind: "Barbearia", slug: "navalha", name: "Navalha", theme: "barber", art: "razor" },
  { kind: "Restaurante", slug: "cantina-da-nonna", name: "Cantina da Nonna", theme: "restaurant", art: "pizza" },
  { kind: "Informática", slug: "byte-store", name: "Byte Store", theme: "tech", art: "laptop" },
  { kind: "Padaria · Café", slug: "padaria-aurora", name: "Padaria Aurora", theme: "cafe", art: "coffee" },
  { kind: "Perfumaria", slug: "essenza", name: "Essenza", theme: "perfume", art: "perfume" },
  { kind: "Loja de roupas", slug: "kira-br", name: "KIRA", theme: "store", art: "dress" },
  { kind: "Bar · Cervejaria", slug: "boteco-lupulo", name: "Boteco Lúpulo", theme: "bar", art: "beer" },
];
const DEMOS_ES: Demo[] = [
  { kind: "Hamburguesería", slug: "brasa-burger", name: "Brasa Burger", theme: "burger", art: "burger" },
  { kind: "Barbería", slug: "barberia-filo", name: "Barbería Filo", theme: "barber", art: "razor" },
  { kind: "Restaurante", slug: "nonna-lucia", name: "Nonna Lucía", theme: "restaurant", art: "pizza" },
  { kind: "Informática", slug: "tecnoplus", name: "TecnoPlus", theme: "tech", art: "laptop" },
  { kind: "Cafetería", slug: "cafe-morena", name: "Café Morena", theme: "cafe", art: "coffee" },
  { kind: "Perfumería", slug: "esencia", name: "Esencia", theme: "perfume", art: "perfume" },
  { kind: "Tienda de ropa", slug: "kira", name: "KIRA", theme: "store", art: "dress" },
  { kind: "Bar · Cervecería", slug: "lupulo", name: "Lúpulo", theme: "bar", art: "beer" },
];

const FEATURES_ES = [
  { icon: "qr", t: "Menú con QR por mesa", d: "Cada mesa tiene su código. El cliente escanea, elige y pide sin descargar nada." },
  { icon: "bell", t: "Pedidos en tiempo real", d: "Cocina y caja ven cada pedido al instante, con número, mesa y nombre del cliente." },
  { icon: "cash", t: "Caja multi-moneda", d: "Cobrá en guaraníes, dólares o reales con tu cotización del día. El vuelto se calcula solo." },
  { icon: "box", t: "Control de stock", d: "Los productos se descuentan con cada venta y se marcan como agotados automáticamente." },
  { icon: "route", t: "Delivery con distancia", d: "La tarifa se recalcula según la ubicación del cliente, con radio máximo y envío gratis." },
  { icon: "doc", t: "Comprobantes y facturas", d: "Comprobante automático en cada pedido y registro de facturas. Preparado para SIFEN." },
  { icon: "users", t: "Cartera de clientes", d: "Cada cliente queda guardado con sus compras. Sabé de dónde viene cada venta: Instagram, WhatsApp, Google o volante." },
  { icon: "star", t: "Más clientes desde Google", d: "Tienda optimizada para Google, kit con QR y artes listas, pedido de reseña y Vitrina de la ciudad." },
  { icon: "gift", t: "Clientes que vuelven", d: "En GoInteligence: campañas con cupón, recomendá y ganá, tarjeta de fidelidad/cashback y cupón de cumpleaños." },
];
const FEATURES_PT = [
  { icon: "qr", t: "Cardápio com QR por mesa", d: "Cada mesa tem seu código. O cliente escaneia, escolhe e pede sem baixar nada." },
  { icon: "bell", t: "Pedidos em tempo real", d: "Cozinha e caixa veem cada pedido na hora, com número, mesa e nome do cliente." },
  { icon: "cash", t: "Caixa e Pix", d: "Receba por Pix, cartão ou dinheiro. Fechamento de caixa com troco calculado automaticamente." },
  { icon: "box", t: "Controle de estoque", d: "Os produtos são baixados a cada venda e marcados como esgotados automaticamente." },
  { icon: "route", t: "Delivery por distância", d: "A taxa é recalculada pela localização do cliente, com raio máximo e frete grátis." },
  { icon: "doc", t: "Comprovantes e notas", d: "Comprovante automático em cada pedido e registro das notas fiscais emitidas e recebidas." },
  { icon: "users", t: "Carteira de clientes", d: "Cada cliente fica salvo com o histórico de compras. Saiba de onde vem cada venda: Instagram, WhatsApp, Google ou panfleto." },
  { icon: "star", t: "Mais clientes pelo Google", d: "Loja otimizada para o Google, kit com QR e artes prontas, pedido de avaliação e Vitrine da cidade." },
  { icon: "gift", t: "Clientes que voltam", d: "No GoInteligence: campanhas com cupom, indique e ganhe, cartão fidelidade/cashback e cupom de aniversário." },
];

const ICONS: Record<string, React.ReactNode> = {
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.8 3.1 2.6 3.5 5.2" /></>),
  star: (<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />),
  gift: (<><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5C10 4 6.5 4.5 7 7c.3 1.4 2.5 1.5 5 1.5ZM12 8.5c2-4.5 5.5-4 5-1.5-.3 1.4-2.5 1.5-5 1.5Z" /></>),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </>
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  box: (
    <>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
};

const FAQ_PT = [
  ["Meus clientes precisam baixar um app?", "Não. Eles escaneiam o QR com a câmera e o cardápio abre no navegador do celular."],
  ["Funciona para barbearia, perfumaria e loja de informática?", "Sim. Tem modelos prontos para hamburguerias, restaurantes, cafeterias, bares, barbearias, perfumarias, lojas de roupa e de tecnologia."],
  ["Quem cadastra o cardápio ou os produtos?", "Nós fazemos a implantação: cadastramos seus produtos, logo, cores e mesas."],
  ["Posso usar meu próprio domínio?", "Sim. No plano anual o domínio está incluso; no mensal é um adicional."],
  ["Como recebo os pagamentos?", "Pix, cartão na maquininha ou dinheiro — você escolhe o que aceita no painel."],
];

const FAQ_ES = [
  ["¿Mis clientes tienen que descargar una app?", "No. Escanean el QR con la cámara y el menú abre en el navegador del celular."],
  ["¿Puedo cobrar en dólares y reales?", "Sí. Definís la cotización del día y el sistema convierte el total y calcula el vuelto en guaraníes."],
  ["¿Quién carga el menú?", "Nosotros hacemos la implementación: cargamos tu menú, tu logo, tus colores y tus mesas."],
  ["¿Puedo usar mi propio dominio?", "Sí. En el plan anual el dominio está incluido; en el mensual se agrega como adicional."],
  ["¿Sirve para tiendas, no solo restaurantes?", "Sí. Hay modelos para hamburgueserías, restaurantes, cafeterías, bares, barberías, perfumerías, tiendas de ropa y de informática."],
];

const wrap = "mx-auto w-full max-w-[1200px] px-6 sm:px-8";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  const pt = locale === "pt";
  const T = tr(locale);
  const FEATURES = pt ? FEATURES_PT : FEATURES_ES;
  const FAQ = pt ? FAQ_PT : FAQ_ES;
  const DEMOS = pt ? DEMOS_PT : DEMOS_ES;
  const [settings, plans] = await Promise.all([
    getSettings(),
    db.query.plans.findMany({ where: and(eq(schema.plans.active, true), eq(schema.plans.isCustom, false)), orderBy: asc(schema.plans.sortOrder) }),
  ]);
  const mp = parseModulePrices(settings.modulePrices);
  const wa = settings.supportWhatsapp ? `https://wa.me/${settings.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(T("¡Hola! Quiero conocer GoWeb para mi negocio.", "Olá! Quero conhecer a GoWeb para o meu negócio."))}` : "#planes";

  return (
    <div style={{ background: IVORY, color: INK }} className="font-sans" lang={pt ? "pt-BR" : "es"}>
      <A11yMenu locale={pt ? "pt" : "es"} variant="floating" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Anton&display=swap" precedence="default" />

      {/* NAV */}
      <header style={{ background: INK }} className="border-b border-[#2C2C31]">
        <nav className={`${wrap} flex flex-wrap items-center gap-x-7 gap-y-3 py-5`}>
          <Link href="/" aria-label={T("GoWeb, inicio", "GoWeb, início")}>
            <GoWebLogo height={38} />
          </Link>
          <div className="flex-1" />
          <a href="#modelos" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>{T("Modelos", "Modelos")}</a>
          <a href="#funciones" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>{T("Funciones", "Recursos")}</a>
          <a href="#comparativo" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>{T("Comparativo", "Comparativo")}</a>
          <a href="#planes" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>{T("Planes", "Planos")}</a>
          <span className="flex overflow-hidden rounded-xl border border-[#45454B] text-[13px] font-bold">
            <a href="?lang=es" className="px-2.5 py-2" style={{ background: pt ? "transparent" : "#2A2B2F", color: pt ? MUTED : IVORY }}>ES</a>
            <a href="?lang=pt" className="px-2.5 py-2" style={{ background: pt ? "#2A2B2F" : "transparent", color: pt ? IVORY : MUTED }}>PT</a>
          </span>
          <Link href="/painel" className="rounded-xl border border-[#45454B] px-4 py-2.5 text-[15px] font-semibold text-[#F4F1EA]">{T("Ingresar", "Entrar")}</Link>
          <a href={wa} className="rounded-xl px-4 py-2.5 text-[15px] font-bold" style={{ background: BRAND, color: INK }}>{T("Solicitar demo", "Pedir demonstração")}</a>
        </nav>
      </header>

      {/* HERO */}
      <section style={{ background: INK, color: IVORY }} className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="anim-blob absolute -left-24 top-10 h-[380px] w-[380px] rounded-full opacity-25 blur-3xl" style={{ background: "#1F7FD8" }} />
          <div className="anim-blob absolute right-[-120px] top-[30%] h-[420px] w-[420px] rounded-full opacity-20 blur-3xl" style={{ background: BRAND, animationDelay: "-6s" }} />
        </div>
        <div className={`${wrap} relative flex flex-wrap items-center gap-14 pb-24 pt-16 sm:pt-20`}>
          <div className="stagger flex min-w-0 flex-[1_1_480px] flex-col gap-7">
            <span className="text-[13px] font-semibold uppercase tracking-[0.22em]" style={{ color: BRAND }}>{T("Restaurantes · Bares · Barberías · Tiendas", "Restaurantes · Barbearias · Perfumarias · Lojas")}</span>
            <h1 style={{ fontFamily: H }} className="text-[clamp(42px,5.4vw,76px)] font-extrabold leading-[1.02] tracking-[-0.025em]">
              {T("Tu negocio,", "Seu negócio,")}
              <br />
              {T("bajo control total.", "sob controle total.")}
            </h1>
            <p className="max-w-[540px] text-[19px] leading-relaxed" style={{ color: MUTED }}>
              {T(
                "Menú con QR, pedidos en tiempo real, caja multi-moneda y stock. Un sitio con la cara de tu marca, sin instalar nada.",
                "Cardápio e vitrine com QR, pedidos em tempo real, caixa, Pix e estoque. Um site com a cara da sua marca, sem instalar nada.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={wa} className="btn-shine rounded-2xl px-6 py-4 text-[17px] font-bold transition hover:-translate-y-0.5" style={{ background: BRAND, color: INK }}>{T("Quiero GoWeb en mi negocio", "Quero a GoWeb no meu negócio")}</a>
              <a href="#modelos" className="rounded-2xl border border-[#45454B] px-6 py-4 text-[17px] font-semibold transition hover:-translate-y-0.5 hover:border-[#6A6A72]">{T("Ver modelos en vivo", "Ver modelos ao vivo")}</a>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm" style={{ color: MUTED }}>
              <span>{T("✓ Guaraníes, dólares y reales", "✓ Pix, cartão e dinheiro")}</span>
              <span>{T("✓ Sin app: solo QR", "✓ Sem app: só QR")}</span>
              <span>{T("✓ Implementación incluida", "✓ Implantação inclusa")}</span>
            </div>
          </div>

          {/* Mock: celular + cartões */}
          <div className="relative h-[600px] min-w-0 flex-[1_1_420px]" aria-hidden="true">
            <div className="absolute left-1/2 top-0 h-[600px] w-[300px] -translate-x-1/2"><div className="anim-float h-full w-full"><div className="anim-pop-in h-full w-full rounded-[46px] bg-[#2A2B2F] p-2.5 shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
              <div className="flex h-full w-full flex-col overflow-hidden rounded-[37px] bg-[#121212] text-white">
                <div className="relative h-[190px] overflow-hidden bg-[#E63946]">
                  <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(-45deg, rgba(0,0,0,.08) 0 12px, transparent 12px 24px)" }} />
                  <div className="absolute -right-6 top-8"><Illustration name="burger" size={170} /></div>
                  <div className="relative flex w-[140px] flex-col gap-1 pl-4 pt-10">
                    <span className="-rotate-3 self-start rounded bg-[#FFC20E] px-2 py-0.5 text-[10px] font-extrabold text-black">PROMO</span>
                    <span className="text-[30px] uppercase leading-[0.95]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>{T("Combo doble", "Combo duplo")}</span>
                    <span className="text-lg text-[#FFC20E]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>{T("Gs. 59.000", "R$ 39,90")}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {[
                    ["burger", T("Doble Brasa", "Duplo Smash"), T("Gs. 52.000", "R$ 34,90")],
                    ["fries", T("Papas Brasa", "Batata Brasa"), T("Gs. 18.000", "R$ 14,90")],
                    ["soda", T("Gaseosa", "Refrigerante"), T("Gs. 9.000", "R$ 7,00")],
                  ].map(([a, n, p]) => (
                    <div key={n} className="flex items-center gap-3 rounded-2xl bg-[#1E1E1E] p-2.5">
                      <span className="grid h-14 w-14 place-items-center rounded-xl bg-[#2A2416]"><Illustration name={a} size={48} /></span>
                      <span className="flex flex-1 flex-col"><b className="text-sm uppercase" style={{ fontFamily: "Anton, Impact, sans-serif", fontWeight: 400 }}>{n}</b><span className="text-[13px] font-bold text-[#FFC20E]">{p}</span></span>
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#FFC20E] font-bold text-black">+</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto m-3 flex justify-between rounded-2xl bg-[#FFC20E] px-4 py-3 text-sm font-extrabold text-black"><span>{T("Ver pedido · 2", "Ver pedido · 2")}</span><span>{T("Gs. 70.000", "R$ 49,80")}</span></div>
              </div>
            </div></div></div>
            <div className="anim-pop-in absolute left-0 top-16 w-[230px]" style={{ animationDelay: ".5s" }}><div className="anim-float-alt flex flex-col gap-1.5 rounded-[18px] bg-white p-4 text-[#0E0E10] shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
              <span className="text-xs text-[#6A655C]">{T("Nuevo pedido · Mesa 4", "Novo pedido · Mesa 4")}</span>
              <span style={{ fontFamily: H }} className="text-3xl font-extrabold">#4821</span>
              <span className="text-[13px]">{T("1× Doble Brasa · 1× Papas", "1× Duplo Smash · 1× Batata")}</span>
              <div className="mt-1 flex items-center justify-between"><b className="text-sm">{T("US$ 9,60", "R$ 49,80")}</b><span className="rounded-full bg-[#DDEFE7] px-2.5 py-1 text-[11px] font-bold text-[#1F6F55]">{T("Pagado", "Pago · Pix")}</span></div>
            </div></div>
            <div className="anim-pop-in absolute bottom-16 right-0 w-[230px]" style={{ animationDelay: ".8s" }}><div className="anim-float flex flex-col gap-2.5 rounded-[18px] border border-[#3A3A40] bg-[#2A2B2F] p-4 text-[13px] text-[#F4F1EA] shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
              <span className="text-xs" style={{ color: MUTED }}>{T("Caja de hoy (ejemplo)", "Caixa de hoje (exemplo)")}</span>
              {(pt
                ? [["Pix", "R$ 1.840,00"], ["Cartão", "R$ 960,00"], ["Dinheiro", "R$ 310,00"]]
                : [["Guaraníes", "Gs. 1.840.000"], ["Dólares", "US$ 120,00"], ["Reales", "R$ 310,00"]]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span>{k}</span><b>{v}</b></div>
              ))}
            </div></div>
          </div>
        </div>
      </section>

      {/* MODELOS */}
      <section id="modelos" className="py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <SectionTitle eyebrow={T("Modelos", "Modelos")} title={T("Un sitio con la cara de tu negocio.", "Um site com a cara do seu negócio.")} sub={T("Elegí el modelo, tu logo y tus colores. Tocá uno para probarlo en vivo.", "Escolha o modelo, seu logo e suas cores. Toque em um para testar ao vivo.")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {DEMOS.map((d, i) => {
              const th = THEMES[d.theme];
              return (
                <Link key={d.slug} href={`/${d.slug}`} data-reveal style={{ "--d": `${(i % 4) * 0.07}s` } as React.CSSProperties} className="lift group overflow-hidden rounded-3xl border border-[#DDD6C8] bg-white">
                  <div className="relative h-52 overflow-hidden" style={{ background: th.colors.heroBg }}>
                    <div className="absolute -bottom-4 -right-6 transition group-hover:scale-105"><Illustration name={d.art} size={170} /></div>
                    <span
                      className={`absolute left-4 top-4 text-[26px] leading-none ${th.fonts.headingUpper ? "uppercase" : "font-bold"} ${th.fonts.headingItalic ? "italic" : ""}`}
                      style={{ fontFamily: th.fonts.heading, color: th.colors.heroFg }}
                    >
                      {d.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-semibold">{d.kind}</span>
                    <span className="text-sm font-semibold" style={{ color: GW_NAVY }}>{T("Ver →", "Ver →")}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* FUNCIONES */}
      <section id="funciones" style={{ background: INK }} className="py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <SectionTitle dark eyebrow={T("Funciones", "Recursos")} title={T("Todo lo que tu local necesita. Nada que sobre.", "Tudo o que o seu negócio precisa. Nada sobrando.")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
            {FEATURES.map((f, i) => (
              <div key={f.t} data-reveal style={{ "--d": `${(i % 3) * 0.08}s` } as React.CSSProperties} className="flex flex-col gap-3.5 rounded-3xl border border-[#2C2C31] bg-[#141417] p-7 transition-colors duration-300 hover:border-[#3CC46B]/60">
                <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#1F1F23" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[f.icon]}
                  </svg>
                </span>
                <h3 style={{ fontFamily: H }} className="text-[22px] font-bold text-[#F4F1EA]">{f.t}</h3>
                <p className="text-[15.5px] leading-relaxed" style={{ color: MUTED }}>{f.d}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8 pt-6">
            {(pt
              ? [
                  ["01", "A gente configura pra você", "Cadastramos seus produtos, sua marca e suas mesas. Você só revisa."],
                  ["02", "Você imprime seus QR", "Um por mesa e um geral para Instagram, WhatsApp e balcão."],
                  ["03", "Começa a vender", "Os pedidos chegam no painel; caixa e estoque se atualizam sozinhos."],
                ]
              : [
                  ["01", "Lo configuramos por vos", "Cargamos tu menú, tu marca y tus mesas. Vos solo revisás."],
                  ["02", "Imprimís tus QR", "Uno por mesa y uno general para Instagram, WhatsApp y el mostrador."],
                  ["03", "Empezás a vender", "Los pedidos llegan al panel; la caja y el stock se actualizan solos."],
                ]
            ).map(([n, t, d]) => (
              <div key={n} data-reveal className="flex flex-col gap-3 border-t-2 pt-5" style={{ borderColor: BRAND, "--d": `${(Number(n) - 1) * 0.1}s` } as React.CSSProperties}>
                <span style={{ fontFamily: H, color: BRAND }} className="text-[42px] font-extrabold leading-none">{n}</span>
                <h3 style={{ fontFamily: H }} className="text-2xl font-bold text-[#F4F1EA]">{t}</h3>
                <p className="leading-relaxed" style={{ color: MUTED }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARATIVO */}
      <section id="comparativo" className="py-24" style={{ background: "#FFFFFF" }}>
        <div className={`${wrap} flex flex-col gap-10`}>
          <SectionTitle eyebrow={T("Comparativo", "Comparativo")} title={T("Un día en tu negocio, sin y con GoWeb", "Um dia no seu negócio, sem e com a GoWeb")} />
          <div className="overflow-hidden rounded-3xl ring-1 ring-black/10" role="table" aria-label={T("Comparativo sin y con GoWeb", "Comparativo sem e com a GoWeb")}>
            <div role="row" className="hidden grid-cols-[180px_1fr_1fr] text-[15px] font-bold md:grid">
              <span role="columnheader" className="bg-[#F3F5F9] px-6 py-4 text-[#5F5A52]">{T("Momento", "Momento")}</span>
              <span role="columnheader" className="bg-[#F3F5F9] px-6 py-4 text-[#8A4B2F]">{T("Sin GoWeb", "Sem GoWeb")}</span>
              <span role="columnheader" className="px-6 py-4 text-white" style={{ background: "#1E8A47" }}>{T("Con GoWeb", "Com GoWeb")}</span>
            </div>
            {COMPARE.map((r) => (
              <div key={r.k.pt} role="row" className="grid border-t border-black/10 md:grid-cols-[180px_1fr_1fr]">
                <span role="rowheader" className="bg-[#F3F5F9] px-6 pt-5 font-bold md:py-5" style={{ fontFamily: H }}>{pt ? r.k.pt : r.k.es}</span>
                <p role="cell" className="flex gap-3 bg-[#F3F5F9] px-6 py-3 text-[15.5px] leading-relaxed text-[#5F5A52] md:bg-white md:py-5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C0573A" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-1 shrink-0"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  <span><span className="sr-only">{T("Sin GoWeb: ", "Sem GoWeb: ")}</span>{pt ? r.sem.pt : r.sem.es}</span>
                </p>
                <p role="cell" className="flex gap-3 px-6 pb-5 pt-3 text-[15.5px] font-medium leading-relaxed md:py-5" style={{ background: "#ECF8F0", color: "#123B22" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E8A47" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-1 shrink-0"><path d="M5 12l5 5L20 7" /></svg>
                  <span><span className="sr-only">{T("Con GoWeb: ", "Com GoWeb: ")}</span>{pt ? r.com.pt : r.com.es}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl p-7" style={{ background: INK, color: IVORY }}>
            <p style={{ fontFamily: H }} className="max-w-xl text-2xl font-bold">{T("Menos tiempo anotando y corrigiendo. Más tiempo atendiendo.", "Menos tempo anotando e corrigindo. Mais tempo atendendo.")}</p>
            <a href="#planes" className="rounded-2xl px-6 py-4 font-bold" style={{ background: BRAND, color: INK }}>{T("Ver planes", "Ver planos")}</a>
          </div>
        </div>
      </section>

      {/* PLANES */}
      <section id="planes" className="py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <SectionTitle eyebrow={T("Planes", "Planos")} title={T("Simple de contratar. Pagás como prefieras.", "Simples de contratar. Pague como preferir.")} sub={T("Guaraníes, dólares o reales.", "Pix, cartão ou boleto — em reais.")} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-5">
            {plans.map((p) => {
              const hi = p.interval === "YEARLY";
              return (
                <div key={p.id} data-reveal className="lift flex flex-col gap-5 rounded-3xl border-[1.5px] p-9" style={{ background: hi ? INK : "#FFFFFF", color: hi ? IVORY : INK, borderColor: hi ? BRAND : p.intelligence ? "#1F7FD8" : "#DDD6C8" }}>
                  {hi ? (
                    <span className="self-start rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ background: BRAND, color: INK }}>{T("Más elegido", "Mais escolhido")}</span>
                  ) : p.intelligence ? (
                    <span className="self-start rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white" style={{ background: "linear-gradient(90deg,#1F7FD8,#3CC46B)" }}>{T("Con inteligencia", "Com inteligência")}</span>
                  ) : (
                    <span className="h-[30px]" />
                  )}
                  <h3 style={{ fontFamily: H }} className="text-3xl font-extrabold">{planName(p.name, locale)}</h3>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span style={{ fontFamily: H }} className="text-[40px] font-extrabold tracking-tight">{pt ? formatMinor(p.priceBrlMinor, "BRL") : formatPyg(p.pricePyg)}</span>
                    <span style={{ color: hi ? MUTED : "#5F5A52" }}>/ {hi ? T("año", "ano") : T("mes", "mês")}</span>
                  </div>
                  <p className="text-sm" style={{ color: hi ? MUTED : "#5F5A52" }}>
                    {pt ? (
                      <>{p.setupBrlMinor > 0 ? <>+ implantação {formatMinor(p.setupBrlMinor, "BRL")}</> : "implantação inclusa"}</>
                    ) : (
                      <>
                        o {formatMinor(p.priceUsdMinor, "USD")} · {formatMinor(p.priceBrlMinor, "BRL")}
                        {p.setupPyg > 0 && <> · implementación {formatPyg(p.setupPyg)}</>}
                      </>
                    )}
                  </p>
                  <ul className="flex flex-col gap-3 text-[15.5px]">
                    {(p.features ?? "").split("\n").filter(Boolean).map((f) => planFeature(f, locale)).map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5L20 7" /></svg>
                        {f}
                      </li>
                    ))}
                    {p.includesDomain && <li className="flex items-start gap-2.5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5L20 7" /></svg>{T("Dominio propio incluido", "Domínio próprio incluso")}</li>}
                  </ul>
                  <Link href={`/contratar?plano=${p.id}&lang=${locale}`} className="mt-auto rounded-2xl py-4 text-center font-bold" style={{ background: hi ? BRAND : INK, color: hi ? INK : IVORY }}>{T("Quiero este plan", "Quero este plano")}</Link>
                </div>
              );
            })}
            {mp.enabled && (
              <div data-reveal className="lift flex flex-col gap-5 rounded-3xl border-[1.5px] border-dashed p-9" style={{ background: "#FFFFFF", color: INK, borderColor: BRAND }}>
                <span className="self-start rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ background: "#E8F7EE", color: "#1E7A43" }}>{T("Pagá solo lo que usás", "Pague só o que usa")}</span>
                <h3 style={{ fontFamily: H }} className="text-3xl font-extrabold">{T("Personalizado", "Personalizado")}</h3>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px]" style={{ color: "#5F5A52" }}>{T("desde", "a partir de")}</span>
                  <span style={{ fontFamily: H }} className="text-[40px] font-extrabold tracking-tight">{pt ? formatMinor(mp.core.BRL, "BRL") : formatPyg(mp.core.PYG)}</span>
                  <span style={{ color: "#5F5A52" }}>/ {T("mes", "mês")}</span>
                </div>
                <p className="text-sm" style={{ color: "#5F5A52" }}>{pt ? <>+ implantação {formatMinor(mp.setup.BRL, "BRL")}</> : <>implementación {formatPyg(mp.setup.PYG)}</>}</p>
                <ul className="flex flex-col gap-3 text-[15.5px]">
                  {[pt ? CORE_INFO.pt : CORE_INFO.es, T("Sumá solo los módulos que necesitás: mesas, delivery, caja, marketing, agenda…", "Some só os módulos que precisa: mesas, delivery, caixa, marketing, agenda…"), T("Agregá o quitá módulos cuando quieras", "Adicione ou remova módulos quando quiser")].map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5L20 7" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={`/contratar?plano=personalizado&lang=${locale}`} className="mt-auto rounded-2xl py-4 text-center font-bold" style={{ background: BRAND, color: INK }}>{T("Armar mi plan", "Montar meu plano")}</Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-24">
        <div className={`${wrap} flex flex-wrap gap-12`}>
          <h2 style={{ fontFamily: H }} className="flex-[1_1_280px] text-[clamp(32px,3.2vw,46px)] font-extrabold leading-tight tracking-tight">{T("Preguntas frecuentes", "Perguntas frequentes")}</h2>
          <div className="min-w-0 flex-[2_1_520px] border-t border-[#DDD6C8]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="border-b border-[#DDD6C8] py-5">
                <summary style={{ fontFamily: H }} className="cursor-pointer text-xl font-bold">{q}</summary>
                <p className="mt-3 leading-relaxed text-[#4A463F]">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: INK }} className="py-24 text-center">
        <div className={`${wrap} flex flex-col items-center gap-6`}>
          <h2 style={{ fontFamily: H }} className="text-[clamp(36px,4.4vw,64px)] font-extrabold leading-[1.04] tracking-tight text-[#F4F1EA]">{T("Llevá tu negocio al siguiente nivel.", "Leve seu negócio para o próximo nível.")}</h2>
          <p className="max-w-[560px] text-lg" style={{ color: MUTED }}>{T("Te mostramos GoWeb funcionando con tu propio menú. Sin compromiso.", "Mostramos a GoWeb funcionando com os seus produtos. Sem compromisso.")}</p>
          <a href={wa} className="btn-shine rounded-2xl px-8 py-4 text-lg font-bold transition hover:-translate-y-0.5" style={{ background: BRAND, color: INK }}>{T("Hablar por WhatsApp", "Falar no WhatsApp")}</a>
        </div>
      </section>
      <RevealOnScroll />
      <footer style={{ background: INK }} className="border-t border-[#2C2C31]">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-8 text-sm`} style={{ color: MUTED }}>
          <span className="flex flex-col gap-1.5">
            <GoWebLogo height={26} />
            <span className="text-xs font-semibold" style={{ color: "#7FB8EE" }}>{T("Clic, Conectá, Vendé.", "Clique, Conecte, Venda.")}</span>
          </span>
          <span>© {new Date().getFullYear()} GoWeb · {T("Tu negocio online: vitrina, pedidos, pagos y gestión en un solo lugar", "Seu negócio online: vitrine, pedidos, pagamentos e gestão em um só lugar")}</span>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ eyebrow, title, sub, dark }: { eyebrow: string; title: string; sub?: string; dark?: boolean }) {
  return (
    <div data-reveal className="flex max-w-[720px] flex-col gap-3.5">
      <span className="text-[15px] font-semibold" style={{ color: dark ? BRAND : GW_NAVY }}>{eyebrow}</span>
      <h2 style={{ fontFamily: H, color: dark ? IVORY : INK }} className="text-[clamp(32px,3.6vw,52px)] font-extrabold leading-[1.08] tracking-[-0.02em]">{title}</h2>
      {sub && <p className="text-lg" style={{ color: dark ? MUTED : "#5F5A52" }}>{sub}</p>}
    </div>
  );
}
