// Página só de impressão dos QR das mesas (fora do layout do painel).
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { menuUrl, qrSvg } from "@/lib/qr";
import { getRegion, tr } from "@/core/region";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const SIZES = { pequeno: { cols: 3, qr: 46, name: 13, label: 22 }, medio: { cols: 2, qr: 70, name: 16, label: 30 }, grande: { cols: 1, qr: 120, name: 26, label: 52 } } as const;

export default async function PrintTables({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ids?: string | string[]; tamanho?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "tables");
  const T = tr(getRegion(t.country).locale);
  const ids = (Array.isArray(sp.ids) ? sp.ids : sp.ids ? sp.ids.split(",") : []).slice(0, 200);
  const size = SIZES[(sp.tamanho as keyof typeof SIZES) in SIZES ? (sp.tamanho as keyof typeof SIZES) : "medio"];
  const tables = (
    await db.query.diningTables.findMany({ where: ids.length ? and(eq(schema.diningTables.tenantId, t.id), inArray(schema.diningTables.id, ids)) : and(eq(schema.diningTables.tenantId, t.id), eq(schema.diningTables.active, true)) })
  ).sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  const qrs = await Promise.all(tables.map(async (x) => ({ ...x, svg: await qrSvg(menuUrl(t, x.code)) })));
  const color = /^#[0-9a-f]{6}$/i.test(t.primaryColor) ? t.primaryColor : "#16130F";
  return (
    <div className="sheet">
      <style>{`
        @page { size: A4; margin: 10mm; }
        html, body { background: #fff !important; color: #111; }
        .sheet { font-family: system-ui, sans-serif; padding: 16px; }
        .grid { display: grid; gap: 8mm; grid-template-columns: repeat(${size.cols}, 1fr); }
        .q { border: 2.5px solid ${color}; border-radius: 14px; padding: 5mm; text-align: center; break-inside: avoid; }
        .q .n { font-weight: 700; font-size: ${size.name}px; margin: 0; color: ${color}; }
        .q .qr { width: ${size.qr}mm; margin: 2mm auto; } .q .qr svg { width: 100%; height: auto; display: block; }
        .q .l { font-weight: 900; font-size: ${size.label}px; margin: 0; }
        .q .h { font-size: ${Math.round(size.name * 0.85)}px; margin: 1mm 0 0; color: #333; }
        @media print { .no-print { display: none } }
      `}</style>
      <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <PrintButton label={T("Imprimir / guardar PDF", "Imprimir / salvar PDF")} className="rounded-xl border px-4 py-2 text-sm font-semibold" />
        <span style={{ fontSize: 14, color: "#555" }}>{qrs.length} QR</span>
      </div>
      <div className="grid">
        {qrs.map((x) => (
          <div key={x.id} className="q">
            <p className="n">{t.name}</p>
            <div className="qr" dangerouslySetInnerHTML={{ __html: x.svg }} />
            <p className="l">{x.label}</p>
            <p className="h">{T("Escaneá para ver el menú y pedir", "Aponte a câmera para ver o cardápio e pedir")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
