import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { THEMES, THEME_IDS } from "@/core/themes";
import { ILLUSTRATIONS, ILLUSTRATION_KEYS } from "@/core/illustrations";
import { Illustration } from "@/components/Illustration";
import { saveAppearance } from "../actions";

export const dynamic = "force-dynamic";

export default async function AppearancePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug);

  return (
    <form action={saveAppearance.bind(null, slug)} className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Apariencia del sitio</h1>
          <p className="text-sm text-muted">Elegí un modelo, tu color, logo y el banner de promoción.</p>
        </div>
        <Link href={`/${slug}`} target="_blank" className="btn-ghost">Ver mi sitio ↗</Link>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">¡Guardado! Abrí tu sitio para ver los cambios.</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <section className="card p-5">
        <h2 className="font-semibold">Modelo</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_IDS.map((id) => {
            const th = THEMES[id];
            return (
              <label key={id} className="group relative cursor-pointer">
                <input type="radio" name="theme" value={id} defaultChecked={t.theme === id} className="peer sr-only" />
                <div className="overflow-hidden rounded-2xl border-2 border-line transition peer-checked:border-ink peer-focus-visible:ring-2 peer-focus-visible:ring-ink">
                  <div className="flex h-24 items-end justify-between p-3" style={{ background: th.colors.heroBg, color: th.colors.heroFg }}>
                    <span style={{ fontFamily: th.fonts.heading }} className={`text-xl font-bold leading-none ${th.fonts.headingUpper ? "uppercase" : ""} ${th.fonts.headingItalic ? "italic" : ""}`}>
                      {th.labelEs}
                    </span>
                    <span className="h-6 w-6 rounded-full" style={{ background: th.accent }} />
                  </div>
                  <div className="flex gap-1 p-2" style={{ background: th.colors.bg }}>
                    {[th.colors.surface, th.colors.tiles[0], th.accent, th.colors.fg].map((c, i) => (
                      <span key={i} className="h-3 flex-1 rounded-full" style={{ background: c }} />
                    ))}
                  </div>
                  <p className="border-t border-line bg-white px-3 py-2 text-xs text-muted">{th.segmentEs}</p>
                </div>
                <span className="absolute right-2 top-2 hidden rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-ink peer-checked:block">✓</span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Al cambiar de modelo, ajustá también el color de destaque para que combine.</p>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Marca</h2>
        <div>
          <label className="label" htmlFor="primaryColor">Color de destaque (botones)</label>
          <div className="flex gap-2">
            <input id="primaryColor" type="color" name="primaryColor" defaultValue={t.primaryColor} className="h-11 w-14 cursor-pointer rounded-xl border border-line bg-white p-1" />
            <div className="flex flex-wrap gap-1.5">
              {THEME_IDS.map((id) => (
                <span key={id} title={`Sugerido: ${THEMES[id].labelEs}`} className="h-11 w-6 rounded-md" style={{ background: THEMES[id].accent }} />
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="tagline">Frase corta (debajo del nombre)</label>
          <input id="tagline" name="tagline" className="input" defaultValue={t.tagline ?? ""} placeholder="Cucina italiana · Cervecería · Envíos a todo Asunción" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="logoFile">Logo (cuadrado, JPG/PNG/WEBP, máx. 4 MB)</label>
          <div className="flex flex-wrap items-center gap-4">
            {t.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logoUrl} alt="Logo actual" className="h-16 w-16 rounded-full object-cover ring-1 ring-line" />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-paper text-xs text-muted ring-1 ring-line">sin logo</span>
            )}
            <input id="logoFile" name="logoFile" type="file" accept="image/*" className="text-sm" />
            {t.logoUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" /> Quitar logo</label>}
          </div>
        </div>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold">Banner de promoción</h2>
          <p className="text-sm text-muted">Aparece arriba del menú. Dejá el título vacío para no mostrar promoción.</p>
        </div>
        <div><label className="label" htmlFor="bannerTag">Etiqueta</label><input id="bannerTag" name="bannerTag" className="input" defaultValue={t.bannerTag ?? ""} placeholder="PROMO DE LA SEMANA" /></div>
        <div><label className="label" htmlFor="bannerTitle">Título</label><input id="bannerTitle" name="bannerTitle" className="input" defaultValue={t.bannerTitle ?? ""} placeholder="Combo doble + papas" /></div>
        <div><label className="label" htmlFor="bannerSubtitle">Subtítulo</label><input id="bannerSubtitle" name="bannerSubtitle" className="input" defaultValue={t.bannerSubtitle ?? ""} placeholder="Café + medialuna + jugo" /></div>
        <div><label className="label" htmlFor="bannerHighlight">Destaque (precio u horario)</label><input id="bannerHighlight" name="bannerHighlight" className="input" defaultValue={t.bannerHighlight ?? ""} placeholder="Gs. 59.000 · 2x1 de 18 a 21 h" /></div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bannerFile">Foto del banner (opcional — si no, usa la ilustración)</label>
          <div className="flex flex-wrap items-center gap-4">
            {t.bannerImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.bannerImageUrl} alt="Banner actual" className="h-16 w-28 rounded-lg object-cover ring-1 ring-line" />
            )}
            <input id="bannerFile" name="bannerFile" type="file" accept="image/*" className="text-sm" />
            {t.bannerImageUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeBanner" /> Quitar foto</label>}
          </div>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="label">Ilustración del banner</legend>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
            <label className="cursor-pointer">
              <input type="radio" name="bannerIllustration" value="" defaultChecked={!t.bannerIllustration} className="peer sr-only" />
              <span className="grid aspect-square place-items-center rounded-xl border-2 border-line bg-paper text-[11px] text-muted peer-checked:border-ink">Ninguna</span>
            </label>
            {ILLUSTRATION_KEYS.map((k) => (
              <label key={k} className="cursor-pointer" title={ILLUSTRATIONS[k].label}>
                <input type="radio" name="bannerIllustration" value={k} defaultChecked={t.bannerIllustration === k} className="peer sr-only" />
                <span className="grid aspect-square place-items-center rounded-xl border-2 border-line bg-paper peer-checked:border-ink">
                  <Illustration name={k} size={44} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <button className="btn-primary px-6 py-3">Guardar apariencia</button>
    </form>
  );
}
