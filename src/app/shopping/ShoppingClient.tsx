"use client";
import { useMemo, useState } from "react";
import { GoWebMark } from "@/components/brand/GoWebLogo";
import { Illustration } from "@/components/Illustration";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { A11yMenu } from "@/components/a11y/A11yMenu";
import { NET_CATS, type NetCat } from "@/core/network";
import type { NetStore } from "@/services/network";

const H = "'Bricolage Grotesque', system-ui, sans-serif";

type Props = { locale: "es" | "pt"; stores: NetStore[]; country: string; cameFrom: string | null; joinUrl: string; texts: { title: string; h1: string; sub: string } };

export function ShoppingClient({ locale, stores, country, joinUrl, texts }: Props) {
  const pt = locale === "pt";
  const T = (es: string, p: string) => (pt ? p : es);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<NetCat | "all">("all");
  const [ctry, setCtry] = useState(stores.some((s) => s.country === country) ? country : (stores[0]?.country ?? country));
  const countries = [...new Set(stores.map((s) => s.country))];

  const inCountry = stores.filter((s) => s.country === ctry);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const shown = useMemo(() => {
    const n = norm(q.trim());
    return inCountry.filter((s) => (cat === "all" || s.category === cat) && (!n || norm(s.name).includes(n) || norm(s.tagline ?? "").includes(n) || s.products.some((p) => norm(p.name).includes(n))));
  }, [inCountry, cat, q]);
  const cats = NET_CATS.filter((c) => inCountry.some((s) => s.category === c.id));
  const products = shown.flatMap((s) => s.products.slice(0, 3).map((p) => ({ ...p, store: s }))).slice(0, 18);
  const street = inCountry.length ? [...inCountry, ...inCountry] : [];

  return (
    <div className="shop min-h-dvh" lang={pt ? "pt-BR" : "es"}>
      <header className="sticky top-0 z-30 border-b border-[var(--sh-line)] bg-[var(--sh-bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-5 py-3">
          <a href={joinUrl} className="flex items-center gap-2" aria-label="GoWeb">
            <GoWebMark size={34} />
            <span style={{ fontFamily: H }} className="text-xl font-extrabold">{texts.title}</span>
          </a>
          <div className="order-last w-full sm:order-none sm:ml-4 sm:w-auto sm:flex-1">
            <label htmlFor="busca" className="sr-only">{T("Buscar tiendas o productos", "Buscar lojas ou produtos")}</label>
            <input id="busca" value={q} onChange={(e) => setQ(e.target.value)} placeholder={T("Buscar tiendas o productos…", "Buscar lojas ou produtos…")} className="h-11 w-full rounded-2xl border border-[var(--sh-line)] bg-[var(--sh-card)] px-4 text-[15px] outline-none focus:border-[#1F7FD8]" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle locale={locale} variant="compact" tone="light" />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1240px] px-5 pb-6 pt-10">
        <h1 style={{ fontFamily: H }} className="max-w-3xl text-[clamp(34px,5vw,60px)] font-extrabold leading-[1.02] tracking-[-0.02em]">{texts.h1}</h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--sh-muted)]">{texts.sub}</p>
      </section>

      {/* Rua de lojas: fachadas passando (para em hover; sem animação se o usuário pedir menos movimento) */}
      {street.length > 0 && (
        <div className="street relative overflow-hidden py-4" aria-label={T("Tiendas de la red", "Lojas da rede")}>
          <ul className="street-track flex w-max gap-4 px-5">
            {street.map((s, i) => (
              <li key={`${s.id}-${i}`} aria-hidden={i >= inCountry.length ? true : undefined}>
                <a href={s.url} tabIndex={i >= inCountry.length ? -1 : 0} className="facade group relative flex h-40 w-64 flex-col justify-end overflow-hidden rounded-[22px] p-4" style={{ background: s.heroBg, color: s.heroFg }}>
                  <span className="awning absolute inset-x-0 top-0 h-5" style={{ background: `repeating-linear-gradient(90deg, ${s.color} 0 22px, rgba(255,255,255,.9) 22px 44px)` }} />
                  {s.illustration && <span className="absolute -right-4 bottom-2 transition-transform duration-500 group-hover:-translate-y-1 group-hover:rotate-3"><Illustration name={s.illustration} size={110} /></span>}
                  {s.logoUrl && !s.illustration && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logoUrl} alt="" className="absolute right-4 top-9 h-14 w-14 rounded-full object-cover" />
                  )}
                  <span className={`relative max-w-[70%] text-[24px] leading-[1] ${s.upper ? "uppercase" : "font-bold"}`} style={{ fontFamily: s.font }}>{s.name}</span>
                  <span className="relative mt-1 flex items-center gap-1.5 text-xs font-semibold opacity-90">
                    <span className={`h-2 w-2 rounded-full ${s.isOpen ? "bg-[#3CC46B]" : "bg-white/40"}`} />
                    {s.isOpen ? T("Abierto", "Aberto") : T("Cerrado", "Fechado")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <main className="mx-auto max-w-[1240px] px-5 pb-20">
        <div className="sticky top-[68px] z-20 -mx-5 mb-6 flex gap-2 overflow-x-auto bg-[var(--sh-bg)] px-5 py-3 sm:top-[60px]" role="toolbar" aria-label={T("Filtros", "Filtros")}>
          {countries.length > 1 &&
            countries.map((c) => (
              <button key={c} type="button" aria-pressed={ctry === c} onClick={() => { setCtry(c); setCat("all"); }} className={`chip ${ctry === c ? "chip-on-navy" : ""}`}>
                {c === "BR" ? "Brasil" : "Paraguay"}
              </button>
            ))}
          {countries.length > 1 && <span className="mx-1 w-px shrink-0 bg-[var(--sh-line)]" aria-hidden="true" />}
          <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")} className={`chip ${cat === "all" ? "chip-on" : ""}`}>{T("Todo", "Tudo")}</button>
          {cats.map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={`chip ${cat === c.id ? "chip-on" : ""}`}>{pt ? c.pt : c.es}</button>
          ))}
        </div>

        {stores.length === 0 ? (
          <Empty T={T} joinUrl={joinUrl} />
        ) : (
          <>
            <h2 style={{ fontFamily: H }} className="mb-4 text-2xl font-extrabold">{T("Tiendas", "Lojas")} <span className="text-base font-semibold text-[var(--sh-muted)]">{shown.length}</span></h2>
            {shown.length === 0 && <p className="rounded-2xl bg-[var(--sh-card)] p-6 text-[var(--sh-muted)]">{T("Nada encontrado. Probá con otra palabra o categoría.", "Nada encontrado. Tente outra palavra ou categoria.")}</p>}
            <ul key={`${cat}-${ctry}-${q}`} className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-5">
              {shown.map((s, i) => (
                <li key={s.id} className="shop-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <a href={s.url} className="store-card group flex h-full flex-col overflow-hidden rounded-[26px] border border-[var(--sh-line)] bg-[var(--sh-card)]">
                    <div className="relative h-36 overflow-hidden" style={{ background: s.heroBg, color: s.heroFg }}>
                      {s.bannerImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.bannerImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-700 group-hover:scale-105" />
                      ) : (
                        s.illustration && <span className="absolute -right-3 -top-2 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"><Illustration name={s.illustration} size={124} /></span>
                      )}
                      <div className="absolute inset-x-4 bottom-3 flex items-end gap-3">
                        {s.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.logoUrl} alt="" className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white/70" />
                        )}
                        <span className={`relative max-w-[62%] text-[26px] leading-none ${s.upper ? "uppercase" : "font-bold"}`} style={{ fontFamily: s.font, textShadow: "0 1px 12px rgba(0,0,0,.18)" }}>{s.name}</span>
                      </div>
                      {s.demo && <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">{T("Tienda de demostración", "Loja de demonstração")}</span>}
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <p className="line-clamp-2 min-h-[2.6em] text-sm text-[var(--sh-muted)]">{s.tagline ?? s.categoryLabel ?? (pt ? NET_CATS.find((c) => c.id === s.category)?.pt : NET_CATS.find((c) => c.id === s.category)?.es)}</p>
                      {s.products.length > 0 && (
                        <div className="flex gap-2">
                          {s.products.slice(0, 3).map((p, j) => (
                            <span key={p.id} className="thumb grid h-16 flex-1 place-items-center overflow-hidden rounded-xl bg-[var(--sh-soft)]" style={{ transitionDelay: `${j * 50}ms` }} title={p.name}>
                              {p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                              ) : (
                                <Illustration name={p.illustration} size={52} />
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-1 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span className={`h-2 w-2 rounded-full ${s.isOpen ? "bg-[#2FAE5F]" : "bg-[var(--sh-muted)]"}`} />
                          {s.isOpen ? T("Abierto ahora", "Aberto agora") : T("Cerrado ahora", "Fechado agora")}
                          {s.city && <span className="font-normal text-[var(--sh-muted)]"> · {s.city}</span>}
                        </span>
                        <span className="enter rounded-full px-3 py-1.5 font-bold text-white" style={{ background: s.color }}>{T("Entrar", "Entrar")}</span>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>

            {products.length > 0 && (
              <section className="mt-14" aria-labelledby="destaques">
                <h2 id="destaques" style={{ fontFamily: H }} className="mb-4 text-2xl font-extrabold">{T("Destacados de las tiendas", "Destaques das lojas")}</h2>
                <ul className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2">
                  {products.map((p) => (
                    <li key={p.id} className="w-44 shrink-0 snap-start">
                      <a href={p.store.url} className="prod group block overflow-hidden rounded-2xl border border-[var(--sh-line)] bg-[var(--sh-card)]">
                        <span className="grid h-36 place-items-center overflow-hidden" style={{ background: p.store.heroBg }}>
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy" />
                          ) : (
                            <span className="transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3"><Illustration name={p.illustration} size={96} /></span>
                          )}
                        </span>
                        <span className="block p-3">
                          <span className="line-clamp-1 font-semibold">{p.name}</span>
                          <span className="mt-0.5 flex items-baseline gap-1.5 text-sm">
                            <b>{p.promo ?? p.price}</b>
                            {p.promo && <s className="text-xs text-[var(--sh-muted)]">{p.price}</s>}
                          </span>
                          <span className="mt-1 block truncate text-xs text-[var(--sh-muted)]">{p.store.name}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="mt-16 flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-[#1D4F91] p-8 text-white">
          <div className="max-w-xl">
            <h2 style={{ fontFamily: H }} className="text-2xl font-extrabold">{T("¿Tenés un negocio?", "Tem um negócio?")}</h2>
            <p className="mt-2 text-white/85">{T("Con GoWeb tenés tu propio sitio para vender y aparecés en este Shopping.", "Com a GoWeb você tem seu próprio site para vender e aparece neste Shopping.")}</p>
          </div>
          <a href={joinUrl} className="rounded-2xl bg-white px-6 py-3.5 font-bold text-[#1D4F91]">{T("Conocer GoWeb", "Conhecer a GoWeb")}</a>
        </section>
      </main>
      <footer className="border-t border-[var(--sh-line)] py-6 text-center text-sm text-[var(--sh-muted)]">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <span>{T("Cada compra se hace directo con la tienda.", "Cada compra é feita direto com a loja.")}</span>
          <A11yMenu locale={locale} variant="light" />
        </div>
      </footer>
    </div>
  );
}

function Empty({ T, joinUrl }: { T: (es: string, pt: string) => string; joinUrl: string }) {
  return (
    <div className="rounded-[26px] border border-dashed border-[var(--sh-line)] p-10 text-center">
      <p className="text-lg font-semibold">{T("Las primeras tiendas están llegando.", "As primeiras lojas estão chegando.")}</p>
      <a href={joinUrl} className="mt-3 inline-block font-semibold text-[#1F7FD8] underline">{T("Sumá tu negocio", "Coloque seu negócio aqui")}</a>
    </div>
  );
}
