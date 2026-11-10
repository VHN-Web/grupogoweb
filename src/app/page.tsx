import { sortPlansByPrice } from "@/core/plans";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BRAND, GW_NAVY } from "@/components/brand/GoWebLogo";
import { Illustration } from "@/components/Illustration";
import { Icon } from "@/components/ui/Icon";
import { formatMinor, formatPyg } from "@/core/money";
import { THEMES, type ThemeId } from "@/core/themes";
import { getSettings } from "@/services/billing";
import { parseModulePrices } from "@/core/modules";
import { headers } from "next/headers";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { detectLocale, tr, type Locale } from "@/core/region";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { H, INK, IVORY, MUTED, wrap } from "@/components/site/tokens";
import { isPreLaunch } from "@/core/launch";
import { LaunchPage } from "@/components/site/LaunchPage";

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


type Feat = { icon: string; t: string; d: string };
type Group = { color: string; title: string; items: Feat[] };

function groups(pt: boolean): Group[] {
  const T = (es: string, p: string) => (pt ? p : es);
  return [
    {
      color: "#2FAE5F",
      title: T("Vender", "Vender"),
      items: [
        { icon: "qr", t: T("Menú con QR por mesa", "Cardápio com QR por mesa"), d: T("El cliente escanea, elige y pide sin descargar nada.", "O cliente escaneia, escolhe e pede sem baixar nada.") },
        { icon: "orders", t: T("Pedidos en tiempo real", "Pedidos em tempo real"), d: T("Llegan al panel y a la impresora térmica al instante.", "Chegam no painel e na impressora térmica na hora.") },
        { icon: "cash", t: pt ? "Caixa e Pix" : "Caja multi-moneda", d: T("Guaraníes, dólares o reales, con vuelto automático.", "Pix, cartão e dinheiro, com troco calculado.") },
        { icon: "bike", t: T("Delivery y repartidores", "Delivery e motoboys"), d: T("Tarifa por distancia, ruta por WhatsApp y pago a cada repartidor.", "Taxa por distância, rota no WhatsApp e acerto de cada motoboy.") },
        { icon: "calendar", t: T("Agenda online", "Agenda online"), d: T("Turnos reservados en tu sitio, con confirmación.", "Horários marcados no seu site, com confirmação.") },
      ],
    },
    {
      color: "#E0891F",
      title: T("Mostrar", "Mostrar"),
      items: [
        { icon: "palette", t: T("Sitio con tu marca", "Site com a sua marca"), d: T("Modelos por rubro, tu logo y tus colores. Claro u oscuro.", "Modelos por segmento, seu logo e suas cores. Claro ou escuro.") },
        { icon: "products", t: T("Productos y stock", "Produtos e estoque"), d: T("Fotos desde el celular, stock que baja solo y agotados automáticos.", "Fotos pelo celular, estoque que baixa sozinho e esgotados automáticos.") },
        { icon: "tag", t: T("Ofertas y cupones", "Ofertas e cupons"), d: T("Ofertas relámpago con cuenta regresiva y cupones de descuento.", "Ofertas relâmpago com contagem regressiva e cupons de desconto.") },
        { icon: "store", t: "Shopping GoWeb", d: T("Tu tienda aparece en la red de comercios GoWeb.", "Sua loja aparece na rede de comércios da GoWeb.") },
      ],
    },
    {
      color: "#1F7FD8",
      title: T("Hacer volver", "Fazer voltar"),
      items: [
        { icon: "customers", t: T("Cartera de clientes", "Carteira de clientes"), d: T("Cada cliente con su historial y de dónde vino la venta.", "Cada cliente com histórico e de onde veio a venda.") },
        { icon: "star", t: T("Google y reseñas", "Google e avaliações"), d: T("Tienda optimizada para Google y pedido de reseña al final.", "Loja otimizada para o Google e pedido de avaliação no final.") },
        { icon: "gift", t: T("Fidelidad y recomendaciones", "Fidelidade e indicação"), d: T("Tarjeta de sellos o cashback, recomendá y ganá y cumpleaños.", "Cartão de selos ou cashback, indique e ganhe e aniversário.") },
        { icon: "megaphone", t: T("Campañas por WhatsApp", "Campanhas no WhatsApp"), d: T("Mensaje con cupón para quien dejó de comprar.", "Mensagem com cupom para quem sumiu.") },
      ],
    },
    {
      color: "#5B7DB1",
      title: T("Gestionar", "Gerenciar"),
      items: [
        { icon: "sparkle", t: T("Asistente con IA", "Assistente com IA"), d: T("Pedile «cerrá la tienda» o «cambiá el precio» y lo hace, con tu confirmación.", "Peça «fecha a loja» ou «muda o preço» e ele faz, com a sua confirmação.") },
        { icon: "team", t: T("Equipo con acceso propio", "Equipe com acesso próprio"), d: T("Cada empleado ve solo lo que habilitás.", "Cada funcionário vê só o que você liberar.") },
        { icon: "chat", t: T("Soporte con protocolo", "Suporte com protocolo"), d: T("Abrís un chamado desde el panel y seguís el plazo de respuesta.", "Você abre um chamado no painel e acompanha o prazo de resposta.") },
        { icon: "access", t: T("Accesible para todos", "Acessível para todos"), d: T("Letra grande, alto contraste y menos movimiento.", "Letra grande, alto contraste e menos movimento.") },
      ],
    },
  ];
}

const FAQ_PT = [
  ["Pago a mensalidade junto com a implantação?", "Não. Na contratação você paga só a implantação. A 1ª mensalidade vence 30 dias depois que o sistema é entregue."],
  ["Meus clientes precisam baixar um app?", "Não. Eles escaneiam o QR com a câmera e o cardápio abre no navegador do celular."],
  ["Funciona para barbearia, perfumaria e loja de informática?", "Sim. Tem modelos prontos para hamburguerias, restaurantes, cafeterias, bares, barbearias, perfumarias, lojas de roupa e de tecnologia."],
  ["Quem cadastra o cardápio ou os produtos?", "Nós fazemos a implantação: cadastramos seus produtos, logo, cores e mesas."],
  ["Tenho fidelidade?", "Não. Você cancela quando quiser, sem multa."],
];
const FAQ_ES = [
  ["¿Pago la mensualidad junto con la implementación?", "No. Al contratar pagás solo la implementación. La 1.ª mensualidad vence 30 días después de la entrega del sistema."],
  ["¿Mis clientes tienen que descargar una app?", "No. Escanean el QR con la cámara y el menú abre en el navegador del celular."],
  ["¿Puedo cobrar en dólares y reales?", "Sí. Definís la cotización del día y el sistema convierte el total y calcula el vuelto en guaraníes."],
  ["¿Quién carga el menú?", "Nosotros hacemos la implementación: cargamos tu menú, tu logo, tus colores y tus mesas."],
  ["¿Hay permanencia mínima?", "No. Cancelás cuando quieras, sin multa."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string; preview?: string; lista?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  // Até o lançamento oficial (core/launch.ts) a página inicial é a contagem regressiva; ?preview=1 mostra o site
  if (isPreLaunch() && sp.preview !== "1") {
    const s = await getSettings();
    return <LaunchPage locale={locale} lista={sp.lista} whatsapp={s.supportWhatsapp} />;
  }
  const pt = locale === "pt";
  const T = tr(locale);
  const FAQ = pt ? FAQ_PT : FAQ_ES;
  const DEMOS = pt ? DEMOS_PT : DEMOS_ES;
  const [settings, plans] = await Promise.all([
    getSettings(),
    db.query.plans.findMany({ where: and(eq(schema.plans.active, true), eq(schema.plans.isCustom, false)), orderBy: asc(schema.plans.sortOrder) }).then((ps) => sortPlansByPrice(ps, locale === "pt" ? "BRL" : "PYG")),
  ]);
  const mp = parseModulePrices(settings.modulePrices);
  const wa = settings.supportWhatsapp ? `https://wa.me/${settings.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(T("¡Hola! Quiero conocer GoWeb para mi negocio.", "Olá! Quero conhecer a GoWeb para o meu negócio. (cód. P-site)"))}` : `/planos?lang=${locale}`;
  const cheapest = [...plans.filter((p) => p.interval === "MONTHLY").map((p) => (pt ? p.priceBrlMinor : p.pricePyg)), ...(mp.enabled ? [pt ? mp.core.BRL : mp.core.PYG] : [])].sort((a, b) => a - b)[0];
  const from = cheapest != null ? (pt ? formatMinor(cheapest, "BRL") : formatPyg(cheapest)) : null;
  const planos = `/planos?lang=${locale}`;

  return (
    <div className="site font-sans" lang={pt ? "pt-BR" : "es"}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Anton&display=swap" precedence="default" />
      <SiteHeader locale={locale} path="/" wa={wa} />

      {/* HERO */}
      <section style={{ background: INK, color: IVORY }} className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="anim-blob absolute -left-24 top-10 h-[380px] w-[380px] rounded-full opacity-25 blur-3xl" style={{ background: "#1F7FD8" }} />
          <div className="anim-blob absolute right-[-120px] top-[30%] h-[420px] w-[420px] rounded-full opacity-20 blur-3xl" style={{ background: BRAND, animationDelay: "-6s" }} />
        </div>
        <div className={`${wrap} relative flex flex-wrap items-center gap-14 pb-24 pt-16 sm:pt-20`}>
          <div className="stagger flex min-w-0 flex-[1_1_480px] flex-col gap-7">
            <p className="text-[15px] font-semibold" style={{ color: BRAND }}>{T("Para restaurantes, bares, barberías y tiendas", "Para restaurantes, barbearias, perfumarias e lojas")}</p>
            <h1 style={{ fontFamily: H }} className="text-[clamp(42px,5.4vw,76px)] font-extrabold leading-[1.02] tracking-[-0.025em]">
              {T("Tu negocio,", "Seu negócio,")}
              <br />
              {T("bajo control total.", "sob controle total.")}
            </h1>
            <p className="max-w-[540px] text-[19px] leading-relaxed" style={{ color: MUTED }}>
              {T(
                "Menú con QR, pedidos en tiempo real, caja, delivery y clientes que vuelven. Con un asistente que hace el trabajo por vos.",
                "Cardápio com QR, pedidos em tempo real, caixa, delivery e clientes que voltam. Com um assistente que faz o trabalho por você.",
              )}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={wa} className="btn-shine rounded-2xl px-6 py-4 text-[17px] font-bold transition hover:-translate-y-0.5" style={{ background: BRAND, color: INK }}>{T("Quiero GoWeb en mi negocio", "Quero a GoWeb no meu negócio")}</a>
              <Link href={planos} className="rounded-2xl border border-[#45454B] px-6 py-4 text-[17px] font-semibold transition hover:-translate-y-0.5 hover:border-[#6A6A72]">{T("Ver planes", "Ver planos")}</Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm" style={{ color: MUTED }}>
              {[T("Sin app: solo QR", "Sem app: só QR"), T("Lo configuramos por vos", "A gente configura tudo"), T("Mensualidad recién 30 días después de la entrega", "Mensalidade só 30 dias após a entrega")].map((x) => (
                <li key={x} className="flex items-center gap-1.5"><Icon name="check" size={16} className="text-[#3CC46B]" />{x}</li>
              ))}
            </ul>
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
            {DEMOS.map((d) => {
              const th = THEMES[d.theme];
              return (
                <Link key={d.slug} href={`/${d.slug}`} className="lift group overflow-hidden rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]">
                  <div className="relative h-52 overflow-hidden" style={{ background: th.colors.heroBg }}>
                    <div className="absolute -bottom-4 -right-6 transition duration-500 group-hover:-rotate-3 group-hover:scale-110"><Illustration name={d.art} size={170} /></div>
                    <span className={`absolute left-4 top-4 text-[26px] leading-none ${th.fonts.headingUpper ? "uppercase" : "font-bold"} ${th.fonts.headingItalic ? "italic" : ""}`} style={{ fontFamily: th.fonts.heading, color: th.colors.heroFg }}>
                      {d.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-semibold">{d.kind}</span>
                    <span className="text-sm font-semibold transition-transform group-hover:translate-x-1" style={{ color: GW_NAVY }}>{T("Probar", "Testar")}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* RECURSOS — agrupados como no painel (mesmas cores) */}
      <section id="funciones" style={{ background: INK }} className="py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <SectionTitle dark eyebrow={T("Funciones", "Recursos")} title={T("Todo lo que tu negocio necesita. Nada que sobre.", "Tudo o que o seu negócio precisa. Nada sobrando.")} />
          <div className="grid gap-6 md:grid-cols-2">
            {groups(pt).map((g) => (
              <div key={g.title} className="rounded-[28px] border border-[#2C2C31] bg-[#141417] p-7">
                <h3 style={{ fontFamily: H }} className="flex items-center gap-3 text-2xl font-extrabold text-[#F4F1EA]">
                  <span className="h-3 w-3 rounded-full" style={{ background: g.color }} aria-hidden="true" />
                  {g.title}
                </h3>
                <ul className="mt-5 space-y-4">
                  {g.items.map((f) => (
                    <li key={f.t} className="flex gap-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white" style={{ background: g.color }}><Icon name={f.icon} size={20} /></span>
                      <span>
                        <span className="block font-bold text-[#F4F1EA]">{f.t}</span>
                        <span className="block text-[15px] leading-relaxed" style={{ color: MUTED }}>{f.d}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Destaque: assistente */}
          <div className="grid items-center gap-10 rounded-[32px] bg-[#1D4F91] p-8 text-white md:grid-cols-2 md:p-12">
            <div>
              <p className="font-semibold text-[#9FC6F2]">{T("Nuevo", "Novidade")}</p>
              <h3 style={{ fontFamily: H }} className="mt-2 text-[clamp(28px,3vw,42px)] font-extrabold leading-tight">{T("Pedile y lo hace. Vos solo confirmás.", "Peça e ele faz. Você só confirma.")}</h3>
              <p className="mt-4 text-lg text-white/85">{T("El asistente del panel te lleva a cada función y hace tareas por vos: cambiar precios, pausar productos, cerrar la tienda, crear cupones. Nada cambia sin tu confirmación.", "O assistente do painel te leva a cada função e faz tarefas por você: mudar preço, pausar produto, fechar a loja, criar cupom. Nada muda sem a sua confirmação.")}</p>
            </div>
            <div data-reveal className="chat-demo space-y-3 rounded-[24px] bg-[#F3F5F9] p-5 text-[15px] text-[#1B2230]" aria-hidden="true">
              <p className="chat-1 ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#1F7FD8] px-4 py-2.5 text-white">{T("Poné el Doble Brasa a 49.000 y pausá las papas", "Muda o Duplo Smash para R$ 32,90 e pausa a batata")}</p>
              <p className="chat-2 w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 ring-1 ring-black/5">{T("Listo, revisá y confirmá:", "Pronto, confira e confirme:")}</p>
              <div className="chat-3 rounded-2xl border-2 border-[#1F7FD8]/40 bg-white p-3.5">
                <p className="font-semibold">{T("Cambiar «Doble Brasa»: precio Gs. 49.000", "Alterar «Duplo Smash»: preço R$ 32,90")}</p>
                <p className="mt-0.5 font-semibold">{T("Cambiar «Papas Brasa»: pausar", "Alterar «Batata Brasa»: pausar")}</p>
                <div className="mt-3 flex gap-2"><span className="flex-1 rounded-xl bg-[#2FAE5F] py-2 text-center font-semibold text-white">{T("Confirmar", "Confirmar")}</span><span className="rounded-xl border border-black/15 px-3 py-2 font-semibold">{T("Cancelar", "Cancelar")}</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARATIVO */}
      <section id="comparativo" className="bg-[var(--s-card)] py-24">
        <div className={`${wrap} flex flex-col gap-10`}>
          <SectionTitle eyebrow={T("Comparativo", "Comparativo")} title={T("Un día en tu negocio, sin y con GoWeb", "Um dia no seu negócio, sem e com a GoWeb")} />
          <div className="overflow-hidden rounded-3xl ring-1 ring-[var(--s-line)]" role="table" aria-label={T("Comparativo sin y con GoWeb", "Comparativo sem e com a GoWeb")}>
            <div role="row" className="hidden grid-cols-[180px_1fr_1fr] text-[15px] font-bold md:grid">
              <span role="columnheader" className="bg-[var(--s-soft)] px-6 py-4 text-[var(--s-muted)]">{T("Momento", "Momento")}</span>
              <span role="columnheader" className="bg-[var(--s-soft)] px-6 py-4 text-[var(--s-bad)]">{T("Sin GoWeb", "Sem GoWeb")}</span>
              <span role="columnheader" className="px-6 py-4 text-white" style={{ background: "#1E8A47" }}>{T("Con GoWeb", "Com GoWeb")}</span>
            </div>
            {COMPARE.map((r) => (
              <div key={r.k.pt} role="row" className="grid border-t border-[var(--s-line)] md:grid-cols-[180px_1fr_1fr]">
                <span role="rowheader" className="bg-[var(--s-soft)] px-6 pt-5 font-bold md:py-5" style={{ fontFamily: H }}>{pt ? r.k.pt : r.k.es}</span>
                <p role="cell" className="flex gap-3 bg-[var(--s-soft)] px-6 py-3 text-[15.5px] leading-relaxed text-[var(--s-muted)] md:bg-[var(--s-card)] md:py-5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C0573A" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-1 shrink-0"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  <span><span className="sr-only">{T("Sin GoWeb: ", "Sem GoWeb: ")}</span>{pt ? r.sem.pt : r.sem.es}</span>
                </p>
                <p role="cell" className="flex gap-3 bg-[var(--s-good-cell)] px-6 pb-5 pt-3 text-[15.5px] font-medium leading-relaxed text-[var(--s-good-ink)] md:py-5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2FAE5F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-1 shrink-0"><path d="M5 12l5 5L20 7" /></svg>
                  <span><span className="sr-only">{T("Con GoWeb: ", "Com GoWeb: ")}</span>{pt ? r.com.pt : r.com.es}</span>
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl p-7" style={{ background: INK, color: IVORY }}>
            <p style={{ fontFamily: H }} className="max-w-xl text-2xl font-bold">{T("Menos tiempo anotando y corrigiendo. Más tiempo atendiendo.", "Menos tempo anotando e corrigindo. Mais tempo atendendo.")}</p>
            <Link href={planos} className="rounded-2xl px-6 py-4 font-bold transition-transform hover:-translate-y-0.5" style={{ background: BRAND, color: INK }}>{T("Ver planes", "Ver planos")}</Link>
          </div>
        </div>
      </section>

      {/* PLANOS (resumo — detalhes em /planos) */}
      <section id="planes" className="py-24">
        <div className={`${wrap} grid items-center gap-10 md:grid-cols-[1.2fr_1fr]`}>
          <SectionTitle eyebrow={T("Planes", "Planos")} title={from ? T(`Desde ${from} por mes.`, `A partir de ${from} por mês.`) : T("Planes para cada negocio.", "Planos para cada negócio.")} sub={T("Hoy pagás solo la implementación. La primera mensualidad vence recién 30 días después de que entregamos tu sistema. Sin permanencia mínima.", "Hoje você paga só a implantação. A primeira mensalidade só vence 30 dias depois que entregamos o seu sistema. Sem fidelidade.")} />
          <ol className="space-y-3" aria-label={T("Cómo funciona el pago", "Como funciona o pagamento")}>
            {[
              [T("Hoy", "Hoje"), T("Pagás la implementación y armamos tu sitio.", "Você paga a implantação e montamos seu site.")],
              [T("Entrega", "Entrega"), T("Recibís el acceso y empezás a vender.", "Você recebe o acesso e começa a vender.")],
              [T("30 días después", "30 dias depois"), T("Vence la primera mensualidad.", "Vence a primeira mensalidade.")],
            ].map(([k, v], i) => (
              <li key={k} className="flex items-center gap-4 rounded-2xl bg-[var(--s-card)] p-4 ring-1 ring-[var(--s-line)]">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-extrabold text-white" style={{ background: ["#2FAE5F", "#1F7FD8", "#1D4F91"][i], fontFamily: H }}>{i + 1}</span>
                <span><b className="block">{k}</b><span className="text-[var(--s-muted)]">{v}</span></span>
              </li>
            ))}
            <li><Link href={planos} className="mt-2 block rounded-2xl py-4 text-center font-bold" style={{ background: BRAND, color: INK }}>{T("Ver planes y precios", "Ver planos e preços")}</Link></li>
          </ol>
        </div>
      </section>

      {/* SHOPPING */}
      <section className="pb-24">
        <div className={`${wrap}`}>
          <Link href={`/shopping?lang=${locale}`} className="group flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[32px] bg-[#1F7FD8] p-8 text-white md:p-12">
            <div className="max-w-xl">
              <p className="font-semibold text-white/80">Shopping GoWeb</p>
              <h2 style={{ fontFamily: H }} className="mt-2 text-[clamp(28px,3vw,42px)] font-extrabold leading-tight">{T("Tu tienda en una red de comercios.", "Sua loja numa rede de comércios.")}</h2>
              <p className="mt-3 text-lg text-white/85">{T("Los clientes de una tienda descubren las otras y compran directo con cada una.", "Os clientes de uma loja descobrem as outras e compram direto com cada uma.")}</p>
            </div>
            <span className="flex -space-x-6" aria-hidden="true">
              {DEMOS.slice(0, 4).map((d, i) => (
                <span key={d.slug} className="grid h-24 w-24 place-items-center rounded-3xl ring-4 ring-[#1F7FD8] transition-transform duration-500 group-hover:-translate-y-2" style={{ background: THEMES[d.theme].colors.heroBg, transitionDelay: `${i * 60}ms` }}>
                  <Illustration name={d.art} size={70} />
                </span>
              ))}
            </span>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-24">
        <div className={`${wrap} flex flex-wrap gap-12`}>
          <h2 style={{ fontFamily: H }} className="flex-[1_1_280px] text-[clamp(32px,3.2vw,46px)] font-extrabold leading-tight tracking-tight">{T("Preguntas frecuentes", "Perguntas frequentes")}</h2>
          <div className="min-w-0 flex-[2_1_520px] border-t border-[var(--s-line)]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq border-b border-[var(--s-line)] py-5">
                <summary style={{ fontFamily: H }} className="cursor-pointer text-xl font-bold">{q}</summary>
                <p className="mt-3 leading-relaxed text-[var(--s-muted)]">{a}</p>
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
      <SiteFooter locale={locale} />
    </div>
  );
}

function SectionTitle({ eyebrow, title, sub, dark }: { eyebrow: string; title: string; sub?: string; dark?: boolean }) {
  return (
    <div data-reveal className="flex max-w-[720px] flex-col gap-3.5">
      <span className="text-[15px] font-semibold" style={{ color: dark ? BRAND : "#1F7FD8" }}>{eyebrow}</span>
      <h2 style={{ fontFamily: H, color: dark ? IVORY : "var(--s-ink)" }} className="text-[clamp(32px,3.6vw,52px)] font-extrabold leading-[1.08] tracking-[-0.02em]">{title}</h2>
      {sub && <p className="text-lg" style={{ color: dark ? MUTED : "var(--s-muted)" }}>{sub}</p>}
    </div>
  );
}
