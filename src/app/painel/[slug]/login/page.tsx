import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { setSession, verifyPassword } from "@/lib/auth";
import { AuthShell } from "@/components/brand/AuthShell";
import { getRegion, tr } from "@/core/region";

export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  const { slug } = await params;
  const { e } = await searchParams;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true, name: true, primaryColor: true, country: true, tier: true } });
  if (!tenant) notFound();
  const T = tr(getRegion(tenant.country).locale);

  async function login(formData: FormData) {
    "use server";
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
    if (!t) redirect(`/painel/${slug}/login?e=1`);
    const password = String(formData.get("password") ?? "");
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    // TODO(segurança): rate limit por IP/slug antes de produção
    if (username) {
      // Funcionário (GoInteligence)
      const s = await db.query.staff.findFirst({ where: and(eq(schema.staff.tenantId, t.id), eq(schema.staff.username, username)) });
      if (!s || !s.active || t.tier !== "pro" || !verifyPassword(password, s.passwordHash)) redirect(`/painel/${slug}/login?e=1`);
      await setSession(`staff:${s.id}`);
      let first = "";
      try {
        const perms = JSON.parse(s.permissions) as string[];
        const order: [string, string][] = [["orders", ""], ["cash", "/caixa"], ["products", "/produtos"], ["agenda", "/agenda"], ["marketing", "/marketing"], ["fiscal", "/notas"], ["tables", "/mesas"], ["appearance", "/aparencia"], ["settings", "/config"]];
        first = order.find(([a]) => perms.includes(a))?.[1] ?? "/sem-acesso";
      } catch {
        first = "/sem-acesso";
      }
      redirect(`/painel/${slug}${first}`);
    }
    if (!verifyPassword(password, t.adminPasswordHash)) redirect(`/painel/${slug}/login?e=1`);
    await setSession(`tenant:${t.id}`);
    redirect(`/painel/${slug}`);
  }

  return (
    <AuthShell eyebrow={T("Panel", "Painel")} title={tenant.name}>
      <form action={login} className="space-y-3">
        {tenant.tier === "pro" && (
          <>
            <label className="label" htmlFor="username">{T("Usuario (solo equipo)", "Usuário (só para equipe)")}</label>
            <input id="username" name="username" className="input" autoComplete="username" placeholder={T("Dueño: dejá vacío", "Dono: deixe vazio")} />
          </>
        )}
        <label className="label" htmlFor="password">{T("Contraseña", "Senha")}</label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
        {e && <p className="text-sm text-red-400">{T("Usuario o contraseña incorrectos", "Usuário ou senha incorretos")}</p>}
        <button className="btn-primary w-full py-3">Entrar</button>
      </form>
    </AuthShell>
  );
}
