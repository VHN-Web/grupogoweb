import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { setSession, verifyPassword } from "@/lib/auth";
import { AuthShell } from "@/components/brand/AuthShell";

export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { slug } = await params;
  const { e } = await searchParams;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true, name: true, primaryColor: true } });
  if (!tenant) notFound();

  async function login(formData: FormData) {
    "use server";
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
    // TODO(segurança): rate limit por IP/slug antes de produção
    if (!t || !verifyPassword(String(formData.get("password") ?? ""), t.adminPasswordHash)) redirect(`/painel/${slug}/login?e=1`);
    await setSession(`tenant:${t.id}`);
    redirect(`/painel/${slug}`);
  }

  return (
    <AuthShell eyebrow="Panel" title={tenant.name}>
      <form action={login} className="space-y-3">
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
        {e && <p className="text-sm text-red-400">Contraseña incorrecta</p>}
        <button className="btn-primary w-full py-3">Entrar</button>
      </form>
    </AuthShell>
  );
}
