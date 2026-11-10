"use server";
// Cardápio por foto (painel → Produtos → Importar por foto).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit, rateLimit } from "@/lib/security";
import { menuSummary, type MenuItem } from "@/core/menu-import";
import { AiError } from "@/adapters/ai/gemini";
import { GeovanaError } from "@/services/geovana";
import { MenuImportError, discardImport, importMenu, publishImport, readMenuPhoto } from "@/services/menu-import";

const msgOf = (e: unknown) => (e instanceof MenuImportError || e instanceof AiError || e instanceof GeovanaError ? e.message : "Não consegui ler a foto agora. Tente de novo em instantes.");

export async function readMenuAction(slug: string, f: FormData): Promise<{ items?: MenuItem[]; error?: string }> {
  const t = await requireTenantAdmin(slug, "products");
  if (!(await rateLimit(`menu-photo:${t.id}`, 20, 3600))) return { error: "Muitas fotos em pouco tempo. Tente de novo em 1 hora." };
  const file = f.get("photo");
  if (!(file instanceof File) || !file.size) return { error: "Escolha a foto do cardápio." };
  try {
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return { items: await readMenuPhoto(t, b64, file.type || "image/jpeg") };
  } catch (e) {
    console.error("[menu-photo]", e instanceof Error ? e.message : e);
    return { error: msgOf(e) };
  }
}

export async function saveMenuImportAction(slug: string, json: string, publish: boolean) {
  const t = await requireTenantAdmin(slug, "products");
  let items: MenuItem[] = [];
  try {
    items = (JSON.parse(json) as MenuItem[])
      .filter((i) => i && typeof i.name === "string" && i.name.trim() && Number.isInteger(i.priceMinor) && i.priceMinor > 0)
      .map((i) => ({ category: String(i.category || "Cardápio").slice(0, 60), name: i.name.trim().slice(0, 120), description: String(i.description ?? "").slice(0, 400), priceMinor: i.priceMinor }));
  } catch {}
  if (!items.length) redirect(`/painel/${slug}/produtos/importar?err=${encodeURIComponent("Nenhum item para importar.")}`);
  const r = await importMenu(t, items, { hidden: !publish });
  await audit(t.id, await actorName(slug), "menu.import", menuSummary(items));
  revalidatePath(`/painel/${slug}/produtos`);
  redirect(`/painel/${slug}/produtos?ok=${encodeURIComponent(`${r.created} produto(s) importado(s)${r.skipped ? `, ${r.skipped} já existiam` : ""}${publish ? "" : " — ocultos até você publicar"}.`)}`);
}

export async function publishImportAction(slug: string, batch: string) {
  const t = await requireTenantAdmin(slug, "products");
  const n = await publishImport(t.id, batch);
  revalidatePath(`/painel/${slug}/produtos`);
  redirect(`/painel/${slug}/produtos?ok=${encodeURIComponent(`${n} produto(s) publicados.`)}`);
}

export async function discardImportAction(slug: string, batch: string) {
  const t = await requireTenantAdmin(slug, "products");
  const n = await discardImport(t.id, batch);
  revalidatePath(`/painel/${slug}/produtos`);
  redirect(`/painel/${slug}/produtos?ok=${encodeURIComponent(`${n} produto(s) importados foram descartados.`)}`);
}
