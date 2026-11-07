import { Icon } from "@/components/ui/Icon";
import { ImageUpload } from "@/components/forms/ImageUpload";
import { uploadLabels } from "@/components/forms/upload-labels";
import { asc, desc, eq } from "drizzle-orm";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { CURRENCY_SYMBOL, minorToInput } from "@/core/money";
import type { Currency } from "@/core/types";
import type { Category, Product } from "@/db/schema";
import { ILLUSTRATION_KEYS, illustrationLabel } from "@/core/illustrations";
import { Illustration } from "@/components/Illustration";
import { adjustStock, deleteCategory, deleteProduct, saveCategory, saveProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug } = await params;
  const { err } = await searchParams;
  const t = await requireTenantAdmin(slug, "products");
  const { T, fm } = panelI18n(t);
  const [cats, prods, moves] = await Promise.all([
    db.query.categories.findMany({ where: eq(schema.categories.tenantId, t.id), orderBy: asc(schema.categories.sortOrder) }),
    db.query.products.findMany({ where: eq(schema.products.tenantId, t.id), orderBy: [asc(schema.products.sortOrder), asc(schema.products.name)] }),
    db.query.stockMovements.findMany({ where: eq(schema.stockMovements.tenantId, t.id), orderBy: desc(schema.stockMovements.createdAt), limit: 15 }),
  ]);
  const prodName = new Map(prods.map((p) => [p.id, p.name]));
  const low = prods.filter((p) => p.trackStock && p.stock <= 3);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{T("Productos", "Produtos")}</h1>
          <span className="text-sm text-muted">{prods.length} {T("productos", "produtos")}</span>
        </div>
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
        {low.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {T("Stock bajo", "Estoque baixo")}: {low.map((p) => `${p.name} (${p.stock})`).join(", ")}
          </p>
        )}
        <details className="card p-4" open={prods.length === 0}>
          <summary className="cursor-pointer font-semibold">{T("+ Nuevo producto", "+ Novo produto")}</summary>
          <ProductForm slug={slug} cats={cats} T={T} cur={t.currency as Currency} pro={t.tier === "pro"} />
        </details>
        <div className="card divide-y divide-line">
          {prods.map((p) => (
            <details key={p.id} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-paper">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-paper">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Illustration name={p.illustration} size={32} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${p.active ? "" : "text-muted line-through"}`}>{p.name}</p>
                  <p className="text-xs text-muted">{cats.find((c) => c.id === p.categoryId)?.name ?? T("Sin categoría", "Sem categoria")}</p>
                </div>
                {p.trackStock && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.stock <= 0 ? "bg-red-100 text-red-700" : p.stock <= 3 ? "bg-amber-100 text-amber-900" : "bg-paper"}`}>
                    {p.stock} u.
                  </span>
                )}
                <b className="w-28 text-right text-sm">{fm(p.pricePyg)}</b>
              </summary>
              <div className="space-y-4 border-t border-line bg-paper/60 px-4 py-4">
                <ProductForm slug={slug} cats={cats} p={p} T={T} cur={t.currency as Currency} pro={t.tier === "pro"} />
                {p.trackStock && (
                  <form action={adjustStock.bind(null, slug, p.id)} className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="label">{T("Ajustar stock (+/-)", "Ajustar estoque (+/-)")}</label>
                      <input name="delta" type="number" className="input w-28" placeholder="+10" />
                    </div>
                    <select name="reason" className="input w-auto">
                      <option value="PURCHASE">{T("Compra / entrada", "Compra / entrada")}</option>
                      <option value="ADJUSTMENT">{T("Ajuste / pérdida", "Ajuste / perda")}</option>
                    </select>
                    <input name="note" className="input w-48" placeholder={T("Nota (opcional)", "Observação (opcional)")} />
                    <button className="btn-primary">{T("Aplicar", "Aplicar")}</button>
                  </form>
                )}
                <form action={deleteProduct.bind(null, slug, p.id)}>
                  <button className="text-xs text-red-600 hover:underline">{T("Eliminar producto", "Excluir produto")}</button>
                </form>
              </div>
            </details>
          ))}
        </div>
      </div>

      <aside className="order-first space-y-4 lg:order-none">
        <div className="card p-4">
          <h2 className="font-semibold">{T("Categorías", "Categorias")}</h2>
          <ul className="mt-3 space-y-2">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <form action={saveCategory.bind(null, slug)} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="sortOrder" defaultValue={c.sortOrder} className="input !w-14 shrink-0 px-2 text-center" aria-label={T("Orden", "Ordem")} />
                  <input name="name" defaultValue={c.name} className="input min-w-0 flex-1" aria-label={T("Nombre de la categoría", "Nome da categoria")} />
                  <button className="btn-ghost shrink-0 px-3" aria-label={T("Guardar categoría", "Salvar categoria")}><Icon name="check" size={16} /></button>
                </form>
                <form action={deleteCategory.bind(null, slug, c.id)}>
                  <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600" aria-label={T("Eliminar categoría", "Excluir categoria")}><Icon name="close" size={16} /></button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveCategory.bind(null, slug)} className="mt-3 flex gap-2">
            <input name="sortOrder" defaultValue={cats.length + 1} className="input !w-14 shrink-0 px-2 text-center" aria-label={T("Orden", "Ordem")} />
            <input name="name" className="input min-w-0 flex-1" placeholder={T("Nueva categoría", "Nova categoria")} aria-label={T("Nueva categoría", "Nova categoria")} />
            <button className="btn-primary shrink-0 px-3">{T("Agregar", "Adicionar")}</button>
          </form>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold">{T("Movimientos de stock", "Movimentações de estoque")}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {moves.length === 0 && <li className="text-muted">{T("Sin movimientos", "Sem movimentações")}</li>}
            {moves.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">{prodName.get(m.productId) ?? "—"} <span className="text-xs text-muted">{m.reason}</span></span>
                <b className={m.delta < 0 ? "text-red-600" : "text-emerald-700"}>{m.delta > 0 ? `+${m.delta}` : m.delta}</b>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function ProductForm({ slug, cats, p, T, cur, pro }: { slug: string; cats: Category[]; p?: Product; T: (es: string, pt: string) => string; cur: Currency; pro: boolean }) {
  return (
    <form action={saveProduct.bind(null, slug)} className="mt-3 grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div>
        <label className="label">{T("Nombre", "Nome")}</label>
        <input name="name" className="input" defaultValue={p?.name} required />
      </div>
      <div>
        <label className="label">{T("Precio", "Preço")} ({CURRENCY_SYMBOL[cur]})</label>
        <MoneyInput name="pricePyg" currency={cur} defaultMinor={p?.pricePyg ?? null} required />
      </div>
      <div className="sm:col-span-2">
        <label className="label">{T("Descripción", "Descrição")}</label>
        <input name="description" className="input" defaultValue={p?.description ?? ""} />
      </div>
      <div>
        <label className="label">{T("Categoría", "Categoria")}</label>
        <select name="categoryId" className="input" defaultValue={p?.categoryId ?? ""}>
          <option value="">{T("Sin categoría", "Sem categoria")}</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input name="newCategory" className="input mt-2" maxLength={40} placeholder={cats.length ? T("…o creá una nueva categoría", "…ou crie uma nova categoria") : T("Creá la primera categoría (ej.: Bebidas)", "Crie a primeira categoria (ex.: Bebidas)")} />
      </div>
      <div>
        <label className="label">{T("Foto", "Foto")}</label>
        <ImageUpload name="imageFile" removeName="removeImage" current={p?.imageUrl} labels={uploadLabels(T)} />
      </div>
      <div>
        <label className="label">{T("Ilustración (si no hay foto)", "Ilustração (se não houver foto)")}</label>
        <select name="illustration" className="input" defaultValue={p?.illustration ?? ""}>
          <option value="">{T("Ninguna", "Nenhuma")}</option>
          {ILLUSTRATION_KEYS.map((k) => (
            <option key={k} value={k}>{illustrationLabel(k, cur === "BRL" ? "pt" : "es")}</option>
          ))}
        </select>
      </div>
      {pro && (
        <div>
          <label className="label">{T("Duración en minutos (servicio con turno)", "Duração em minutos (serviço com agendamento)")}</label>
          <input name="durationMin" type="number" min={0} max={480} className="input" defaultValue={p?.durationMin ?? ""} placeholder={T("Vacío = producto común", "Vazio = produto comum")} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> {T("Visible en el menú", "Visível no cardápio")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackStock" defaultChecked={p?.trackStock ?? false} /> {T("Controlar stock", "Controlar estoque")}</label>
        {!p && (
          <label className="flex items-center gap-2 text-sm">{T("Stock inicial", "Estoque inicial")} <input name="stock" type="number" className="input w-20 py-1.5" defaultValue={0} /></label>
        )}
        <button className="btn-primary ml-auto">{p ? T("Guardar", "Salvar") : T("Crear producto", "Criar produto")}</button>
      </div>
    </form>
  );
}
