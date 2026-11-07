import { ImageUpload } from "@/components/forms/ImageUpload";
import { uploadLabels } from "@/components/forms/upload-labels";
import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { THEMES, THEME_IDS } from "@/core/themes";
import { ILLUSTRATION_KEYS, illustrationLabel } from "@/core/illustrations";
import { Illustration } from "@/components/Illustration";
import { saveAppearance } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppearancePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "appearance");
  const { T, region } = panelI18n(t);

  return (
    <form action={saveAppearance.bind(null, slug)} className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{T("Apariencia del sitio", "Aparência do site")}</h1>
          <p className="text-sm text-muted">{T("Elegí un modelo, tu color, logo y el banner de promoción.", "Escolha um modelo, sua cor, logo e o banner de promoção.")}</p>
        </div>
        <Link href={`/${slug}`} target="_blank" className="btn-ghost">{T("Ver mi sitio ↗", "Ver meu site ↗")}</Link>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{T("¡Guardado! Abrí tu sitio para ver los cambios.", "Salvo! Abra seu site para ver as mudanças.")}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <section className="card p-5">
        <h2 className="font-semibold">{T("Modelo", "Modelo")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_IDS.map((id) => {
            const th = THEMES[id];
            return (
              <label key={id} className="group relative cursor-pointer">
                <input type="radio" name="theme" value={id} defaultChecked={t.theme === id} className="peer sr-only" />
                <div className="overflow-hidden rounded-2xl border-2 border-line transition peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink">
                  <div className="flex h-24 items-end justify-between p-3" style={{ background: th.colors.heroBg, color: th.colors.heroFg }}>
                    <span style={{ fontFamily: th.fonts.heading }} className={`text-xl font-bold leading-none ${th.fonts.headingUpper ? "uppercase" : ""} ${th.fonts.headingItalic ? "italic" : ""}`}>
                      {T(th.labelEs, th.label)}
                    </span>
                    <span className="h-6 w-6 rounded-full" style={{ background: th.accent }} />
                  </div>
                  <div className="flex gap-1 p-2" style={{ background: th.colors.bg }}>
                    {[th.colors.surface, th.colors.tiles[0], th.accent, th.colors.fg].map((c, i) => (
                      <span key={i} className="h-3 flex-1 rounded-full" style={{ background: c }} />
                    ))}
                  </div>
                  <p className="border-t border-line bg-white px-3 py-2 text-xs text-muted">{T(th.segmentEs, th.segment)}</p>
                </div>
                <span className="absolute right-2 top-2 hidden rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink peer-checked:block">✓</span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">{T("Al cambiar de modelo, ajustá también el color de destaque para que combine.", "Ao trocar de modelo, ajuste também a cor de destaque para combinar.")}</p>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{T("Marca", "Marca")}</h2>
        <div>
          <label className="label" htmlFor="primaryColor">{T("Color de destaque (botones)", "Cor de destaque (botões)")}</label>
          <div className="flex gap-2">
            <input id="primaryColor" type="color" name="primaryColor" defaultValue={t.primaryColor} className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-white p-1" />
            <div className="flex flex-wrap gap-1.5">
              {THEME_IDS.map((id) => (
                <span key={id} title={`${T("Sugerido", "Sugerido")}: ${T(THEMES[id].labelEs, THEMES[id].label)}`} className="h-11 w-6 rounded-md" style={{ background: THEMES[id].accent }} />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tagline">{T("Frase corta (debajo del nombre)", "Frase curta (abaixo do nome)")}</label>
          <input id="tagline" name="tagline" className="input" defaultValue={t.tagline ?? ""} placeholder={T("Cucina italiana · Cervecería · Envíos a todo Asunción", "Cortes clássicos · Perfumes importados · Entrega na cidade toda")} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="logoFile">{T("Logo (cuadrado)", "Logo (quadrado)")}</label>
          <ImageUpload name="logoFile" removeName="removeLogo" current={t.logoUrl} shape="round" maxSide={800} labels={uploadLabels(T)} />
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">{T("Banner de promoción", "Banner de promoção")}</h2>
          <p className="text-sm text-muted">{T("Aparece arriba del menú. Dejá el título vacío para no mostrar promoción.", "Aparece acima do cardápio. Deixe o título vazio para não mostrar promoção.")}</p>
        </div>
        <div><label className="label" htmlFor="bannerTag">{T("Etiqueta", "Etiqueta")}</label><input id="bannerTag" name="bannerTag" className="input" defaultValue={t.bannerTag ?? ""} placeholder={T("PROMO DE LA SEMANA", "PROMO DA SEMANA")} /></div>
        <div><label className="label" htmlFor="bannerTitle">{T("Título", "Título")}</label><input id="bannerTitle" name="bannerTitle" className="input" defaultValue={t.bannerTitle ?? ""} placeholder={T("Combo doble + papas", "Corte + barba")} /></div>
        <div><label className="label" htmlFor="bannerSubtitle">{T("Subtítulo", "Subtítulo")}</label><input id="bannerSubtitle" name="bannerSubtitle" className="input" defaultValue={t.bannerSubtitle ?? ""} placeholder={T("Café + medialuna + jugo", "Às terças, com toalha quente")} /></div>
        <div><label className="label" htmlFor="bannerHighlight">{T("Destaque (precio u horario)", "Destaque (preço ou horário)")}</label><input id="bannerHighlight" name="bannerHighlight" className="input" defaultValue={t.bannerHighlight ?? ""} placeholder={T("Gs. 59.000 · 2x1 de 18 a 21 h", "R$ 59,90 · de 18 às 21 h")} /></div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bannerFile">{T("Foto del banner (opcional — si no, usa la ilustración)", "Foto do banner (opcional — senão usa a ilustração)")}</label>
          <ImageUpload name="bannerFile" removeName="removeBanner" current={t.bannerImageUrl} shape="wide" maxSide={2000} labels={uploadLabels(T)} />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">{T("Ilustración del banner", "Ilustração do banner")}</legend>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
            <label className="cursor-pointer">
              <input type="radio" name="bannerIllustration" value="" defaultChecked={!t.bannerIllustration} className="peer sr-only" />
              <span className="grid aspect-square place-items-center rounded-xl border-2 border-line bg-paper text-[11px] text-muted peer-checked:border-ink">{T("Ninguna", "Nenhuma")}</span>
            </label>
            {ILLUSTRATION_KEYS.map((k) => (
              <label key={k} className="cursor-pointer" title={illustrationLabel(k, region.locale)}>
                <input type="radio" name="bannerIllustration" value={k} defaultChecked={t.bannerIllustration === k} className="peer sr-only" />
                <span className="grid aspect-square place-items-center rounded-xl border-2 border-line bg-paper peer-checked:border-ink">
                  <Illustration name={k} size={44} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <button className="btn-primary px-6 py-3">{T("Guardar apariencia", "Salvar aparência")}</button>
    </form>
  );
}
