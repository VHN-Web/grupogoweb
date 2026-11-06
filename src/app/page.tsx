import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AtlasLogo, ATLAS_GOLD } from "@/components/brand/AtlasLogo";
import { Illustration } from "@/components/Illustration";
import { formatMinor, formatPyg } from "@/core/money";
import { THEMES, type ThemeId } from "@/core/themes";
import { getSettings } from "@/services/billing";

export const dynamic = "force-dynamic";

const INK = "#0E0E10";
const IVORY = "#F4F1EA";
const MUTED = "#B9B3A7";
const H = "'Bricolage Grotesque', Inter, sans-serif";

// Lojas de demonstração criadas pelo seed (npm run db:setup)
const DEMOS: { slug: string; name: string; theme: ThemeId; art: string; kind: string }[] = [
  { kind: "Hamburguesería", slug: "brasa-burger", name: "Brasa Burger", theme: "burger", art: "burger" },
  { kind: "Restaurante", slug: "nonna-lucia", name: "Nonna Lucía", theme: "restaurant", art: "pizza" },
  { kind: "Cafetería", slug: "cafe-morena", name: "Café Morena", theme: "cafe", art: "coffee" },
  { kind: "Tienda", slug: "kira", name: "KIRA", theme: "store", art: "dress" },
  { kind: "Bar · Cervecería", slug: "lupulo", name: "Lúpulo", theme: "bar", art: "beer" },
];

const FEATURES = [
  { icon: "qr", t: "Menú con QR por mesa", d: "Cada mesa tiene su código. El cliente escanea, elige y pide sin descargar nada." },
  { icon: "bell", t: "Pedidos en tiempo real", d: "Cocina y caja ven cada pedido al instante, con número, mesa y nombre del cliente." },
  { icon: "cash", t: "Caja multi-moneda", d: "Cobrá en guaraníes, dólares o reales con tu cotización del día. El vuelto se calcula solo." },
  { icon: "box", t: "Control de stock", d: "Los productos se descuentan con cada venta y se marcan como agotados automáticamente." },
  { icon: "route", t: "Delivery con distancia", d: "La tarifa se recalcula según la ubicación del cliente, con radio máximo y envío gratis." },
  { icon: "doc", t: "Comprobantes y facturas", d: "Comprobante automático en cada pedido y registro de facturas. Preparado para SIFEN." },
];

const ICONS: Record<string, React.ReactNode> = {
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

const FAQ = [
  ["¿Mis clientes tienen que descargar una app?", "No. Escanean el QR con la cámara y el menú abre en el navegador del celular."],
  ["¿Puedo cobrar en dólares y reales?", "Sí. Definís la cotización del día y el sistema convierte el total y calcula el vuelto en guaraníes."],
  ["¿Quién carga el menú?", "Nosotros hacemos la implementación: cargamos tu menú, tu logo, tus colores y tus mesas."],
  ["¿Puedo usar mi propio dominio?", "Sí. En el plan anual el dominio está incluido; en el mensual se agrega como adicional."],
  ["¿Sirve para tiendas, no solo restaurantes?", "Sí. Hay modelos para hamburgueserías, restaurantes, cafeterías, bares y tiendas."],
];

const wrap = "mx-auto w-full max-w-[1200px] px-6 sm:px-8";

export default async function Home() {
  const [settings, plans] = await Promise.all([
    getSettings(),
    db.query.plans.findMany({ where: eq(schema.plans.active, true), orderBy: asc(schema.plans.sortOrder) }),
  ]);
  const wa = settings.supportWhatsapp ? `https://wa.me/${settings.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hola! Quiero conocer Atlas para mi local.")}` : "#planes";

  return (
    <div style={{ background: IVORY, color: INK }} className="font-sans">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Anton&display=swap" precedence="default" />

      {/* NAV */}
      <header style={{ background: INK }} className="border-b border-[#2C2C31]">
        <nav className={`${wrap} flex flex-wrap items-center gap-x-7 gap-y-3 py-5`}>
          <Link href="/" aria-label="Atlas, inicio">
            <AtlasLogo height={30} />
          </Link>
          <div className="flex-1" />
          <a href="#modelos" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>Modelos</a>
          <a href="#funciones" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>Funciones</a>
          <a href="#planes" className="hidden text-[15px] sm:inline" style={{ color: MUTED }}>Planes</a>
          <Link href="/painel" className="rounded-xl border border-[#45454B] px-4 py-2.5 text-[15px] font-semibold text-[#F4F1EA]">Ingresar</Link>
          <a href={wa} className="rounded-xl px-4 py-2.5 text-[15px] font-bold" style={{ background: ATLAS_GOLD, color: INK }}>Solicitar demo</a>
        </nav>
      </header>

      {/* HERO */}
      <section style={{ background: INK, color: IVORY }} className="overflow-hidden">
        <div className={`${wrap} flex flex-wrap items-center gap-14 pb-24 pt-16 sm:pt-20`}>
          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-7">
            <span className="text-[13px] font-semibold uppercase tracking-[0.22em]" style={{ color: ATLAS_GOLD }}>Restaurantes · Bares · Cafeterías · Tiendas</span>
            <h1 style={{ fontFamily: H }} className="text-[clamp(42px,5.4vw,76px)] font-extrabold leading-[1.02] tracking-[-0.025em]">
              Tu negocio,
              <br />
              bajo control total.
            </h1>
            <p className="max-w-[540px] text-[19px] leading-relaxed" style={{ color: MUTED }}>
              Menú con QR, pedidos en tiempo real, caja multi-moneda y stock. Un sitio con la cara de tu marca, sin instalar nada.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={wa} className="rounded-2xl px-6 py-4 text-[17px] font-bold" style={{ background: ATLAS_GOLD, color: INK }}>Quiero Atlas en mi local</a>
              <a href="#modelos" className="rounded-2xl border border-[#45454B] px-6 py-4 text-[17px] font-semibold">Ver modelos en vivo</a>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-sm" style={{ color: MUTED }}>
              <span>✓ Guaraníes, dólares y reales</span>
              <span>✓ Sin app: solo QR</span>
              <span>✓ Implementación incluida</span>
            </div>
          </div>

          {/* Mock: celular + cartões */}
          <div className="relative h-[600px] min-w-0 flex-[1_1_420px]" aria-hidden="true">
            <div className="absolute left-1/2 top-0 h-[600px] w-[300px] -translate-x-1/2 rounded-[46px] bg-[#2A2B2F] p-2.5 shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
              <div className="flex h-full w-full flex-col overflow-hidden rounded-[37px] bg-[#121212] text-white">
                <div className="relative h-[190px] overflow-hidden bg-[#E63946]">
                  <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(-45deg, rgba(0,0,0,.08) 0 12px, transparent 12px 24px)" }} />
                  <div className="absolute -right-6 top-8"><Illustration name="burger" size={170} /></div>
                  <div className="relative flex w-[140px] flex-col gap-1 pl-4 pt-10">
                    <span className="-rotate-3 self-start rounded bg-[#FFC20E] px-2 py-0.5 text-[10px] font-extrabold text-black">PROMO</span>
                    <span className="text-[30px] uppercase leading-[0.95]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>Combo doble</span>
                    <span className="text-lg text-[#FFC20E]" style={{ fontFamily: "Anton, Impact, sans-serif" }}>Gs. 59.000</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  {[
                    ["burger", "Doble Brasa", "Gs. 52.000"],
                    ["fries", "Papas Brasa", "Gs. 18.000"],
                    ["soda", "Gaseosa", "Gs. 9.000"],
                  ].map(([a, n, p]) => (
                    <div key={n} className="flex items-center gap-3 rounded-2xl bg-[#1E1E1E] p-2.5">
                      <span className="grid h-14 w-14 place-items-center rounded-xl bg-[#2A2416]"><Illustration name={a} size={48} /></span>
                      <span className="flex flex-1 flex-col"><b className="text-sm uppercase" style={{ fontFamily: "Anton, Impact, sans-serif", fontWeight: 400 }}>{n}</b><span className="text-[13px] font-bold text-[#FFC20E]">{p}</span></span>
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#FFC20E] font-bold text-black">+</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto m-3 flex justify-between rounded-2xl bg-[#FFC20E] px-4 py-3 text-sm font-extrabold text-black"><span>Ver pedido · 2</span><span>Gs. 70.000</span></div>
              </div>
            </div>
            <div className="absolute left-0 top-16 flex w-[230px] flex-col gap-1.5 rounded-[18px] bg-white p-4 text-[#0E0E10] shadow-[0_24px_50px_rgba(0,0,0,0.35)]">
              <span className="text-xs text-[#6A655C]">Nuevo pedido · Mesa 4</span>
              <span style={{ fontFamily: H }} className="text-3xl font-extrabold">#4821</span>
              <span className="text-[13px]">1× Doble Brasa · 1× Papas</span>
              <div className="mt-1 flex items-center justify-between"><b className="text-sm">US$ 9,60</b><span className="rounded-full bg-[#DDEFE7] px-2.5 py-1 text-[11px] font-bold text-[#1F6F55]">Pagado</span></div>
            </div>
            <div className="absolute bottom-16 right-0 flex w-[230px] flex-col gap-2.5 rounded-[18px] border border-[#3A3A40] bg-[#2A2B2F] p-4 text-[13px] text-[#F4F1EA] shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
              <span className="text-xs" style={{ color: MUTED }}>Caja de hoy (ejemplo)</span>
              <div className="flex justify-between"><span>Guaraníes</span><b>Gs. 1.840.000</b></div>
              <div className="flex justify-between"><span>Dólares</span><b>US$ 120,00</b></div>
              <div className="flex justify-between"><span>Reales</span><b>R$ 310,00</b></div>
            </div>
          </div>
        </div>
      </section>

      {/* MODELOS */}
      <section id="modelos" className="py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <SectionTitle eyebrow="Modelos" title="Un sitio con la cara de tu negocio." sub="Elegí el modelo, tu logo y tus colores. Tocá uno para probarlo en vivo." />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {DEMOS.map((d) => {
              const th = THEMES[d.theme];
              return (
                <Link key={d.slug} href={`/${d.slug}`} className="group overflow-hidden rounded-3xl border border-[#DDD6C8] bg-white transition hover:-translate-y-1 hover:shadow-xl">
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
                    <span className="text-sm font-semibold" style={{ color: "#8A6A1F" }}>Ver →</span>
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
          <SectionTitle dark eyebrow="Funciones" title="Todo lo que tu local necesita. Nada que sobre." />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
            {FEATURES.map((f) => (
              <div key={f.t} className="flex flex-col gap-3.5 rounded-3xl border border-[#2C2C31] bg-[#141417] p-7">
                <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "#1F1F23" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ATLAS_GOLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[f.icon]}
                  </svg>
                </span>
                <h3 style={{ fontFamily: H }} className="text-[22px] font-bold text-[#F4F1EA]">{f.t}</h3>
                <p className="text-[15.5px] leading-relaxed" style={{ color: MUTED }}>{f.d}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8 pt-6">
            {[
              ["01", "Lo configuramos por vos", "Cargamos tu menú, tu marca y tus mesas. Vos solo revisás."],
              ["02", "Imprimís tus QR", "Uno por mesa y uno general para Instagram, WhatsApp y el mostrador."],
              ["03", "Empezás a vender", "Los pedidos llegan al panel; la caja y el stock se actualizan solos."],
            ].map(([n, t, d]) => (
              <div key={n} className="flex flex-col gap-3 border-t-2 pt-5" style={{ borderColor: ATLAS_GOLD }}>
                <span style={{ fontFamily: H, color: ATLAS_GOLD }} className="text-[42px] font-extrabold leading-none">{n}</span>
                <h3 style={{ fontFamily: H }} className="text-2xl font-bold text-[#F4F1EA]">{t}</h3>
                <p className="leading-relaxed" style={{ color: MUTED }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANES */}
      <section id="planes" className="py-24">
        <div className={`${wrap} flex flex-col gap-12`}>
          <SectionTitle eyebrow="Planes" title="Simple de contratar. Pagás como prefieras." sub="Guaraníes, dólares o reales." />
          <div className="grid max-w-[940px] grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
            {plans.map((p) => {
              const hi = p.interval === "YEARLY";
              return (
                <div key={p.id} className="flex flex-col gap-5 rounded-3xl border-[1.5px] p-9" style={{ background: hi ? INK : "#FFFFFF", color: hi ? IVORY : INK, borderColor: hi ? ATLAS_GOLD : "#DDD6C8" }}>
                  {hi ? <span className="self-start rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ background: ATLAS_GOLD, color: INK }}>Más elegido</span> : <span className="h-[30px]" />}
                  <h3 style={{ fontFamily: H }} className="text-3xl font-extrabold">{p.name}</h3>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span style={{ fontFamily: H }} className="text-[40px] font-extrabold tracking-tight">{formatPyg(p.pricePyg)}</span>
                    <span style={{ color: hi ? MUTED : "#5F5A52" }}>/ {hi ? "año" : "mes"}</span>
                  </div>
                  <p className="text-sm" style={{ color: hi ? MUTED : "#5F5A52" }}>
                    o {formatMinor(p.priceUsdMinor, "USD")} · {formatMinor(p.priceBrlMinor, "BRL")}
                    {p.setupPyg > 0 && <> · implementación {formatPyg(p.setupPyg)}</>}
                  </p>
                  <ul className="flex flex-col gap-3 text-[15.5px]">
                    {(p.features ?? "").split("\n").filter(Boolean).map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ATLAS_GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5L20 7" /></svg>
                        {f}
                      </li>
                    ))}
                    {p.includesDomain && <li className="flex items-start gap-2.5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ATLAS_GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5L20 7" /></svg>Dominio propio incluido</li>}
                  </ul>
                  <a href={wa} className="mt-auto rounded-2xl py-4 text-center font-bold" style={{ background: hi ? ATLAS_GOLD : INK, color: hi ? INK : IVORY }}>Quiero este plan</a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-24">
        <div className={`${wrap} flex flex-wrap gap-12`}>
          <h2 style={{ fontFamily: H }} className="flex-[1_1_280px] text-[clamp(32px,3.2vw,46px)] font-extrabold leading-tight tracking-tight">Preguntas frecuentes</h2>
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
          <h2 style={{ fontFamily: H }} className="text-[clamp(36px,4.4vw,64px)] font-extrabold leading-[1.04] tracking-tight text-[#F4F1EA]">Llevá tu negocio al siguiente nivel.</h2>
          <p className="max-w-[560px] text-lg" style={{ color: MUTED }}>Te mostramos Atlas funcionando con tu propio menú. Sin compromiso.</p>
          <a href={wa} className="rounded-2xl px-8 py-4 text-lg font-bold" style={{ background: ATLAS_GOLD, color: INK }}>Hablar por WhatsApp</a>
        </div>
      </section>
      <footer style={{ background: INK }} className="border-t border-[#2C2C31]">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-4 py-8 text-sm`} style={{ color: MUTED }}>
          <AtlasLogo height={20} />
          <span>© {new Date().getFullYear()} Atlas · Sistema para gastronomía y comercios</span>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ eyebrow, title, sub, dark }: { eyebrow: string; title: string; sub?: string; dark?: boolean }) {
  return (
    <div className="flex max-w-[720px] flex-col gap-3.5">
      <span className="text-[13px] font-semibold uppercase tracking-[0.22em]" style={{ color: dark ? ATLAS_GOLD : "#8A6A1F" }}>{eyebrow}</span>
      <h2 style={{ fontFamily: H, color: dark ? IVORY : INK }} className="text-[clamp(32px,3.6vw,52px)] font-extrabold leading-[1.08] tracking-[-0.02em]">{title}</h2>
      {sub && <p className="text-lg" style={{ color: dark ? MUTED : "#5F5A52" }}>{sub}</p>}
    </div>
  );
}
