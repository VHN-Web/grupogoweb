// Materiais impressos do kit de divulgação (adesivo, display A5, panfleto).
import { requireTenantAdmin } from "@/lib/auth";
import { qrSvg } from "@/lib/qr";
import { tenantPublicUrl } from "@/lib/urls";
import { tr, getRegion } from "@/core/region";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function Material({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { slug } = await params;
  const { tipo = "adesivo" } = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const T = tr(getRegion(t.country).locale);
  const kind = ["adesivo", "display", "panfleto"].includes(tipo) ? tipo : "adesivo";
  const src = kind === "adesivo" ? "qr" : kind === "display" ? "qr" : "panfleto";
  const url = `${tenantPublicUrl(t)}?origem=${src}`;
  const qr = await qrSvg(url);
  const color = t.primaryColor || "#16130F";
  const short = tenantPublicUrl(t).replace(/^https?:\/\//, "");
  const Card = ({ big }: { big?: boolean }) => (
    <div className="mcard" style={{ borderColor: color }}>
      {t.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={t.logoUrl} alt="" className="logo" />}
      <p className="name" style={{ color }}>{t.name}</p>
      <p className="cta">{big ? T("Pedí por acá", "Peça por aqui") : T("Escaneá y pedí", "Aponte a câmera e peça")}</p>
      <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
      <p className="url">{short}</p>
      {kind === "panfleto" && <p className="sub">{T("Menú completo, pedido rápido y sin filas.", "Cardápio completo, pedido rápido e sem fila.")}</p>}
    </div>
  );
  const n = kind === "adesivo" ? 6 : kind === "panfleto" ? 4 : 1;
  return (
    <div className="sheet">
      <style>{`
        @page { size: A4; margin: 10mm; }
        html, body { background: #fff !important; color: #111; }
        .sheet { font-family: system-ui, sans-serif; padding: 16px; }
        .grid { display: grid; gap: 8mm; grid-template-columns: repeat(${n === 1 ? 1 : 2}, 1fr); }
        .mcard { border: 3px solid; border-radius: 14px; padding: ${n === 1 ? "14mm" : "6mm"}; text-align: center; break-inside: avoid; ${n === 1 ? "width: 128mm; margin: 0 auto;" : ""} }
        .logo { height: ${n === 1 ? 24 : 12}mm; margin: 0 auto 2mm; object-fit: contain; }
        .name { font-weight: 900; font-size: ${n === 1 ? 30 : 18}px; margin: 0; }
        .cta { font-weight: 700; font-size: ${n === 1 ? 22 : 13}px; margin: 2mm 0; }
        .qr { width: ${n === 1 ? 90 : 42}mm; margin: 0 auto; } .qr svg { width: 100%; height: auto; }
        .url { font-size: ${n === 1 ? 14 : 10}px; color: #555; margin: 2mm 0 0; }
        .sub { font-size: 12px; margin: 2mm 0 0; }
        @media print { .no-print { display: none } }
      `}</style>
      <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <PrintButton label={T("Imprimir / PDF", "Imprimir / PDF")} className="rounded-xl border px-4 py-2 text-sm font-semibold" />
      </div>
      <div className="grid">{Array.from({ length: n }, (_, i) => <Card key={i} big={n === 1} />)}</div>
    </div>
  );
}
