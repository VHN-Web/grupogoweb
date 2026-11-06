import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { menuUrl, qrSvg } from "@/lib/qr";
import { PrintButton } from "@/components/PrintButton";
import { addTables, deleteTable, regenerateTableCode, toggleTable } from "../actions";

export const dynamic = "force-dynamic";

export default async function TablesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug);
  const tables = (await db.query.diningTables.findMany({ where: eq(schema.diningTables.tenantId, t.id), orderBy: asc(schema.diningTables.label) })).sort((a, b) =>
    a.label.localeCompare(b.label, "es", { numeric: true }),
  );
  const general = menuUrl(t);
  const generalQr = await qrSvg(general);
  const qrs = await Promise.all(tables.map(async (x) => ({ ...x, url: menuUrl(t, x.code), svg: await qrSvg(menuUrl(t, x.code)) })));

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Mesas y códigos QR</h1>
          <p className="text-sm text-muted">Cada mesa tiene un código único. Imprimí y pegá el QR en la mesa.</p>
        </div>
        <PrintButton label="Imprimir todos los QR" className="btn-primary" />
      </div>

      <div className="no-print grid gap-4 md:grid-cols-2">
        <div className="card flex gap-4 p-4">
          <div className="h-28 w-28 shrink-0" dangerouslySetInnerHTML={{ __html: generalQr }} />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">QR general del menú</p>
            <p className="mt-1 text-muted">Para redes sociales, mostrador o delivery (sin mesa).</p>
            <p className="mt-2 break-all rounded-lg bg-paper px-2 py-1 font-mono text-xs">{general}</p>
          </div>
        </div>
        <form action={addTables.bind(null, slug)} className="card flex flex-wrap items-end gap-2 p-4">
          <div className="flex-1">
            <label className="label">Nombre / prefijo</label>
            <input name="label" className="input" placeholder="Mesa, Barra, Terraza…" />
          </div>
          <div>
            <label className="label">Cantidad</label>
            <input name="qty" type="number" min={1} max={50} defaultValue={1} className="input w-20" />
          </div>
          <button className="btn-brand">Agregar</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-6">
        {qrs.map((x) => (
          <div key={x.id} className={`card break-inside-avoid p-4 text-center print:border-2 print:border-black ${x.active ? "" : "opacity-40 print:hidden"}`}>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted print:text-black">{t.name}</p>
            <div className="mx-auto my-2 w-full max-w-[180px]" dangerouslySetInnerHTML={{ __html: x.svg }} />
            <p className="text-lg font-black">{x.label}</p>
            <p className="text-xs text-muted print:text-black">Escaneá para ver el menú y pedir</p>
            <p className="mt-1 font-mono text-[10px] text-muted">{x.code}</p>
            <div className="no-print mt-3 flex justify-center gap-3 text-xs">
              <form action={toggleTable.bind(null, slug, x.id)}><button className="text-muted hover:underline">{x.active ? "Desactivar" : "Activar"}</button></form>
              <form action={regenerateTableCode.bind(null, slug, x.id)}><button className="text-muted hover:underline" title="Invalida el QR anterior">Nuevo código</button></form>
              <form action={deleteTable.bind(null, slug, x.id)}><button className="text-red-600 hover:underline">Eliminar</button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
