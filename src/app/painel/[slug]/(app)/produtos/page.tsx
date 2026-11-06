import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { formatPyg } from "@/core/money";
import type { Category, Product } from "@/db/schema";
import { ILLUSTRATIONS, ILLUSTRATION_KEYS } from "@/core/illustrations";
import { Illustration } from "@/components/Illustration";
import { adjustStock, deleteCategory, deleteProduct, saveCategory, saveProduct } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug } = await params;
  const { err } = await searchParams;
  const t = await requireTenantAdmin(slug);
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
          <h1 className="text-xl font-bold">Productos</h1>
          <span className="text-sm text-muted">{prods.length} productos</span>
        </div>
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
        {low.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Stock bajo: {low.map((p) => `${p.name} (${p.stock})`).join(", ")}
          </p>
        )}
        <details className="card p-4" open={prods.length === 0}>
          <summary className="cursor-pointer font-semibold">+ Nuevo producto</summary>
          <ProductForm slug={slug} cats={cats} />
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
                  <p className="text-xs text-muted">{cats.find((c) => c.id === p.categoryId)?.name ?? "Sin categoría"}</p>
                </div>
                {p.trackStock && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.stock <= 0 ? "bg-red-100 text-red-700" : p.stock <= 3 ? "bg-amber-100 text-amber-900" : "bg-paper"}`}>
                    {p.stock} u.
                  </span>
                )}
                <b className="w-28 text-right text-sm">{formatPyg(p.pricePyg)}</b>
              </summary>
              <div className="space-y-4 border-t border-line bg-paper/60 px-4 py-4">
                <ProductForm slug={slug} cats={cats} p={p} />
                {p.trackStock && (
                  <form action={adjustStock.bind(null, slug, p.id)} className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="label">Ajustar stock (+/-)</label>
                      <input name="delta" type="number" className="input w-28" placeholder="+10" />
                    </div>
                    <select name="reason" className="input w-auto">
                      <option value="PURCHASE">Compra / entrada</option>
                      <option value="ADJUSTMENT">Ajuste / pérdida</option>
                    </select>
                    <input name="note" className="input w-48" placeholder="Nota (opcional)" />
                    <button className="btn-primary">Aplicar</button>
                  </form>
                )}
                <form action={deleteProduct.bind(null, slug, p.id)}>
                  <button className="text-xs text-red-600 hover:underline">Eliminar producto</button>
                </form>
              </div>
            </details>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="font-semibold">Categorías</h2>
          <ul className="mt-3 space-y-2">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <form action={saveCategory.bind(null, slug)} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="sortOrder" defaultValue={c.sortOrder} className="input w-14 px-2" aria-label="Orden" />
                  <input name="name" defaultValue={c.name} className="input" />
                  <button className="btn-ghost px-3">✓</button>
                </form>
                <form action={deleteCategory.bind(null, slug, c.id)}>
                  <button className="px-1 text-muted hover:text-red-600" aria-label="Eliminar">✕</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveCategory.bind(null, slug)} className="mt-3 flex gap-2">
            <input name="sortOrder" defaultValue={cats.length + 1} className="input w-14 px-2" aria-label="Orden" />
            <input name="name" className="input" placeholder="Nueva categoría" />
            <button className="btn-primary px-3">+</button>
          </form>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold">Movimientos de stock</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {moves.length === 0 && <li className="text-muted">Sin movimientos</li>}
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

function ProductForm({ slug, cats, p }: { slug: string; cats: Category[]; p?: Product }) {
  return (
    <form action={saveProduct.bind(null, slug)} className="mt-3 grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div>
        <label className="label">Nombre</label>
        <input name="name" className="input" defaultValue={p?.name} required />
      </div>
      <div>
        <label className="label">Precio (Gs.)</label>
        <input name="pricePyg" className="input" inputMode="numeric" defaultValue={p?.pricePyg} required />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Descripción</label>
        <input name="description" className="input" defaultValue={p?.description ?? ""} />
      </div>
      <div>
        <label className="label">Categoría</label>
        <select name="categoryId" className="input" defaultValue={p?.categoryId ?? ""}>
          <option value="">Sin categoría</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Foto (JPG/PNG/WEBP, máx. 4 MB)</label>
        <div className="flex items-center gap-3">
          {p?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-line" />
          ) : p?.illustration ? (
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-paper ring-1 ring-line"><Illustration name={p.illustration} size={36} /></span>
          ) : null}
          <input name="imageFile" type="file" accept="image/*" className="min-w-0 text-sm" />
        </div>
        {p?.imageUrl && <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" name="removeImage" /> Quitar foto</label>}
      </div>
      <div>
        <label className="label">Ilustración (si no hay foto)</label>
        <select name="illustration" className="input" defaultValue={p?.illustration ?? ""}>
          <option value="">Ninguna</option>
          {ILLUSTRATION_KEYS.map((k) => (
            <option key={k} value={k}>{ILLUSTRATIONS[k].label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Visible en el menú</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="trackStock" defaultChecked={p?.trackStock ?? false} /> Controlar stock</label>
        {!p && (
          <label className="flex items-center gap-2 text-sm">Stock inicial <input name="stock" type="number" className="input w-20 py-1.5" defaultValue={0} /></label>
        )}
        <button className="btn-primary ml-auto">{p ? "Guardar" : "Crear producto"}</button>
      </div>
    </form>
  );
}
