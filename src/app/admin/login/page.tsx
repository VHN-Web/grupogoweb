import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminSubject, setSession, verifyPassword } from "@/lib/auth";
import { GoogleButton } from "@/components/brand/GoogleButton";
import { googleEnabled } from "@/lib/google";
import { audit, clearLimit, clientIp, isLimited, rateLimit } from "@/lib/security";
import { AuthShell } from "@/components/brand/AuthShell";
import { headers } from "next/headers";
import { isGoWebAppUA } from "@/core/courier-native";

export const metadata = { title: "GoWeb — Administração", robots: { index: false } };

async function login(f: FormData) {
  "use server";
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const got = String(f.get("password") ?? "");
  // depois do login, volta para o app do CRM se veio de lá
  const nx = String(f.get("next") ?? "");
  const dest = nx === "/crm" || nx.startsWith("/crm/") ? nx : "/admin";
  const q = dest === "/admin" ? "" : `&next=${encodeURIComponent(dest)}`;
  // Bloqueio contra força bruta: 5 erros em 30 min por IP
  const lk = `admin-login:${await clientIp()}`;
  if (await isLimited(lk, 5)) redirect(`/admin/login?e=bloq${q}`);
  const fail = async (who: string): Promise<never> => {
    await rateLimit(lk, 5, 30 * 60);
    await audit(null, who, "login.fail");
    redirect(`/admin/login?e=1${q}`);
  };
  if (email) {
    // Admin cadastrado (e-mail + senha)
    const a = await db.query.platformAdmins.findFirst({ where: eq(schema.platformAdmins.email, email) });
    if (!a || !a.active || !a.passwordHash || !verifyPassword(got, a.passwordHash)) return fail(`admin: ${email.slice(0, 40)}`);
    await clearLimit(lk);
    await db.update(schema.platformAdmins).set({ lastLoginAt: new Date() }).where(eq(schema.platformAdmins.id, a.id));
    await audit(null, `admin: ${a.name}`, "login.ok");
    await setSession(adminSubject(a));
    redirect(dest);
  }
  // Senha-mestra (administrador principal)
  const expected = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  const ok = expected.length > 0 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return fail("admin");
  await clearLimit(lk);
  await audit(null, "admin", "login.ok");
  await setSession("platform");
  redirect(dest);
}

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ e?: string; m?: string; next?: string }> }) {
  const { e, m, next } = await searchParams;
  // o Google não deixa entrar por dentro de apps (WebView): no app Android do CRM, só e-mail e senha
  const inApp = isGoWebAppUA((await headers()).get("user-agent"));
  const crm = !!next && (next === "/crm" || next.startsWith("/crm/"));
  return (
    <AuthShell eyebrow={crm ? "App dos sócios" : "Plataforma"} title={crm ? "CRM GoWeb" : "Admin"}>
      <form action={login} className="space-y-3">
        {crm && <input type="hidden" name="next" value={next} />}
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" autoComplete="username" placeholder="Administrador principal: deixe vazio" />
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" />
        {e && e !== "google" && <p className="text-sm text-red-400">{e === "bloq" ? "Muitas tentativas. Aguarde 30 minutos." : "Senha incorreta"}</p>}
        <button className="btn-primary w-full py-3">Entrar</button>
      </form>
      {inApp && <p className="mt-5 text-center text-xs text-[#8D877C]">No app, entre com e-mail e senha. Login com Google só pelo navegador.</p>}
      {googleEnabled() && !inApp && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 text-xs text-[#8D877C]"><span className="h-px flex-1 bg-[#2C2C31]" />ou<span className="h-px flex-1 bg-[#2C2C31]" /></div>
          <GoogleButton href="/api/auth/google?para=admin" label="Entrar com Google" />
          {e === "google" && <p className="text-sm text-red-400">{m === "email" ? "Esta conta Google não tem acesso ao admin." : "Não foi possível entrar com Google. Tente de novo."}</p>}
        </div>
      )}
    </AuthShell>
  );
}
