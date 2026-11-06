import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { setSession } from "@/lib/auth";
import { AuthShell } from "@/components/brand/AuthShell";

async function login(f: FormData) {
  "use server";
  const expected = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  const got = String(f.get("password") ?? "");
  // TODO(segurança): rate limit antes de produção
  const ok = expected.length > 0 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) redirect("/admin/login?e=1");
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
        {e && <p className="text-sm text-red-400">Senha incorreta</p>}
        <button className="btn-primary w-full py-3">Entrar</button>
      </form>
    </AuthShell>
  );
}
