import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantAdmin } from "@/lib/auth";
import { CURRENCY_SYMBOL, MINOR_UNITS } from "@/core/money";
import type { Currency } from "@/core/types";
import { MenuPhotoImport } from "@/components/menu/MenuPhotoImport";
import { readMenuAction, saveMenuImportAction } from "../../menu-import-actions";

export const dynamic = "force-dynamic";

export default async function ImportMenuPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ err?: string }> }) {
  const { slug } = await params;
  const { err } = await searchParams;
  const t = await requireTenantAdmin(slug, "products");
  if (t.country !== "BR") redirect(`/painel/${slug}/produtos`);
  const cur = t.currency as Currency;
  return (
    <div className="max-w-4xl space-y-4">
      <Link href={`/painel/${slug}/produtos`} className="text-sm text-muted hover:underline">← Produtos</Link>
      <div>
        <h1 className="text-xl font-bold">Cadastrar pela foto do cardápio</h1>
        <p className="text-sm text-muted">A IA lê a foto e monta a lista com categorias, produtos, descrições e preços. Você confere, corrige o que precisar e importa. Fotos dos produtos você coloca depois em cada item.</p>
      </div>
      {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      <MenuPhotoImport read={readMenuAction.bind(null, slug)} save={saveMenuImportAction.bind(null, slug)} money={{ symbol: CURRENCY_SYMBOL[cur], decimals: Math.round(Math.log10(MINOR_UNITS[cur])) }} />
    </div>
  );
}
