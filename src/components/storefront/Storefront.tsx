"use client";

import { A11yMenu } from "@/components/a11y/A11yMenu";
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, parseMajorToMinor, fromBase, toBase, type Rates } from "@/core/money";
import { formatCpf, isValidCpf, isValidName, tr, type Locale } from "@/core/region";
import { getLabels, type Currency, type OrderType, type PaymentMethod } from "@/core/types";
import type { PublicPaymentConfig } from "@/core/tenant-config";
import { getTheme, type Theme, type ThemeId } from "@/core/themes";
import { Illustration } from "@/components/Illustration";
import { NameInput } from "@/components/forms/NameInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { GoWebLogo } from "@/components/brand/GoWebLogo";

export type StoreProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  illustration: string | null;
  pricePyg: number; // preço efetivo (com oferta relâmpago, se ativa)
  regularPricePyg: number | null; // preço "de" quando há oferta
  promoEndsAt: string | null; // ISO
  durationMin: number | null; // serviço agendável
  soldOut: boolean;
  maxQty: number;
};

export type StoreData = {
  slug: string;
  locale: Locale;
  currency: Currency; // moeda base dos preços
  country: string; // país (formato do telefone)
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentFg: string;
  themeId: ThemeId;
  tagline: string | null;
  banner: {
    tag: string | null;
    title: string | null;
    subtitle: string | null;
    highlight: string | null;
    imageUrl: string | null;
    illustration: string | null;
  };
  address: string | null;
  phone: string | null;
  social: { whatsapp: string | null; instagram: string | null };
  demo?: boolean;
  pro: boolean;
  growth: {
    referralPct: number | null;
    referral: { code: string; firstName: string; pct: number } | null;
    birthday: boolean;
    consent: boolean;
    phoneOnTable: boolean;
  };
  suggestions: Record<string, string[]>;
  booking: { daysAhead: number } | null;
  isOpen: boolean;
  accepts: Record<OrderType, boolean>;
  rates: Rates;
  delivery: { freeOverPyg: number | null };
  table: { code: string; label: string } | null;
  invalidTable: boolean;
  payment: PublicPaymentConfig;
  groups: { id: string; name: string; products: StoreProduct[] }[];
};

type Cart = Record<string, number>;

// Idioma e moeda do estabelecimento disponíveis para todos os componentes do site
type Ctx = { T: (es: string, pt: string) => string; money: (v: number) => string; L: ReturnType<typeof getLabels>; data: StoreData; book: (p: StoreProduct) => void };
const StoreCtx = createContext<Ctx>(null as unknown as Ctx);
const useStore = () => useContext(StoreCtx);
type View = "menu" | "cart" | "checkout";

function useCart(slug: string) {
  const key = `atlas_cart_${slug}`;
  const [cart, setCart] = useState<Cart>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, [key]);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(cart));
    } catch {}
  }, [key, cart]);
  return [cart, setCart] as const;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Storefront({ data }: { data: StoreData }) {
  const theme = getTheme(data.themeId);
  const [cart, setCart] = useCart(data.slug);
  const [view, setView] = useState<View>("menu");
  const [activeCat, setActiveCat] = useState(data.groups[0]?.id);

  const all = useMemo(() => data.groups.flatMap((g) => g.products), [data.groups]);
  const products = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.get(id)!, qty }))
    .filter((l) => l.product && l.qty > 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.product.pricePyg, 0);

  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [booking, setBooking] = useState<StoreProduct | null>(null);
  const [cartId, setCartId] = useState<string | null>(null);
  const [initialCoupon, setInitialCoupon] = useState<string>("");

  // Link de recuperação de carrinho (?carrinho=ID&cupom=CODE) e cupom vindo de campanha (?cupom=CODE)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // origem da visita (?origem= ou utm_source) e indicação (?indicacao=) ficam guardadas por 7 dias
    try {
      const src = sp.get("origem") ?? sp.get("utm_source");
      if (src) localStorage.setItem(`gw_src_${data.slug}`, JSON.stringify({ v: src.slice(0, 40), at: Date.now() }));
      const ind = sp.get("indicacao") ?? sp.get("ref");
      if (ind) localStorage.setItem(`gw_ref_${data.slug}`, JSON.stringify({ v: ind.slice(0, 20), at: Date.now() }));
    } catch {}
    const cupom = sp.get("cupom");
    if (cupom) setInitialCoupon(cupom);
    const cid = sp.get("carrinho");
    try {
      const saved = localStorage.getItem(`gw_cartid_${data.slug}`);
      if (saved) setCartId(saved);
    } catch {}
    if (!cid) return;
    fetch(`/api/carts?slug=${encodeURIComponent(data.slug)}&id=${encodeURIComponent(cid)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { cartId: string; items: { productId: string; quantity: number }[] } | null) => {
        if (!j) return;
        setCart(Object.fromEntries(j.items.filter((i) => products.has(i.productId)).map((i) => [i.productId, i.quantity])));
        setCartId(j.cartId);
        try {
          localStorage.setItem(`gw_cartid_${data.slug}`, j.cartId);
        } catch {}
        setView("cart");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setQty = (id: string, qty: number) => {
    if (data.pro && qty > 0 && !cart[id] && (data.suggestions[id]?.length ?? 0) > 0) setSuggestFor(id);
    setCart((c) => {
      const p = products.get(id);
      const n = { ...c };
      const q = Math.max(0, Math.min(qty, p?.maxQty ?? 99));
      if (q === 0) delete n[id];
      else n[id] = q;
      return n;
    });
  };

  const vars = {
    "--bg": theme.colors.bg,
    "--fg": theme.colors.fg,
    "--surface": theme.colors.surface,
    "--muted": theme.colors.muted,
    "--line": theme.colors.line,
    "--brand": data.primaryColor,
    "--brand-fg": data.accentFg,
    "--font-h": theme.fonts.heading,
    "--font-b": theme.fonts.body,
  } as CSSProperties;

  const tileFor = (i: number) => theme.colors.tiles[i % theme.colors.tiles.length];
  const featured = theme.featured ? all.filter((p) => !p.soldOut).slice(0, 6) : [];

  const ctx: Ctx = { T: tr(data.locale), money: (v: number) => formatMoney(v, data.currency), L: getLabels(data.locale), data, book: (p) => setBooking(p) };
  const { T, money } = ctx;

  return (
    <StoreCtx.Provider value={ctx}>
    <div style={vars} className="th min-h-dvh">
      <div className="mx-auto max-w-xl pb-32">
        <Hero data={data} theme={theme} />
        <SocialBar />
        {data.growth.referral && (
          <div className="anim-fade-up mx-5 mt-4 rounded-2xl px-4 py-3 text-[14px] font-semibold" style={{ background: "var(--brand)", color: "var(--brand-fg)" }}>
            {T(
              `${data.growth.referral.firstName} te recomendó: ${data.growth.referral.pct}% de descuento en tu primera compra. Informá tu WhatsApp al finalizar.`,
              `${data.growth.referral.firstName} indicou você: ${data.growth.referral.pct}% de desconto na primeira compra. Informe seu WhatsApp ao finalizar.`,
            )}
          </div>
        )}
        <FlashOffers products={all} theme={theme} cart={cart} setQty={setQty} tileFor={tileFor} />

        {(data.table || data.invalidTable || !data.isOpen) && (
          <div className="mt-4 space-y-2 px-5">
            {data.table && (
              <div className="th-accent rounded-xl px-4 py-2.5 text-sm font-semibold">{T(`Estás en la ${data.table.label}. Tu pedido llega a tu mesa.`, `Você está na ${data.table.label}. Seu pedido chega na sua mesa.`)}</div>
            )}
            {data.invalidTable && (
              <div className="rounded-xl bg-amber-100 px-4 py-2.5 text-sm text-amber-900">{T("No reconocimos el QR de la mesa. Pedí ayuda al personal.", "Não reconhecemos o QR da mesa. Peça ajuda à equipe.")}</div>
            )}
            {!data.isOpen && (
              <div className="th-surface th-muted rounded-xl border th-line px-4 py-2.5 text-sm">
                {T("El local está cerrado ahora. Podés ver el menú, pero no hacer pedidos.", "O estabelecimento está fechado agora. Você pode ver o cardápio, mas não fazer pedidos.")}
              </div>
            )}
          </div>
        )}

        {featured.length > 0 && (
          <section className="mt-6">
            <h2 className="th-h mb-3 px-5 text-[21px] font-bold">{T("Lo más pedido", "Mais pedidos")}</h2>
            <div className="stagger no-scrollbar flex gap-3 overflow-x-auto px-5">
              {featured.map((p, i) => (
                <div key={p.id} className="flex w-36 shrink-0 flex-col gap-1.5">
                  <ProductImage p={p} tile={tileFor(i)} className="h-36 w-36" radius={theme.radius + 4} size={112} />
                  <span className="text-sm font-bold leading-snug">{p.name}</span>
                  <div className="flex items-center justify-between">
                    <Price p={p} className="th-muted text-[13px]" />
                    {data.isOpen && <Qty p={p} qty={0} onQty={() => setQty(p.id, (cart[p.id] ?? 0) + 1)} canOrder round small />}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Categorias */}
        <nav
          aria-label={T("Categorías", "Categorias")}
          className="no-scrollbar th-bg sticky top-0 z-10 mt-4 flex gap-2 overflow-x-auto px-5 py-3"
          style={{ boxShadow: `0 1px 0 ${theme.colors.line}` }}
        >
          {data.groups.map((g) => (
            <a
              key={g.id}
              href={`#c-${g.id}`}
              onClick={() => setActiveCat(g.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                activeCat === g.id ? "th-accent border-transparent" : "th-surface th-line"
              }`}
            >
              {g.name}
            </a>
          ))}
        </nav>

        <main className="px-5">
          {data.groups.length === 0 && <p className="th-muted py-16 text-center">{T("El menú todavía está vacío.", "O cardápio ainda está vazio.")}</p>}
          {data.groups.map((g, gi) => (
            <section key={g.id} id={`c-${g.id}`} className="scroll-mt-16 pt-6">
              <h2
                className={`th-h mb-3 ${theme.fonts.headingUpper ? "text-[22px] uppercase tracking-wide" : "text-[21px] font-bold"} ${
                  theme.fonts.headingItalic ? "italic" : ""
                }`}
              >
                {g.name}
              </h2>
              {theme.layout === "grid" ? (
                <div className="grid grid-cols-2 gap-3">
                  {g.products.map((p, i) => (
                    <ProductCard key={p.id} p={p} theme={theme} tile={tileFor(gi * 3 + i)} qty={cart[p.id] ?? 0} onQty={(q) => setQty(p.id, q)} canOrder={data.isOpen} />
                  ))}
                </div>
              ) : (
                <ul className="stagger flex flex-col gap-2.5">
                  {g.products.map((p, i) => (
                    <ProductRow key={p.id} p={p} theme={theme} tile={tileFor(gi * 3 + i)} qty={cart[p.id] ?? 0} onQty={(q) => setQty(p.id, q)} canOrder={data.isOpen} />
                  ))}
                </ul>
              )}
            </section>
          ))}
          <div className="mt-10 flex flex-col items-center gap-3">
            <A11yMenu locale={data.locale} variant="light" />
            <p className="th-muted flex items-center justify-center gap-1.5 text-[11px]">
              {T("Hecho con", "Feito com")} <GoWebLogo height={14} ink="currentColor" />
            </p>
          </div>
        </main>
      </div>

      {suggestFor && view === "menu" && (
        <Suggestions
          forProduct={products.get(suggestFor)!}
          items={(data.suggestions[suggestFor] ?? []).map((id) => products.get(id)).filter((x): x is StoreProduct => !!x && !x.soldOut)}
          onAdd={(id) => {
            setQty(id, (cart[id] ?? 0) + 1);
            setSuggestFor(null);
          }}
          onClose={() => setSuggestFor(null)}
          theme={theme}
          tileFor={tileFor}
          lifted={count > 0}
        />
      )}

      {booking && <BookingSheet product={booking} onClose={() => setBooking(null)} />}

      {/* Barra do carrinho */}
      {count > 0 && view === "menu" && (
        <div className="anim-fade-up fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setView("cart")}
            className="th-accent flex w-full items-center justify-between px-5 py-4 text-[15px] font-bold shadow-xl shadow-black/25 transition active:scale-[.99]"
            style={{ borderRadius: theme.radius }}
          >
            <span>
              {T("Ver pedido", "Ver pedido")} · <span key={count} className="anim-pop inline-block">{count}</span>
            </span>
            <span>{money(subtotal)}</span>
          </button>
        </div>
      )}

      {view !== "menu" && (
        <Sheet onClose={() => setView("menu")} title={view === "cart" ? T("Tu pedido", "Seu pedido") : T("Finalizar pedido", "Finalizar pedido")}>
          {view === "cart" ? (
            <CartView lines={lines} subtotal={subtotal} rates={data.rates} onQty={setQty} canOrder={data.isOpen} onNext={() => setView("checkout")} />
          ) : (
            <Checkout
              data={data}
              lines={lines}
              subtotal={subtotal}
              cartId={cartId}
              onCartId={(id) => {
                setCartId(id);
                try {
                  localStorage.setItem(`gw_cartid_${data.slug}`, id);
                } catch {}
              }}
              initialCoupon={initialCoupon}
              onBack={() => setView("cart")}
              onDone={() => {
                setCart({});
                setCartId(null);
                try {
                  localStorage.removeItem(`gw_cartid_${data.slug}`);
                } catch {}
              }}
            />
          )}
        </Sheet>
      )}
    </div>
    </StoreCtx.Provider>
  );
}

// ------------------------------------------------------------------ Hero / banner por tema

function Logo({ data, size, ring }: { data: StoreData; size: number; ring?: string }) {
  const style: CSSProperties = { width: size, height: size, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined };
  if (data.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={data.logoUrl} alt={`Logo ${data.name}`} style={style} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <div style={style} className="th-accent th-h grid shrink-0 place-items-center rounded-full text-[0.9em] font-bold">
      <span style={{ fontSize: size * 0.36 }}>{initials(data.name)}</span>
    </div>
  );
}

function BannerArt({ data, size, className }: { data: StoreData; size: number; className?: string }) {
  if (data.banner.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={data.banner.imageUrl} alt="" className={`object-cover ${className ?? ""}`} />;
  }
  return <Illustration name={data.banner.illustration} size={size} className={className} />;
}

function StatusLine({ data, extra }: { data: StoreData; extra?: string | null }) {
  const { T } = useStore();
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] opacity-80">
      <span className={`inline-block h-2 w-2 rounded-full ${data.isOpen ? "bg-emerald-400" : "bg-zinc-400"}`} />
      {data.isOpen ? T("Abierto", "Aberto") : T("Cerrado", "Fechado")}
      {extra && <span className="truncate">· {extra}</span>}
    </span>
  );
}

function Hero({ data, theme }: { data: StoreData; theme: Theme }) {
  const { T } = useStore();
  const open = data.isOpen ? T("Abierto", "Aberto") : T("Cerrado", "Fechado");
  const b = data.banner;
  const title = b.title || data.name;
  const hasPhoto = !!b.imageUrl;
  const heroStyle: CSSProperties = { background: theme.colors.heroBg, color: theme.colors.heroFg };

  switch (theme.hero) {
    case "promo":
      return (
        <header>
          <div className="relative h-[300px] overflow-hidden" style={heroStyle}>
            <div aria-hidden className="absolute inset-0" style={{ background: `repeating-linear-gradient(-45deg, ${theme.colors.heroAlt} 0 14px, transparent 14px 28px)` }} />
            {hasPhoto ? (
              <BannerArt data={data} size={230} className="absolute inset-y-0 right-0 h-full w-[55%]" />
            ) : (
              <div className="absolute -right-9 top-12">
                <BannerArt data={data} size={230} />
              </div>
            )}
            <div className="relative flex w-[200px] flex-col gap-1.5 pl-5 pt-14">
              {b.tag && <span className="th-accent -rotate-3 self-start rounded-md px-2.5 py-1 text-xs font-extrabold uppercase">{b.tag}</span>}
              <span className="th-h text-[42px] uppercase leading-[0.95]">{title}</span>
              {b.highlight && <span className="th-h th-accent-text text-[26px]">{b.highlight}</span>}
            </div>
          </div>
          <div className="relative -mt-9 flex items-end gap-3 px-5">
            <Logo data={data} size={76} ring={data.primaryColor} />
            <div className="flex min-w-0 flex-col gap-0.5 pb-1">
              <h1 className="th-h truncate text-2xl uppercase">{data.name}</h1>
              <StatusLine data={data} extra={data.tagline ?? data.address} />
            </div>
          </div>
        </header>
      );

    case "circle":
      return (
        <header>
          <div className="relative h-[280px] overflow-hidden" style={heroStyle}>
            <div aria-hidden className="absolute -right-[70px] top-[30px] h-[280px] w-[280px] rounded-full" style={{ background: theme.colors.heroAlt }} />
            {hasPhoto ? (
              <BannerArt data={data} size={250} className="absolute -right-[60px] top-[40px] h-[260px] w-[260px] rounded-full" />
            ) : (
              <div className="absolute -right-10 top-[50px]">
                <BannerArt data={data} size={250} />
              </div>
            )}
            <div className="relative flex w-[180px] flex-col gap-2.5 pl-5 pt-16">
              <span className="th-h text-[32px] font-bold italic leading-[1.05]">{title}</span>
              {b.subtitle && <span className="text-[13px] opacity-75">{b.subtitle}</span>}
              {b.highlight && <span className="th-accent self-start rounded-full px-3 py-1 text-xs font-bold">{b.highlight}</span>}
            </div>
          </div>
          <div className="relative -mt-11 flex flex-col items-center gap-1.5 text-center">
            <Logo data={data} size={86} ring={theme.colors.bg} />
            <h1 className="th-h text-[28px] font-extrabold">{data.name}</h1>
            {data.tagline && <span className="th-muted text-[12px] uppercase tracking-[0.2em]">{data.tagline}</span>}
            <StatusLine data={data} />
          </div>
        </header>
      );

    case "card":
      return (
        <header className="px-5 pt-12">
          <div className="flex items-center justify-between gap-3">
            {data.logoUrl ? (
              <div className="flex items-center gap-2.5">
                <Logo data={data} size={44} />
                <h1 className="th-h truncate text-2xl font-bold">{data.name}</h1>
              </div>
            ) : (
              <h1 className="truncate text-[30px]" style={{ fontFamily: "Pacifico, cursive" }}>
                {data.name}
              </h1>
            )}
            <span className="th-surface shrink-0 rounded-full px-3 py-1.5 text-xs">
              <span className={data.isOpen ? "text-emerald-600" : "text-zinc-400"}>●</span> {open}
            </span>
          </div>
          {(b.title || b.illustration || b.imageUrl) && (
            <div className="relative mt-4 h-[196px] overflow-hidden" style={{ ...heroStyle, borderRadius: 28 }}>
              {hasPhoto ? (
                <BannerArt data={data} size={150} className="absolute inset-y-0 right-0 h-full w-[50%]" />
              ) : (
                <div className="absolute -bottom-1 -right-2.5">
                  <BannerArt data={data} size={150} />
                </div>
              )}
              <div className="relative flex w-[180px] flex-col gap-2 p-5 pt-6">
                <span className="th-h text-[26px] font-extrabold leading-[1.05]">{title}</span>
                {b.subtitle && <span className="text-[13px] opacity-80">{b.subtitle}</span>}
                {b.highlight && <span className="th-accent self-start rounded-full px-3.5 py-2 text-sm font-bold">{b.highlight}</span>}
              </div>
            </div>
          )}
        </header>
      );

    case "showcase":
      return (
        <header className="px-5 pt-12">
          <div className="flex items-center justify-between gap-3">
            {data.logoUrl ? <Logo data={data} size={44} /> : <h1 className="th-h text-[28px] font-extrabold uppercase tracking-[0.08em]">{data.name}</h1>}
            <span className="th-line shrink-0 rounded-full border px-3 py-1.5 text-xs">{data.tagline || open}</span>
          </div>
          {(b.title || b.illustration || b.imageUrl) && (
            <div className="relative mt-4 h-[230px] overflow-hidden rounded-[26px]" style={heroStyle}>
              {hasPhoto ? (
                <BannerArt data={data} size={170} className="absolute inset-y-0 right-0 h-full w-[52%]" />
              ) : (
                <div className="absolute -right-3 top-8">
                  <BannerArt data={data} size={170} />
                </div>
              )}
              <div className="relative flex w-[175px] flex-col gap-2.5 p-5 pt-7">
                {b.tag && (
                  <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: theme.colors.heroAlt }}>
                    {b.tag}
                  </span>
                )}
                <span className="th-h text-[26px] font-extrabold leading-[1.05]">{title}</span>
                {b.highlight && <span className="self-start rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-black">{b.highlight}</span>}
              </div>
            </div>
          )}
        </header>
      );

    case "glow":
      return (
        <header>
          <div className="relative h-[320px] overflow-hidden" style={heroStyle}>
            <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(circle at 75% 45%, ${theme.colors.heroAlt}, transparent 55%)` }} />
            {hasPhoto ? (
              <BannerArt data={data} size={210} className="absolute inset-y-0 right-0 h-full w-[50%] opacity-90" />
            ) : (
              <div className="absolute -right-5 top-[70px]">
                <BannerArt data={data} size={210} />
              </div>
            )}
            <div className="relative flex flex-col gap-1 pl-5 pt-12">
              {data.logoUrl ? (
                <Logo data={data} size={64} />
              ) : (
                <h1 className="th-h th-accent-text text-[52px] uppercase leading-[0.9] tracking-wide">{data.name}</h1>
              )}
              {data.tagline && <span className="text-[11px] uppercase tracking-[0.3em] opacity-90">{data.tagline}</span>}
            </div>
            {(b.title || b.highlight) && (
              <div className="relative ml-5 mt-6 flex w-[175px] flex-col gap-0.5 rounded-2xl border-2 p-3" style={{ borderColor: data.primaryColor, background: "rgba(0,0,0,0.25)" }}>
                {b.title && <span className="th-h text-[28px] uppercase leading-none">{b.title}</span>}
                {b.highlight && <span className="th-accent-text text-[13px] font-bold">{b.highlight}</span>}
              </div>
            )}
          </div>
          <div className="flex gap-2 px-5 pt-4 text-xs">
            <span className="th-line rounded-full border px-3 py-1.5">
              <span className={data.isOpen ? "text-emerald-400" : "text-zinc-400"}>●</span> {open}
            </span>
            {data.address && <span className="th-line truncate rounded-full border px-3 py-1.5">{data.address}</span>}
          </div>
        </header>
      );

    case "pole":
      return (
        <header>
          <div className="relative h-[300px] overflow-hidden" style={heroStyle}>
            <div aria-hidden className="absolute -right-6 top-0 h-full w-[92px] rotate-[8deg] opacity-90" style={{ background: `repeating-linear-gradient(-35deg, ${theme.colors.heroAlt} 0 16px, #F4F1EA 16px 32px, #1F3A5F 32px 48px, #F4F1EA 48px 64px)`, animation: "poleSlide 3.5s linear infinite", backgroundSize: "100% 128px" }} />
            {hasPhoto ? (
              <BannerArt data={data} size={190} className="absolute inset-y-0 right-[70px] h-full w-[45%]" />
            ) : (
              <div className="absolute right-[64px] top-[78px]">
                <BannerArt data={data} size={170} />
              </div>
            )}
            <div className="relative flex w-[200px] flex-col gap-2 pl-5 pt-12">
              <span className="th-accent-text text-[11px] font-bold uppercase tracking-[0.35em]">{b.tag || T("Desde", "Desde") + " · Est."}</span>
              <span className="th-h text-[40px] uppercase leading-[0.95]">{title}</span>
              {b.subtitle && <span className="text-[13px] opacity-75">{b.subtitle}</span>}
              {b.highlight && <span className="th-accent self-start rounded-sm px-3 py-1.5 text-xs font-bold uppercase tracking-wider">{b.highlight}</span>}
            </div>
          </div>
          <div className="th-line flex items-center gap-3 border-b px-5 py-4">
            <Logo data={data} size={58} ring={data.primaryColor} />
            <div className="flex min-w-0 flex-col">
              <h1 className="th-h truncate text-xl uppercase tracking-wide">{data.name}</h1>
              <StatusLine data={data} extra={data.tagline ?? data.address} />
            </div>
          </div>
        </header>
      );

    case "grid":
      return (
        <header>
          <div className="relative h-[300px] overflow-hidden" style={heroStyle}>
            <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: `linear-gradient(${theme.colors.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.colors.line} 1px, transparent 1px)`, backgroundSize: "28px 28px" }} />
            <div aria-hidden className="absolute -right-10 top-10 h-[240px] w-[240px] rounded-full blur-3xl" style={{ background: theme.colors.heroAlt, opacity: 0.28 }} />
            <div aria-hidden className="absolute -left-16 bottom-0 h-[160px] w-[160px] rounded-full blur-3xl" style={{ background: "#7C3AED", opacity: 0.3 }} />
            {hasPhoto ? (
              <BannerArt data={data} size={200} className="absolute inset-y-0 right-0 h-full w-[52%]" />
            ) : (
              <div className="absolute -right-4 top-[64px]">
                <BannerArt data={data} size={200} />
              </div>
            )}
            <div className="relative flex items-center gap-2 px-5 pt-6">
              {data.logoUrl ? <Logo data={data} size={36} /> : <span className="th-accent grid h-9 w-9 place-items-center rounded-lg text-sm font-black">{initials(data.name)}</span>}
              <h1 className="th-h truncate text-lg font-bold">{data.name}</h1>
              <span className="ml-auto rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: theme.colors.line }}>
                <span className={data.isOpen ? "text-emerald-400" : "text-zinc-500"}>●</span> {open}
              </span>
            </div>
            <div className="relative flex w-[190px] flex-col gap-2 pl-5 pt-9">
              {b.tag && <span className="th-accent-text font-mono text-[11px] uppercase tracking-[0.2em]">{"// "}{b.tag}</span>}
              <span className="th-h text-[32px] font-bold leading-[1.02]">{title}</span>
              {b.highlight && <span className="th-accent self-start rounded-lg px-3 py-1.5 text-sm font-bold">{b.highlight}</span>}
            </div>
          </div>
        </header>
      );

    case "luxe":
      return (
        <header>
          <div className="relative h-[320px] overflow-hidden text-center" style={heroStyle}>
            <div aria-hidden className="absolute left-1/2 top-[54px] h-[300px] w-[300px] -translate-x-1/2 rounded-full border" style={{ borderColor: theme.colors.heroAlt, opacity: 0.55 }} />
            <div aria-hidden className="absolute left-1/2 top-[74px] h-[260px] w-[260px] -translate-x-1/2 rounded-full border" style={{ borderColor: theme.colors.heroAlt, opacity: 0.25 }} />
            <div className="relative flex flex-col items-center gap-1 pt-8">
              {data.logoUrl ? <Logo data={data} size={52} /> : null}
              <h1 className="th-h text-[30px] italic leading-none" style={{ color: theme.colors.heroAlt }}>{data.name}</h1>
              {data.tagline && <span className="text-[10px] uppercase tracking-[0.4em] opacity-75">{data.tagline}</span>}
            </div>
            {hasPhoto ? (
              <BannerArt data={data} size={150} className="absolute bottom-0 left-1/2 h-[170px] w-[60%] -translate-x-1/2 rounded-t-full" />
            ) : (
              <div className={`absolute bottom-6 ${b.title || b.highlight ? "left-[62%]" : "left-1/2"} -translate-x-1/2`}>
                <BannerArt data={data} size={150} />
              </div>
            )}
            {(b.title || b.highlight) && (
              <div className="absolute bottom-4 left-4 z-10 flex max-w-[160px] flex-col items-start gap-1 text-left">
                {b.tag && <span className="text-[10px] uppercase tracking-[0.3em]" style={{ color: theme.colors.heroAlt }}>{b.tag}</span>}
                {b.title && <span className="th-h text-[22px] italic leading-tight">{b.title}</span>}
                {b.highlight && <span className="th-accent rounded-full px-3 py-1 text-[11px] font-semibold">{b.highlight}</span>}
              </div>
            )}
          </div>
          <div className="th-line flex justify-center border-b py-3">
            <StatusLine data={data} extra={data.address} />
          </div>
        </header>
      );

    default:
      return (
        <header className="px-5 pt-6">
          <div className="flex items-center gap-3.5">
            {data.logoUrl ? <Logo data={data} size={56} /> : <div className="th-accent th-h grid h-14 w-14 place-items-center rounded-2xl text-xl font-bold">{initials(data.name)}</div>}
            <div className="min-w-0 flex-1">
              <h1 className="th-h truncate text-xl font-bold tracking-tight">{data.name}</h1>
              <StatusLine data={data} extra={data.tagline ?? data.address} />
            </div>
          </div>
          {b.title && (
            <div className="relative mt-4 flex min-h-[150px] overflow-hidden rounded-2xl" style={heroStyle}>
              <div className="relative z-10 flex w-[60%] flex-col justify-center gap-2 p-5">
                {b.tag && <span className="th-accent self-start rounded-md px-2 py-0.5 text-[11px] font-bold uppercase">{b.tag}</span>}
                <span className="th-h text-2xl font-bold leading-tight">{b.title}</span>
                {b.highlight && <span className="text-sm font-semibold opacity-90">{b.highlight}</span>}
              </div>
              {hasPhoto ? (
                <BannerArt data={data} size={140} className="absolute inset-y-0 right-0 h-full w-[45%]" />
              ) : (
                <div className="absolute -bottom-2 right-0">
                  <BannerArt data={data} size={140} />
                </div>
              )}
            </div>
          )}
        </header>
      );
  }
}

// ------------------------------------------------------------------ produtos

function ProductImage({ p, tile, className, radius, size }: { p: StoreProduct; tile: string; className: string; radius: number; size: number }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden ${className}`} style={{ background: tile, borderRadius: radius }}>
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
      ) : p.illustration ? (
        <Illustration name={p.illustration} size={size} />
      ) : (
        <span className="th-h text-2xl font-bold opacity-40">{initials(p.name)}</span>
      )}
    </div>
  );
}

function AddButton({ onClick, label, round, small }: { onClick: () => void; label: string; round?: boolean; small?: boolean }) {
  const { T } = useStore();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${T("Agregar", "Adicionar")} ${label}`}
      className={`th-accent grid shrink-0 place-items-center font-bold transition active:scale-95 ${small ? "h-8 w-8 text-lg" : "h-10 w-10 text-xl"} ${
        round ? "rounded-full" : "rounded-xl"
      }`}
    >
      +
    </button>
  );
}

function Stepper({ qty, onQty, max }: { qty: number; onQty: (q: number) => void; max: number }) {
  const { T } = useStore();
  return (
    <div className="th-line th-bg flex h-10 items-center rounded-full border">
      <button onClick={() => onQty(qty - 1)} className="h-10 w-9 text-lg font-semibold" aria-label={T("Quitar uno", "Remover um")}>
        −
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums">{qty}</span>
      <button onClick={() => onQty(qty + 1)} disabled={qty >= max} className="h-10 w-9 text-lg font-semibold disabled:opacity-30" aria-label={T("Agregar uno", "Adicionar um")}>
        +
      </button>
    </div>
  );
}

function Qty({ p, qty, onQty, canOrder, round, small }: { p: StoreProduct; qty: number; onQty: (q: number) => void; canOrder: boolean; round?: boolean; small?: boolean }) {
  const { T, book } = useStore();
  if (p.durationMin)
    return (
      <button type="button" onClick={() => book(p)} className="th-accent shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition active:scale-95">
        {T("Reservar", "Agendar")}
      </button>
    );
  if (p.soldOut) return <span className="th-muted text-[11px] font-bold uppercase tracking-wide">{T("Agotado", "Esgotado")}</span>;
  if (!canOrder) return null;
  if (qty === 0) return <AddButton onClick={() => onQty(1)} label={p.name} round={round} small={small} />;
  return <Stepper qty={qty} onQty={onQty} max={p.maxQty} />;
}

function ProductRow({ p, theme, tile, qty, onQty, canOrder }: { p: StoreProduct; theme: Theme; tile: string; qty: number; onQty: (q: number) => void; canOrder: boolean }) {
  return (
    <li className={`th-surface flex items-center gap-3.5 p-3 ${p.soldOut ? "opacity-50" : ""}`} style={{ borderRadius: theme.radius }}>
      <ProductImage p={p} tile={tile} className="h-[84px] w-[84px]" radius={theme.radius - 4} size={70} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className={`th-h leading-tight ${theme.fonts.headingUpper ? "text-[19px] uppercase tracking-wide" : "text-[15.5px] font-bold"}`}>{p.name}</h3>
        {p.description && <p className="th-muted line-clamp-2 text-[12.5px] leading-snug">{p.description}</p>}
        <Price p={p} className={`mt-1 text-[15px] font-bold ${theme.dark ? "th-accent-text" : ""}`} />
      </div>
      <Qty p={p} qty={qty} onQty={onQty} canOrder={canOrder} />
    </li>
  );
}

function ProductCard({ p, theme, tile, qty, onQty, canOrder }: { p: StoreProduct; theme: Theme; tile: string; qty: number; onQty: (q: number) => void; canOrder: boolean }) {
  return (
    <div className={`th-surface flex flex-col overflow-hidden border th-line ${p.soldOut ? "opacity-50" : ""}`} style={{ borderRadius: theme.radius }}>
      <ProductImage p={p} tile={tile} className="h-[130px] w-full" radius={0} size={110} />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="th-h text-[15.5px] font-bold leading-tight">{p.name}</h3>
        {p.description && <p className="th-muted line-clamp-2 text-[12px] leading-snug">{p.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Price p={p} className="text-[13.5px] font-bold" />
          <Qty p={p} qty={qty} onQty={onQty} canOrder={canOrder} round small />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sheet, carrinho e checkout

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { T } = useStore();
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="anim-fade-in fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="anim-sheet-up th-bg flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="th-line flex items-center justify-between border-b px-5 py-4">
          <h2 className="th-h text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="th-surface th-line grid h-9 w-9 place-items-center rounded-full border" aria-label={T("Cerrar", "Fechar")}>
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

type Line = { product: StoreProduct; qty: number };

const box = "th-surface th-line rounded-2xl border";
const primaryBtn = "th-accent w-full rounded-2xl py-4 text-[15px] font-bold transition active:scale-[.99] disabled:opacity-40";
const ghostBtn = "th-surface th-line rounded-2xl border px-5 py-4 text-sm font-semibold";

function CartView({ lines, subtotal, rates, onQty, onNext, canOrder }: { lines: Line[]; subtotal: number; rates: Rates; onQty: (id: string, q: number) => void; onNext: () => void; canOrder: boolean }) {
  const { T, money, data } = useStore();
  const others = (["PYG", "USD", "BRL"] as Currency[]).filter((c) => c !== data.currency && data.payment.options.some((o) => o.currencies.includes(c)));
  if (lines.length === 0) return <p className="th-muted py-10 text-center">{T("Tu pedido está vacío.", "Seu pedido está vazio.")}</p>;
  return (
    <div className="space-y-4">
      <ul className={`${box} divide-y`} style={{ borderColor: "var(--line)" }}>
        {lines.map((l) => (
          <li key={l.product.id} className="th-line flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{l.product.name}</p>
              <p className="th-muted text-[13px]">{money(l.product.pricePyg * l.qty)}</p>
            </div>
            <Stepper qty={l.qty} onQty={(q) => onQty(l.product.id, q)} max={l.product.maxQty} />
          </li>
        ))}
      </ul>
      <div className="flex items-end justify-between px-1">
        <span className="th-muted">Subtotal</span>
        <div className="text-right">
          <p className="text-xl font-bold">{money(subtotal)}</p>
          {others.length > 0 && (
            <p className="th-muted text-xs">≈ {others.map((c) => formatMoney(fromBase(subtotal, data.currency, c, rates), c)).join(" · ")}</p>
          )}
        </div>
      </div>
      <button onClick={onNext} disabled={!canOrder} className={primaryBtn}>
        {T("Continuar", "Continuar")}
      </button>
    </div>
  );
}

type Quote = { state: "idle" } | { state: "loading" } | { state: "ok"; feePyg: number; distanceKm?: number; free?: boolean } | { state: "error"; message: string };

function Checkout({
  data,
  lines,
  subtotal,
  cartId,
  onCartId,
  initialCoupon,
  onBack,
  onDone,
}: {
  data: StoreData;
  lines: Line[];
  subtotal: number;
  cartId: string | null;
  onCartId: (id: string) => void;
  initialCoupon: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { T, money, L } = useStore();
  const [couponInput, setCouponInput] = useState(initialCoupon);
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const router = useRouter();
  const base = data.currency;
  const typeOptions = (["PICKUP", "DELIVERY"] as const).filter((t) => data.accepts[t]);
  const [type, setType] = useState<OrderType>(data.table ? "DINE_IN" : typeOptions[0] ?? "PICKUP");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthday, setBirthday] = useState("");
  const [optIn, setOptIn] = useState(false);
  const refCode = readStored(`gw_ref_${data.slug}`);
  const [phone, setPhone] = useState<string | null>(null); // E.164 válido ou null
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [quote, setQuote] = useState<Quote>({ state: "idle" });
  const [notes, setNotes] = useState("");
  const options = data.payment.options;
  const [method, setMethod] = useState<PaymentMethod | undefined>(options[0]?.method);
  const option = options.find((o) => o.method === method);
  const [currency, setCurrency] = useState<Currency>(option?.currencies.includes(base) ? base : option?.currencies[0] ?? base);
  const [tendered, setTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (option && !option.currencies.includes(currency)) setCurrency(option.currencies.includes(base) ? base : option.currencies[0]);
  }, [option, currency, base]);

  useEffect(() => {
    if (type !== "DELIVERY" || !coords) return;
    let cancel = false;
    setQuote({ state: "loading" });
    fetch("/api/delivery-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: data.slug, ...coords, subtotalPyg: subtotal }),
    })
      .then((r) => r.json())
      .then((q) => {
        if (cancel) return;
        if (q.ok) setQuote({ state: "ok", feePyg: q.feePyg, distanceKm: q.distanceKm, free: q.free });
        else if (q.reason === "NO_STORE_LOCATION") setQuote({ state: "ok", feePyg: q.baseFeePyg ?? 0 });
        else
          setQuote({
            state: "error",
            message: q.reason === "OUT_OF_RANGE" ? T(`Fuera del área de delivery (${q.distanceKm} km)`, `Fora da área de entrega (${q.distanceKm} km)`) : T("No se pudo calcular", "Não foi possível calcular"),
          });
      })
      .catch(() => !cancel && setQuote({ state: "error", message: T("No se pudo calcular", "Não foi possível calcular") }));
    return () => {
      cancel = true;
    };
  }, [type, coords, subtotal, data.slug, T]);

  const locate = () => {
    if (!navigator.geolocation) return setQuote({ state: "error", message: T("Tu navegador no comparte ubicación", "Seu navegador não compartilha localização") });
    setQuote({ state: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setQuote({ state: "error", message: T("Permití el acceso a la ubicación para calcular el delivery", "Permita o acesso à localização para calcular a entrega") }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // Cupom (GoInteligence)
  const applyCoupon = async (code = couponInput) => {
    if (!code.trim()) return;
    setCouponMsg(null);
    const r = await fetch("/api/coupons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: data.slug, code, subtotalPyg: subtotal }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: T("No se pudo validar", "Não foi possível validar") }));
    if (r.ok) setCoupon({ code: r.code, discount: r.discountPyg });
    else {
      setCoupon(null);
      setCouponMsg(r.error ?? T("Cupón inválido", "Cupom inválido"));
    }
  };
  useEffect(() => {
    if (data.pro && initialCoupon) applyCoupon(initialCoupon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // recalcula o desconto se o carrinho mudar
  useEffect(() => {
    if (coupon) applyCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  // Carrinho abandonado (GoInteligence): guarda o carrinho de quem já deixou o WhatsApp
  const itemsKey = lines.map((l) => `${l.product.id}:${l.qty}`).join(",");
  useEffect(() => {
    if (!data.pro || !phone || lines.length === 0) return;
    const h = setTimeout(() => {
      fetch("/api/carts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: data.slug, cartId, name: name || null, phone, items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })) }),
      })
        .then((r) => r.json())
        .then((j) => j.cartId && j.cartId !== cartId && onCartId(j.cartId))
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, name, itemsKey]);

  // indicação: desconto na primeira compra (o servidor confere; não soma com cupom)
  const refDiscount = !coupon && refCode && data.growth.referralPct && phone ? Math.floor((subtotal * data.growth.referralPct) / 100) : 0;
  const discount = coupon?.discount ?? refDiscount;
  const deliveryFee = type === "DELIVERY" && quote.state === "ok" ? quote.feePyg : 0;
  const total = subtotal - discount + deliveryFee;
  const totalInCurrency = fromBase(total, base, currency, data.rates);
  const tenderedMinor = tendered ? parseMajorToMinor(tendered, currency) : null;
  const tenderedBase = tenderedMinor == null ? null : toBase(tenderedMinor, currency, base, data.rates);
  const change = tenderedBase != null ? tenderedBase - total : null;
  const nameOk = isValidName(name);
  const phoneRequired = type === "DELIVERY";
  const cpfOk = !cpf || isValidCpf(cpf);

  const canSubmit =
    nameOk &&
    cpfOk &&
    !!method &&
    !submitting &&
    (!phoneRequired || !!phone) &&
    (type !== "DELIVERY" || (address.trim() && quote.state === "ok")) &&
    (method !== "CASH" || !tendered || (change != null && change >= 0));

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: data.slug,
          customerName: name.trim(),
          customerPhone: phone,
          customerDoc: cpf.replace(/\D/g, "") || null,
          type,
          tableCode: data.table?.code ?? null,
          address: type === "DELIVERY" ? address : null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          notes: notes || null,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
          paymentMethod: method,
          payCurrency: currency,
          cashTenderedMinor: method === "CASH" ? tenderedMinor : null,
          couponCode: coupon?.code ?? null,
          cartId,
          source: readStored(`gw_src_${data.slug}`),
          refCode,
          marketingOptIn: data.growth.consent && phone ? optIn : null,
          birthday: data.growth.birthday && birthday ? birthday : null,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error ?? T("No se pudo enviar el pedido", "Não foi possível enviar o pedido"));
      onDone();
      if (out.redirectUrl) window.location.href = out.redirectUrl;
      else router.push(`/${data.slug}/pedido/${out.orderId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setSubmitting(false);
    }
  };

  const sym = (c: Currency) => (c === "PYG" ? "Gs." : c === "USD" ? "US$" : "R$");

  return (
    <div className="space-y-5">
      {data.table ? (
        <div className={`${box} px-4 py-3 text-sm`}>
          <span className="th-muted">{T("Pedido para", "Pedido para")} </span>
          <b>{data.table.label}</b>
        </div>
      ) : (
        <Segmented value={type} onChange={(v) => setType(v as OrderType)} options={typeOptions.map((t) => ({ value: t, label: L.orderType[t] }))} />
      )}

      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="name">{T("Tu nombre", "Seu nome")}</label>
          <NameInput id="name" value={name} onChange={setName} placeholder={T("Ej: Ana", "Ex: Ana")} />
          {name && !nameOk && <p className="mt-1 text-[12px] text-red-500">{T("Escribí al menos 2 letras", "Digite pelo menos 2 letras")}</p>}
        </div>
        {data.country === "BR" && (
          <div>
            <label className="label" htmlFor="cpf">CPF na nota (opcional)</label>
            <input
              id="cpf"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              placeholder="000.000.000-00"
              onChange={(e) => setCpf(formatCpf(e.target.value))}
            />
            {cpf && !cpfOk && (
              <p className="mt-1 text-[12px] text-red-500">
                {cpf.replace(/\D/g, "").length < 11 ? "Digite os 11 números do CPF ou deixe em branco" : "CPF inválido — confira os números"}
              </p>
            )}
          </div>
        )}
        {(type === "DELIVERY" || type === "PICKUP" || data.growth.phoneOnTable) && (
          <div>
            <label className="label" htmlFor="phone">
              WhatsApp{!phoneRequired && ` (${T("opcional", "opcional")})`}
            </label>
            <PhoneInput id="phone" defaultCountry={data.country} locale={data.locale} onChange={(e) => setPhone(e)} />
            {data.growth.phoneOnTable && !phoneRequired && (
              <p className="th-muted mt-1 text-[12px]">{T("Con tu WhatsApp acumulás beneficios y recibís tus premios.", "Com seu WhatsApp você acumula benefícios e recebe seus prêmios.")}</p>
            )}
          </div>
        )}
        {data.growth.birthday && phone && (
          <div>
            <label className="label" htmlFor="bday">{T("Tu cumpleaños (opcional)", "Seu aniversário (opcional)")}</label>
            <input
              id="bday"
              className="input"
              inputMode="numeric"
              placeholder={T("DD/MM", "DD/MM")}
              value={birthday}
              maxLength={5}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                setBirthday(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
              }}
            />
            <p className="th-muted mt-1 text-[12px]">{T("Te mandamos un regalo en tu cumpleaños.", "A gente manda um presente no seu aniversário.")}</p>
          </div>
        )}
        {data.growth.consent && phone && (
          <label className="flex items-start gap-3 text-[13.5px]">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>{T(`Quiero recibir ofertas de ${data.name} por WhatsApp. Puedo cancelar cuando quiera.`, `Quero receber ofertas da ${data.name} pelo WhatsApp. Posso cancelar quando quiser.`)}</span>
          </label>
        )}
        {type === "DELIVERY" && (
          <div className="space-y-2">
            <label className="label" htmlFor="addr">{T("Dirección de entrega", "Endereço de entrega")}</label>
            <input id="addr" className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={T("Calle, número, referencia", "Rua, número, complemento")} autoComplete="street-address" />
            <button type="button" onClick={locate} className={`${ghostBtn} w-full py-3`}>
              {coords ? T("Ubicación compartida — actualizar", "Localização compartilhada — atualizar") : T("Compartir ubicación para calcular el delivery", "Compartilhar localização para calcular a entrega")}
            </button>
            {quote.state === "loading" && <p className="th-muted text-[13px]">{T("Calculando delivery…", "Calculando entrega…")}</p>}
            {quote.state === "error" && <p className="text-[13px] text-red-500">{quote.message}</p>}
            {quote.state === "ok" && (
              <p className="th-muted text-[13px]">
                {T("Delivery", "Entrega")}: <b style={{ color: "var(--fg)" }}>{quote.free ? T("Gratis", "Grátis") : money(quote.feePyg)}</b>
                {quote.distanceKm != null && ` · ${quote.distanceKm} km`}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="label !mb-0">{T("¿Cómo pagás?", "Como você vai pagar?")}</p>
        {options.length === 0 && <p className="text-sm text-red-500">{T("El local no configuró medios de pago.", "O estabelecimento não configurou formas de pagamento.")}</p>}
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <button
              key={o.method}
              type="button"
              onClick={() => setMethod(o.method)}
              aria-pressed={method === o.method}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${method === o.method ? "th-accent border-transparent" : "th-surface th-line"}`}
            >
              {L.paymentMethod[o.method]}
            </button>
          ))}
        </div>
        {option && option.currencies.length > 1 && (
          <Segmented value={currency} onChange={(v) => setCurrency(v as Currency)} options={option.currencies.map((c) => ({ value: c, label: sym(c) }))} />
        )}
        {method === "CASH" && (
          <div>
            <label className="label" htmlFor="tendered">{T("¿Con cuánto pagás? (para el vuelto, opcional)", "Vai pagar com quanto? (para o troco, opcional)")}</label>
            <input
              id="tendered"
              className="input"
              value={tendered}
              onChange={(e) => setTendered(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder={currency === "PYG" ? "100.000" : "50"}
            />
            {change != null && (
              <p className={`mt-1.5 text-[13px] ${change < 0 ? "text-red-500" : "th-muted"}`}>
                {change < 0 ? T("El monto es menor al total", "O valor é menor que o total") : <>{T("Vuelto", "Troco")}: <b style={{ color: "var(--fg)" }}>{money(change)}</b></>}
              </p>
            )}
          </div>
        )}
        {method === "PIX" && data.payment.pixKey && (
          <p className={`${box} px-4 py-3 text-[13px]`}>
            {T("Al confirmar te mostramos la clave Pix", "Ao confirmar mostramos a chave Pix")} <b>{data.payment.pixKey}</b>.
          </p>
        )}
      </div>

      {data.pro && (
        <div>
          <label className="label" htmlFor="coupon">{T("Cupón de descuento", "Cupom de desconto")}</label>
          <div className="flex gap-2">
            <input
              id="coupon"
              className="input uppercase"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
              placeholder={T("Ej: BIENVENIDO10", "Ex: BEMVINDO10")}
              maxLength={24}
            />
            <button type="button" onClick={() => applyCoupon()} className={`${ghostBtn} shrink-0 px-4 py-2`}>
              {T("Aplicar", "Aplicar")}
            </button>
          </div>
          {coupon && <p className="mt-1 text-[12.5px] text-emerald-600">✓ {T("Cupón aplicado", "Cupom aplicado")}: -{money(coupon.discount)}</p>}
          {couponMsg && <p className="mt-1 text-[12.5px] text-red-500">{couponMsg}</p>}
        </div>
      )}

      <div>
        <label className="label" htmlFor="notes">{T("Observaciones (opcional)", "Observações (opcional)")}</label>
        <textarea id="notes" className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={T("Algún detalle sobre tu pedido…", "Algum detalhe sobre o seu pedido…")} />
      </div>

      <div className={`${box} space-y-1.5 p-4 text-sm`}>
        <Row k="Subtotal" v={money(subtotal)} />
        {discount > 0 && (
          <Row
            k={coupon ? `${T("Descuento", "Desconto")} (${coupon.code})` : `${T("Descuento por recomendación", "Desconto de indicação")} (${data.growth.referralPct}%)`}
            v={<span className="text-emerald-600">-{money(discount)}</span>}
          />
        )}
        {!coupon && refCode && data.growth.referralPct && !phone && (
          <p className="text-[12px] text-emerald-600">{T(`Informá tu WhatsApp para usar el ${data.growth.referralPct}% de descuento por recomendación (primera compra).`, `Informe seu WhatsApp para usar ${data.growth.referralPct}% de desconto de indicação (primeira compra).`)}</p>
        )}
        {type === "DELIVERY" && <Row k={T("Delivery", "Entrega")} v={quote.state === "ok" ? (quote.free ? T("Gratis", "Grátis") : money(deliveryFee)) : "—"} />}
        <div className="th-line my-2 border-t" />
        <Row k={<b>Total</b>} v={<b className="text-lg">{money(total)}</b>} />
        {currency !== base && <Row k={`${T("En", "Em")} ${L.currency[currency]}`} v={<b>{formatMoney(totalInCurrency, currency)}</b>} />}
        {currency !== base && (
          <p className="th-muted pt-1 text-xs">
            {T("Cotización del local", "Cotação do estabelecimento")}: 1 {currency} = {money(Math.round(data.rates[currency] * (base === "PYG" ? 1 : 100)))}
          </p>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-800">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onBack} className={ghostBtn}>
          {T("Volver", "Voltar")}
        </button>
        <button onClick={submit} disabled={!canSubmit} className={`${primaryBtn} flex-1`}>
          {submitting ? T("Enviando…", "Enviando…") : `${T("Confirmar", "Confirmar")} · ${formatMoney(totalInCurrency, currency)}`}
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="th-muted">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  if (options.length <= 1) return null;
  return (
    <div className="th-surface th-line flex rounded-xl border p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${value === o.value ? "th-accent" : "th-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ preço, redes sociais e GoInteligence

function Price({ p, className }: { p: StoreProduct; className?: string }) {
  const { money } = useStore();
  if (!p.regularPricePyg) return <span className={className}>{money(p.pricePyg)}</span>;
  return (
    <span className={`flex flex-wrap items-baseline gap-x-1.5 ${className ?? ""}`}>
      <span className="text-[0.8em] font-normal line-through opacity-50">{money(p.regularPricePyg)}</span>
      <span className="text-emerald-500">{money(p.pricePyg)}</span>
    </span>
  );
}

const WA_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
  </svg>
);
const IG_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** WhatsApp e Instagram do estabelecimento (ícones clicáveis). */
function SocialBar() {
  const { data, T } = useStore();
  const wa = data.social.whatsapp;
  const ig = data.social.instagram?.replace(/^@/, "");
  const [hint, setHint] = useState(false);
  if (!wa && !ig) return null;
  // Loja de demonstração: os botões são só ilustrativos (não abrem número/perfil de ninguém)
  const demoProps = data.demo
    ? {
        href: undefined,
        role: "button",
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          setHint(true);
        },
      }
    : {};
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 px-5">
      {wa && (
        <a
          href={`https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(T(`¡Hola ${data.name}!`, `Olá, ${data.name}!`))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "#25D366" }}
          aria-label="WhatsApp"
          {...demoProps}
        >
          {WA_ICON} WhatsApp
        </a>
      )}
      {ig && (
        <a
          href={`https://instagram.com/${encodeURIComponent(ig)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "linear-gradient(45deg,#F58529,#DD2A7B 50%,#8134AF 80%,#515BD4)" }}
          aria-label="Instagram"
          {...demoProps}
        >
          {IG_ICON} {data.demo ? "Instagram" : `@${ig}`}
        </a>
      )}
      {hint && (
        <span className="anim-fade-up w-full text-[12px] opacity-70">
          {T("Demostración: en tu tienda, estos botones abren tu WhatsApp y tu Instagram.", "Demonstração: na sua loja, estes botões abrem o seu WhatsApp e o seu Instagram.")}
        </span>
      )}
    </div>
  );
}

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [iso]);
  if (!iso) return null;
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  const sec = Math.floor((ms % 60e3) / 1000);
  if (h >= 24) return { done: false, text: `${Math.floor(h / 24)}d ${h % 24}h ${String(m).padStart(2, "0")}m` };
  return { done: ms === 0, text: `${h > 0 ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s` };
}

/** Faixa de ofertas relâmpago com contagem regressiva. */
function FlashOffers({
  products,
  theme,
  cart,
  setQty,
  tileFor,
}: {
  products: StoreProduct[];
  theme: Theme;
  cart: Record<string, number>;
  setQty: (id: string, q: number) => void;
  tileFor: (i: number) => string;
}) {
  const { T, data } = useStore();
  const offers = products.filter((p) => p.promoEndsAt && p.regularPricePyg);
  const firstEnd = offers.map((p) => p.promoEndsAt!).sort()[0] ?? null;
  const cd = useCountdown(firstEnd);
  if (!offers.length || cd?.done) return null;
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2 px-5">
        <h2 className="th-h whitespace-nowrap text-[19px] font-bold">{T("Oferta relámpago", "Oferta relâmpago")}</h2>
        {cd && (
          <span className="shrink-0 whitespace-nowrap rounded-full bg-red-600 px-3 py-1 text-[12px] font-bold tabular-nums text-white">
            {T("Termina en", "Acaba em")} {cd.text}
          </span>
        )}
      </div>
      <div className="stagger no-scrollbar flex gap-3 overflow-x-auto px-5">
        {offers.map((p, i) => {
          const pct = Math.round((1 - p.pricePyg / p.regularPricePyg!) * 100);
          return (
            <div key={p.id} className="relative flex w-40 shrink-0 flex-col gap-1.5">
              <span className="absolute left-2 top-2 z-10 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-black text-white">-{pct}%</span>
              <ProductImage p={p} tile={tileFor(i + 1)} className="h-36 w-40" radius={theme.radius + 4} size={112} />
              <span className="text-sm font-bold leading-snug">{p.name}</span>
              <div className="flex items-center justify-between gap-1">
                <Price p={p} className="text-[13px] font-bold" />
                {data.isOpen && !p.soldOut && !p.durationMin && <AddButton onClick={() => setQty(p.id, (cart[p.id] ?? 0) + 1)} label={p.name} round small />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Sugestão inteligente: aparece ao adicionar um item ("Combina com..."). */
function Suggestions({
  forProduct,
  items,
  onAdd,
  onClose,
  theme,
  tileFor,
  lifted,
}: {
  forProduct: StoreProduct;
  items: StoreProduct[];
  onAdd: (id: string) => void;
  onClose: () => void;
  theme: Theme;
  tileFor: (i: number) => string;
  lifted: boolean;
}) {
  const { T } = useStore();
  if (!items.length) return null;
  return (
    <div className={`fixed inset-x-0 z-20 mx-auto max-w-xl px-4 ${lifted ? "bottom-[88px]" : "bottom-4"}`}>
      <div className="th-surface th-line rounded-2xl border p-3 shadow-2xl shadow-black/30" style={{ borderRadius: theme.radius + 2 }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold">
            {T("Combina con", "Combina com")} <span className="th-muted font-semibold">{forProduct.name}</span>
          </p>
          <button onClick={onClose} className="th-muted px-1 text-sm" aria-label={T("Cerrar", "Fechar")}>
            ✕
          </button>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {items.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onAdd(p.id)}
              className="th-bg th-line flex w-[178px] shrink-0 items-center gap-2 rounded-xl border p-2 text-left transition active:scale-[.98]"
            >
              <ProductImage p={p} tile={tileFor(i)} className="h-11 w-11" radius={10} size={38} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[12.5px] font-bold leading-tight">{p.name}</span>
                <Price p={p} className="text-[12px]" />
              </span>
              <span className="th-accent grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm font-bold">+</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Agendamento de serviço (barbearia etc.): escolhe dia e horário, informa nome e WhatsApp. */
function BookingSheet({ product, onClose }: { product: StoreProduct; onClose: () => void }) {
  const { T, data, money } = useStore();
  const days = useMemo(() => {
    const out: { iso: string; label: string }[] = [];
    const fmt = new Intl.DateTimeFormat(data.locale === "pt" ? "pt-BR" : "es-PY", { weekday: "short", day: "2-digit", month: "2-digit" });
    for (let i = 0; i < (data.booking?.daysAhead ?? 14); i++) {
      const d = new Date(Date.now() + i * 864e5);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ iso, label: i === 0 ? T("Hoy", "Hoje") : i === 1 ? T("Mañana", "Amanhã") : fmt.format(d) });
    }
    return out;
  }, [data.booking, data.locale, T]);
  const [day, setDay] = useState(days[0]?.iso);
  const [slots, setSlots] = useState<{ label: string; startsAt: string }[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    setSlots(null);
    setSlot(null);
    fetch(`/api/agenda/slots?slug=${encodeURIComponent(data.slug)}&productId=${product.id}&date=${day}`)
      .then((r) => r.json())
      .then((j) => setSlots(j.slots ?? []))
      .catch(() => setSlots([]));
  }, [day, data.slug, product.id]);

  const send = async () => {
    setSending(true);
    setError(null);
    const r = await fetch("/api/agenda", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: data.slug, productId: product.id, startsAt: slot, customerName: name.trim(), customerPhone: phone }),
    });
    const j = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) return setError(j.error ?? T("No se pudo reservar", "Não foi possível agendar"));
    setDone(true);
  };

  return (
    <Sheet onClose={onClose} title={`${T("Reservar", "Agendar")}: ${product.name}`}>
      {done ? (
        <div className="space-y-3 py-6 text-center">
          
          <p className="text-lg font-bold">{T("¡Pedido de turno enviado!", "Pedido de horário enviado!")}</p>
          <p className="th-muted text-sm">
            {T("Te confirmamos por WhatsApp en breve.", "Você vai receber a confirmação no WhatsApp em breve.")}
          </p>
          <button onClick={onClose} className={`${primaryBtn} mt-2`}>
            OK
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="th-muted text-sm">
            {money(product.pricePyg)} · {product.durationMin} min
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {days.map((d) => (
              <button
                key={d.iso}
                onClick={() => setDay(d.iso)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-[13px] font-semibold capitalize ${day === d.iso ? "th-accent border-transparent" : "th-surface th-line"}`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div>
            {slots === null ? (
              <p className="th-muted text-sm">{T("Buscando horarios…", "Buscando horários…")}</p>
            ) : slots.length === 0 ? (
              <p className="th-muted text-sm">{T("Sin horarios libres este día.", "Sem horários livres neste dia.")}</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {slots.map((s) => (
                  <button
                    key={s.startsAt}
                    onClick={() => setSlot(s.startsAt)}
                    className={`rounded-lg border py-2 text-[13px] font-semibold tabular-nums ${slot === s.startsAt ? "th-accent border-transparent" : "th-surface th-line"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {slot && (
            <div className="space-y-3">
              <div>
                <label className="label" htmlFor="bname">{T("Tu nombre", "Seu nome")}</label>
                <NameInput id="bname" value={name} onChange={setName} />
              </div>
              <div>
                <label className="label" htmlFor="bphone">WhatsApp</label>
                <PhoneInput id="bphone" defaultCountry={data.country} locale={data.locale} onChange={(e) => setPhone(e)} />
              </div>
            </div>
          )}
          {error && <p className="rounded-xl bg-red-100 px-4 py-3 text-sm text-red-800">{error}</p>}
          <button onClick={send} disabled={!slot || !isValidName(name) || !phone || sending} className={primaryBtn}>
            {sending ? T("Enviando…", "Enviando…") : T("Pedir turno", "Pedir horário")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Valor guardado pela loja (origem/indicação), válido por 7 dias. */
function readStored(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const j = JSON.parse(raw) as { v: string; at: number };
    return Date.now() - j.at < 7 * 864e5 ? j.v : null;
  } catch {
    return null;
  }
}
