import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { qrSvg } from "@/lib/qr";
import { tenantPublicUrl } from "@/lib/urls";
import { SOURCE_LABELS, type Source } from "@/core/growth";
import { CopyLink } from "@/components/storefront/CopyLink";

export const dynamic = "force-dynamic";

const KIT: Source[] = ["instagram", "whatsapp", "google", "facebook", "tiktok", "panfleto", "qr"];

export default async function DivulgacaoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ p?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, locale } = panelI18n(t);
  const url = tenantPublicUrl(t);
  const link = (s: Source) => `${url}?origem=${s}`;
  const qrs = await Promise.all(KIT.map((s) => qrSvg(link(s))));
  const prods = await db.query.products.findMany({ where: and(eq(schema.products.tenantId, t.id), eq(schema.products.active, true)), orderBy: asc(schema.products.name), limit: 200 });
  const pid = prods.find((p) => p.id === sp.p)?.id ?? "";
  const img = (fmt: string) => `/api/kit/${slug}?formato=${fmt}${pid ? `&p=${pid}` : ""}`;
  const L = (s: Source) => (locale === "pt" ? SOURCE_LABELS[s].pt : SOURCE_LABELS[s].es);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{T("Kit de divulgación", "Kit de divulgação")}</h1>
        <p className="text-sm text-muted">{T("Enlaces con seguimiento, QR, materiales para imprimir y artes listas. Cada venta queda registrada con su origen en Clientes.", "Links rastreados, QR, materiais para imprimir e artes prontas. Cada venda fica registrada com a origem em Clientes.")}</p>
      </div>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="link" size={18} className="text-[var(--section)]" />{T("Un enlace para cada lugar", "Um link para cada lugar")}</h2>
        <p className="mt-0.5 text-sm text-muted">{T("Poné el enlace de Instagram en la bio, el de WhatsApp en el estado, el del volante impreso… y descubrí qué vende más.", "Coloque o link do Instagram na bio, o do WhatsApp no status, o do panfleto impresso… e descubra o que vende mais.")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KIT.map((s, i) => (
            <div key={s} className="flex min-w-0 gap-3 rounded-xl border border-line p-3">
              <div className="h-20 w-20 shrink-0 bg-white p-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">{L(s)}</p>
                <p className="truncate text-xs text-muted">{link(s)}</p>
                <CopyLink text={link(s)} label={T("Copiar", "Copiar")} done={T("¡Copiado!", "Copiado!")} className="mt-2 rounded-lg border border-line px-3 py-1 text-xs font-semibold" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="print" size={18} className="text-[var(--section)]" />{T("Para imprimir", "Para imprimir")}</h2>
        <p className="mt-0.5 text-sm text-muted">{T("Abrí y usá «Imprimir / Guardar PDF». Llevalo a una imprenta o imprimí en casa.", "Abra e use “Imprimir / Salvar PDF”. Leve a uma gráfica ou imprima em casa.")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link target="_blank" href={`/painel/${slug}/material?tipo=adesivo`} className="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold">{T("Adhesivos QR (mesa/vidriera)", "Adesivos QR (mesa/vitrine)")}</Link>
          <Link target="_blank" href={`/painel/${slug}/material?tipo=display`} className="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold">{T("Display de mostrador A5", "Display de balcão A5")}</Link>
          <Link target="_blank" href={`/painel/${slug}/material?tipo=panfleto`} className="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold">{T("Volantes (4 por hoja)", "Panfletos (4 por folha)")}</Link>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="phone" size={18} className="text-[var(--section)]" />{T("Artes para redes", "Artes para redes sociais")}</h2>
        <form className="mt-3 flex flex-wrap gap-2">
          <select name="p" defaultValue={pid} className="input w-auto min-w-56">
            <option value="">{T("Tienda (sin producto)", "Loja (sem produto)")}</option>
            {prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold">{T("Generar", "Gerar")}</button>
        </form>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[["post", "Post 1080×1080"], ["story", "Story 1080×1920"]].map(([f, label]) => (
            <div key={f}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img(f)} alt={label} className={`w-full rounded-xl border border-line ${f === "story" ? "mx-auto max-w-[260px]" : ""}`} />
              <a href={`${img(f)}&download=1`} className="btn-brand mt-2 block rounded-xl px-4 py-2 text-center text-sm font-semibold">⬇ {label}</a>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="pin" size={18} className="text-[var(--section)]" />{T("Aparecé en Google Maps", "Apareça no Google Maps")}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>{T("Entrá en business.google.com y creá (o reclamá) el Perfil de tu negocio.", "Acesse business.google.com e crie (ou reivindique) o Perfil da sua empresa.")}</li>
          <li>{T("Elegí la categoría correcta, horario, fotos y teléfono.", "Escolha a categoria certa, horário, fotos e telefone.")}</li>
          <li>{T("En «Sitio web» y «Pedidos», pegá tu enlace de Google:", "Em “Site” e “Pedidos”, cole seu link do Google:")} <b className="text-ink">{link("google")}</b></li>
          <li>{T("Copiá el enlace «Pedir reseñas» y pegalo en Crecimiento → Reseñas.", "Copie o link “Pedir avaliações” e cole em Crescimento → Avaliação no Google.")}</li>
        </ol>
      </section>
    </div>
  );
}
