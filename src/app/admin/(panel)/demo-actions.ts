"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminActor, hashPassword, requirePlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";
import { randomPassword } from "@/core/billing";
import { createDemoStore } from "@/services/demo";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (msg: string, kind: "ok" | "err" = "ok"): never => redirect(`/admin/demos?${kind}=${encodeURIComponent(msg)}`);

/** A senha aparece uma vez só, num cookie curto (não vai para a URL nem para o histórico). */
async function flash(slug: string, password: string) {
  (await cookies()).set("demo_flash", JSON.stringify({ slug, password }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin/demos", maxAge: 120 });
}

export async function newDemo(f: FormData) {
  await requirePlatformAdmin();
  const name = str(f, "name").slice(0, 60);
  if (name.length < 2) back("Informe o nome da loja.", "err");
  let res: Awaited<ReturnType<typeof createDemoStore>> | null = null;
  try {
    res = await createDemoStore({ templateSlug: str(f, "template"), name, slug: str(f, "slug") || null, note: str(f, "note") || null });
  } catch (e) {
    back(e instanceof Error ? e.message : "Não foi possível criar a demonstração.", "err");
  }
  await audit(res!.tenant.id, await adminActor(), "demo.create", `${name} (${res!.tenant.slug}) a partir de ${str(f, "template")}`);
  await flash(res!.tenant.slug, res!.password);
  back(`Demonstração “${name}” criada com tudo liberado.`);
}

export async function resetDemoPassword(id: string) {
  await requirePlatformAdmin();
  const t = await db.query.tenants.findFirst({ where: and(eq(schema.tenants.id, id), eq(schema.tenants.demo, true), isNotNull(schema.tenants.demoNote)) });
  if (!t) return back("Demonstração não encontrada.", "err");
  const password = randomPassword(10);
  await db.update(schema.tenants).set({ adminPasswordHash: hashPassword(password), sessionVersion: sql`${schema.tenants.sessionVersion} + 1` }).where(eq(schema.tenants.id, t.id));
  await db.update(schema.staff).set({ passwordHash: hashPassword(password) }).where(eq(schema.staff.tenantId, t.id));
  await audit(t.id, await adminActor(), "demo.password", t.slug);
  await flash(t.slug, password);
  back(`Nova senha gerada para ${t.name}.`);
}

export async function deleteDemo(id: string) {
  await requirePlatformAdmin();
  // só apaga demonstrações criadas pelo admin (nunca loja real nem as demos do sistema)
  const t = await db.query.tenants.findFirst({ where: and(eq(schema.tenants.id, id), eq(schema.tenants.demo, true), isNotNull(schema.tenants.demoNote)) });
  if (!t) return back("Demonstração não encontrada.", "err");
  await db.delete(schema.tenants).where(eq(schema.tenants.id, t.id));
  await audit(null, await adminActor(), "demo.delete", `${t.name} (${t.slug})`);
  back(`${t.name} apagada.`);
}

// ---------------------------------------------------------------- montar com a Geovana
/** Pesquisa o estabelecimento (e lê as fotos do cardápio, se vierem) → página de prévia. */
export async function geovanaResearchAction(f: FormData) {
  const admin = await requirePlatformAdmin();
  const { parseLinks } = await import("@/core/store-research");
  const { researchDraft, DemoAiError } = await import("@/services/demo-ai");
  const name = str(f, "name").slice(0, 80);
  if (name.length < 2) back("Informe o nome do estabelecimento.", "err");
  const country = str(f, "country") === "PY" ? "PY" : "BR";
  const photos: { base64: string; mime: string }[] = [];
  for (const k of ["menu1", "menu2", "menu3"]) {
    const file = f.get(k);
    if (file instanceof File && file.size > 0 && file.size <= 4_500_000 && file.type.startsWith("image/")) {
      photos.push({ base64: Buffer.from(await file.arrayBuffer()).toString("base64"), mime: file.type });
    }
  }
  let id = "";
  try {
    id = await researchDraft(
      { name, city: str(f, "city").slice(0, 80) || null, links: parseLinks(str(f, "links")), notes: str(f, "notes").slice(0, 300) || null, country, leadId: str(f, "lead") || null },
      admin.id ?? "platform",
      photos,
    );
  } catch (e) {
    back(e instanceof DemoAiError ? e.message : "A Geovana não conseguiu pesquisar agora. Tente de novo em instantes.", "err");
  }
  redirect(`/admin/demos/geovana/${id}`);
}

/** Prévia conferida → cria a loja demo (senha aparece uma vez, como nas outras demonstrações). */
export async function createFromDraftAction(id: string, f: FormData) {
  const admin = await requirePlatformAdmin();
  const { createDemoFromDraft, DemoAiError } = await import("@/services/demo-ai");
  const { nicheOf } = await import("@/core/store-research");
  let res: Awaited<ReturnType<typeof createDemoFromDraft>> | null = null;
  try {
    res = await createDemoFromDraft(
      id,
      {
        name: str(f, "name").slice(0, 60),
        niche: nicheOf(str(f, "niche")).id,
        tagline: str(f, "tagline").slice(0, 60),
        address: str(f, "address").slice(0, 200),
        color: str(f, "color"),
        hours: str(f, "hours").slice(0, 200),
        useMenu: f.get("useMenu") === "on",
        note: str(f, "note"),
      },
      { id: admin.id ?? "platform", name: admin.id ? admin.name : "Lázaro" },
    );
  } catch (e) {
    redirect(`/admin/demos/geovana/${id}?err=${encodeURIComponent(e instanceof DemoAiError || e instanceof Error ? e.message : "Não foi possível criar a demonstração.")}`);
  }
  await audit(res!.tenant.id, await adminActor(), "demo.create", `${res!.tenant.name} (${res!.tenant.slug}) montada pela Geovana`);
  await flash(res!.tenant.slug, res!.password);
  back(`Demonstração “${res!.tenant.name}” montada pela Geovana${res!.menuItems ? ` com ${res!.menuItems} produtos do cardápio real` : ""}.`);
}
