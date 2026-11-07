import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { menuUrl, qrSvg } from "@/lib/qr";
import { CopyLink } from "@/components/storefront/CopyLink";
import { Icon } from "@/components/ui/Icon";
import { addTables, deleteTable, regenerateTableCode, toggleTable } from "../actions";

export const dynamic = "force-dynamic";

type Tab = "mesas" | "cardapio" | "imprimir";

export default async function TablesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "tables");
  const { T } = panelI18n(t);
  const tab: Tab = sp.aba === "cardapio" || sp.aba === "imprimir" ? sp.aba : "mesas";
  const tables = (await db.query.diningTables.findMany({ where: eq(schema.diningTables.tenantId, t.id), orderBy: asc(schema.diningTables.label) })).sort((a, b) =>
    a.label.localeCompare(b.label, "es", { numeric: true }),
  );
  const general = menuUrl(t);
  const active = tables.filter((x) => x.active);
  const base = `/painel/${slug}/mesas`;

  const tabs: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: "mesas", label: T("Mesas", "Mesas"), icon: "store", count: tables.length },
    { id: "cardapio", label: T("QR del menú", "QR do cardápio"), icon: "qr" },
    { id: "imprimir", label: T("Imprimir", "Imprimir"), icon: "print" },
  ];

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1>{T("Mesas y QR", "Mesas e QR")}</h1>
        <p className="mt-1 text-muted">
          {T("Cada mesa tiene su propio QR: el cliente escanea y el pedido llega con el número de la mesa.", "Cada mesa tem o próprio QR: o cliente escaneia e o pedido chega com o número da mesa.")}
        </p>
      </div>

      <nav aria-label={T("Secciones", "Seções")} className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 ring-1 ring-line">
        {tabs.map((x) => (
          <Link
            key={x.id}
            href={`${base}?aba=${x.id}`}
            aria-current={tab === x.id ? "page" : undefined}
            className={`flex flex-1 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === x.id ? "bg-[var(--section)] text-white" : "text-[#3F4654] hover:bg-black/5"}`}
          >
            <Icon name={x.icon} size={18} />
            {x.label}
            {x.count !== undefined && <span className={`rounded-full px-1.5 text-xs ${tab === x.id ? "bg-white/25" : "bg-black/5"}`}>{x.count}</span>}
          </Link>
        ))}
      </nav>

      {tab === "mesas" && (
        <>
          <form action={addTables.bind(null, slug)} className="card flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="tlabel">{T("Nombre", "Nome")}</label>
              <input id="tlabel" name="label" className="input" placeholder={T("Mesa, Barra, Terraza…", "Mesa, Balcão, Varanda…")} />
            </div>
            <div>
              <label className="label" htmlFor="tqty">{T("Cuántas", "Quantas")}</label>
              <input id="tqty" name="qty" type="number" min={1} max={50} defaultValue={1} className="input w-24" />
            </div>
            <button className="btn-brand">{T("Agregar mesas", "Adicionar mesas")}</button>
            <p className="w-full text-xs text-muted">{T("Ej.: «Mesa» y 10 crea Mesa 1 a Mesa 10.", "Ex.: «Mesa» e 10 cria Mesa 1 até Mesa 10.")}</p>
          </form>

          {tables.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="font-semibold">{T("Todavía no hay mesas", "Ainda não há mesas")}</p>
              <p className="mt-1 text-sm text-muted">{T("Agregá tus mesas arriba. Si no atendés en mesa, usá solo el QR del menú.", "Adicione suas mesas acima. Se não atende na mesa, use só o QR do cardápio.")}</p>
            </div>
          ) : (
            <ul className="card divide-y divide-line">
              {tables.map((x) => (
                <li key={x.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${x.active ? "" : "opacity-60"}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--section-soft)] font-black text-[var(--section)]">{x.label.replace(/\D/g, "").slice(0, 3) || x.label[0]}</span>
                  <div className="min-w-32 flex-1">
                    <p className="font-semibold">{x.label}</p>
                    <p className="text-xs text-muted">{x.active ? T("Activa", "Ativa") : T("Desactivada — el QR no acepta pedidos", "Desativada — o QR não aceita pedidos")}</p>
                  </div>
                  <Link href={`/painel/${slug}/mesas/imprimir?ids=${x.id}`} target="_blank" className="btn-ghost px-3 py-1.5 text-sm">{T("Imprimir QR", "Imprimir QR")}</Link>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-lg px-3 py-1.5 text-sm font-semibold text-[#3F4654] hover:bg-black/5">{T("Más", "Mais")}</summary>
                    <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl bg-white p-1 text-sm shadow-xl ring-1 ring-line">
                      <form action={toggleTable.bind(null, slug, x.id)}><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5">{x.active ? T("Desactivar mesa", "Desativar mesa") : T("Activar mesa", "Ativar mesa")}</button></form>
                      <form action={regenerateTableCode.bind(null, slug, x.id)}><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-black/5">{T("Cambiar QR (el viejo deja de funcionar)", "Trocar QR (o antigo para de funcionar)")}</button></form>
                      <form action={deleteTable.bind(null, slug, x.id)}><button className="w-full rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50">{T("Eliminar mesa", "Excluir mesa")}</button></form>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === "cardapio" && <GeneralQr url={general} T={T} slug={slug} />}

      {tab === "imprimir" && (
        <form action={`/painel/${slug}/mesas/imprimir`} target="_blank" className="card space-y-4 p-5">
          <div>
            <p className="font-semibold">{T("¿Qué QR querés imprimir?", "Quais QR você quer imprimir?")}</p>
            <p className="text-sm text-muted">{T("Se abre una página lista para imprimir o guardar en PDF.", "Abre uma página pronta para imprimir ou salvar em PDF.")}</p>
          </div>
          {active.length === 0 ? (
            <p className="text-sm text-muted">{T("No hay mesas activas.", "Não há mesas ativas.")} <Link className="font-semibold underline" href={`${base}?aba=mesas`}>{T("Agregar mesas", "Adicionar mesas")}</Link></p>
          ) : (
            <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <legend className="sr-only">{T("Mesas", "Mesas")}</legend>
              {active.map((x) => (
                <label key={x.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-[var(--section)] has-[:checked]:bg-[var(--section-soft)]">
                  <input type="checkbox" name="ids" value={x.id} defaultChecked className="h-4 w-4 accent-[var(--section)]" />
                  {x.label}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset>
            <legend className="label">{T("Tamaño", "Tamanho")}</legend>
            <div className="flex flex-wrap gap-2">
              {[
                ["pequeno", T("Pequeño · 6 por hoja", "Pequeno · 6 por folha")],
                ["medio", T("Mediano · 4 por hoja", "Médio · 4 por folha")],
                ["grande", T("Grande · 1 por hoja", "Grande · 1 por folha")],
              ].map(([v, l], i) => (
                <label key={v} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-[:checked]:border-[var(--section)] has-[:checked]:bg-[var(--section-soft)]">
                  <input type="radio" name="tamanho" value={v} defaultChecked={i === 1} className="accent-[var(--section)]" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-brand" disabled={active.length === 0}>
            {T("Abrir para imprimir", "Abrir para imprimir")}
          </button>
        </form>
      )}
    </div>
  );
}

async function GeneralQr({ url, T, slug }: { url: string; T: (es: string, pt: string) => string; slug: string }) {
  const svg = await qrSvg(url);
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <div className="card grid gap-5 p-5 sm:grid-cols-[200px_1fr]">
      <div className="rounded-2xl bg-white p-2 ring-1 ring-line [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="space-y-3">
        <div>
          <p className="font-semibold">{T("QR general del menú", "QR geral do cardápio")}</p>
          <p className="text-sm text-muted">{T("Sin número de mesa. Usalo en el mostrador, en redes, en la vidriera o para delivery.", "Sem número de mesa. Use no balcão, nas redes, na vitrine ou para delivery.")}</p>
        </div>
        <p className="break-all rounded-xl bg-paper px-3 py-2 text-sm">{url}</p>
        <div className="flex flex-wrap gap-2">
          <a href={href} download="qr-cardapio.svg" className="btn-brand inline-flex items-center gap-2"><Icon name="download" size={18} />{T("Descargar QR", "Baixar QR")}</a>
          <CopyLink text={url} label={T("Copiar enlace", "Copiar link")} done={T("¡Copiado!", "Copiado!")} className="btn-ghost" />
          <Link href={`/painel/${slug}/material?tipo=display`} target="_blank" className="btn-ghost inline-flex items-center gap-2"><Icon name="print" size={18} />{T("Cartel de mostrador", "Display de balcão")}</Link>
        </div>
        <p className="text-xs text-muted">{T("Para saber qué red vende más, usá los enlaces de Divulgación.", "Para saber qual rede vende mais, use os links de Divulgação.")}</p>
      </div>
    </div>
  );
}
