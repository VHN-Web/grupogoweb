import { hasModule } from "@/core/modules";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ownerSubject, setSession, staffSubject, verifyPassword } from "@/lib/auth";
import { audit, clearLimit, clientIp, isLimited, rateLimit } from "@/lib/security";
import { GoogleButton } from "@/components/brand/GoogleButton";
import { googleEnabled } from "@/lib/google";
import { AuthShell } from "@/components/brand/AuthShell";
import { getRegion, tr } from "@/core/region";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { name: true, country: true } });
  return { title: `${t?.name ?? "GoWeb"} — ${t?.country === "BR" ? "Entrar no painel" : "Ingresar al panel"}`, robots: { index: false } };
}

export default async function Login({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ e?: string; m?: string }>;
}) {
  const { slug } = await params;
  const { e, m } = await searchParams;
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true, name: true, primaryColor: true, country: true, tier: true, demo: true, modules: true } });
  if (!tenant) notFound();
  const T = tr(getRegion(tenant.country).locale);

  async function login(formData: FormData) {
    "use server";
    const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
    if (!t) redirect(`/painel/${slug}/login?e=1`);
    const password = String(formData.get("password") ?? "");
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    // Bloqueio contra força bruta: 5 erros em 15 min por IP + loja
    const ip = await clientIp();
    const lk = `login:${t.id}:${ip}`;
    if (await isLimited(lk, 5)) redirect(`/painel/${slug}/login?e=bloq`);
    const fail = async (who: string) => {
      await rateLimit(lk, 5, 15 * 60);
      await audit(t.id, who, "login.fail");
      redirect(`/painel/${slug}/login?e=1`);
    };
    if (username) {
      // Funcionário (GoInteligence)
      const s = await db.query.staff.findFirst({ where: and(eq(schema.staff.tenantId, t.id), eq(schema.staff.username, username)) });
      if (!s || !s.active || t.tier !== "pro" || !hasModule(t, "equipe") || !verifyPassword(password, s.passwordHash)) return fail(`equipe: ${username.slice(0, 30)}`);
      await clearLimit(lk);
      await setSession(staffSubject(s));
      await audit(t.id, `equipe: ${s.name}`, "login.ok");
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
    if (!verifyPassword(password, t.adminPasswordHash)) return fail("dono");
    await clearLimit(lk);
    await setSession(ownerSubject(t));
    await audit(t.id, "dono", "login.ok");
    redirect(`/painel/${slug}`);
  }

  return (
    <AuthShell eyebrow={T("Panel", "Painel")} title={tenant.name}>
      <form action={login} className="space-y-3">
        {tenant.tier === "pro" && hasModule(tenant, "equipe") && (
          <>
            <label className="label" htmlFor="username">{T("Usuario (solo equipo)", "Usuário (só para equipe)")}</label>
            <input id="username" name="username" className="input" autoComplete="username" placeholder={T("Dueño: dejá vacío", "Dono: deixe vazio")} />
          </>
        )}
        <label className="label" htmlFor="password">{T("Contraseña", "Senha")}</label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
        {e === "bloq" ? (
          <p className="text-sm text-red-400">{T("Demasiados intentos. Esperá 15 minutos e intentá de nuevo.", "Muitas tentativas. Aguarde 15 minutos e tente de novo.")}</p>
        ) : e ? (
          <p className="text-sm text-red-400">{T("Usuario o contraseña incorrectos", "Usuário ou senha incorretos")}</p>
        ) : null}
        <button className="btn-primary w-full py-3">Entrar</button>
      </form>
      {googleEnabled() && !tenant.demo && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 text-xs text-[#8D877C]"><span className="h-px flex-1 bg-[#2C2C31]" />{T("o", "ou")}<span className="h-px flex-1 bg-[#2C2C31]" /></div>
          <GoogleButton href={`/api/auth/google?para=painel&loja=${slug}`} label={T("Entrar con Google", "Entrar com Google")} />
          {e === "google" && (
            <p className="text-sm text-red-400">
              {m === "email"
                ? T("Esta cuenta de Google no está autorizada para este panel. Usá el e-mail del contrato o configuralo en Configuración → Seguridad.", "Esta conta Google não está autorizada neste painel. Use o e-mail do contrato ou cadastre-o em Configurações → Segurança.")
                : T("No se pudo entrar con Google. Intentá de nuevo.", "Não foi possível entrar com Google. Tente de novo.")}
            </p>
          )}
        </div>
      )}
    </AuthShell>
  );
}
