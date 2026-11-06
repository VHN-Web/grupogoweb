import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { setSession } from "@/lib/auth";
import { audit, clearLimit, clientIp, isLimited, rateLimit } from "@/lib/security";
import { AuthShell } from "@/components/brand/AuthShell";

async function login(f: FormData) {
  "use server";
  const expected = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  const got = String(f.get("password") ?? "");
  // Bloqueio contra força bruta: 5 erros em 30 min por IP
  const lk = `admin-login:${await clientIp()}`;
  if (await isLimited(lk, 5)) redirect("/admin/login?e=bloq");
  const ok = expected.length > 0 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) {
    await rateLimit(lk, 5, 30 * 60);
    await audit(null, "admin", "login.fail");
    redirect("/admin/login?e=1");
  }
  await clearLimit(lk);
  await audit(null, "admin", "login.ok");
  await setSession("platform");
  redirect("/admin");
}

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <AuthShell eyebrow="Plataforma" title="Admin">
      <form action={login} className="space-y-3">
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="input" autoFocus />
        {e && <p className="text-sm text-red-400">{e === "bloq" ? "Muitas tentativas. Aguarde 30 minutos." : "Senha incorreta"}</p>}
        <button className="btn-primary w-full py-3">Entrar</button>
      </form>
    </AuthShell>
  );
}
