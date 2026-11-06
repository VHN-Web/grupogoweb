// Comprovante no formato da impressora térmica (58/80 mm). Aberto num iframe invisível pelo painel,
// que chama a impressão do navegador. Com Chrome em --kiosk-printing a impressão é silenciosa.
import { notFound } from "next/navigation";
import { requireTenantAdmin } from "@/lib/auth";
import { getOrderWithItems } from "@/services/orders";
import { Receipt } from "@/components/Receipt";
import { PrintOnLoad } from "@/components/ThermalPrint";

export const dynamic = "force-dynamic";

export default async function ThermalTicket({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const { slug, id } = await params;
  const { auto } = await searchParams;
  const t = await requireTenantAdmin(slug, "orders");
  const o = await getOrderWithItems(t.id, id);
  if (!o) notFound();
  const mm = t.printerWidth === 58 ? 58 : 80;
  return (
    <div className="thermal" style={{ width: `${mm}mm` }}>
      <style>{`
        @page { size: ${mm}mm auto; margin: 0; }
        html, body { background: #fff !important; margin: 0; }
        .thermal { padding: 2mm 3mm; color: #000; }
        .thermal * { color: #000 !important; }
        .thermal > div { max-width: none !important; padding: 0 !important; font-size: ${mm === 58 ? 10.5 : 12}px !important; }
      `}</style>
      <Receipt tenant={t} order={o} />
      {auto !== "0" && <PrintOnLoad />}
    </div>
  );
}
