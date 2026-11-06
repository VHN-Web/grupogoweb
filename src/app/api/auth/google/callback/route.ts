import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ownerSubject, readToken, setSession } from "@/lib/auth";
import { adminEmails, googleEmail, googleEnabled } from "@/lib/google";
import { appUrl } from "@/lib/urls";
import { audit, tooMany } from "@/lib/security";

// Volta do Google: confere o estado, lê o e-mail verificado e só entra se o e-mail estiver autorizado.
export async function GET(req: Request) {
  const limited = await tooMany(req, "google-cb", 30, 600);
  if (limited) return limited;
  const url = new URL(req.url);
  const subject = readToken(url.searchParams.get("state") ?? undefined);
  const [, nonce, to, slug] = (subject ?? "").split(":");
  const jar = await cookies();
  const cookieNonce = jar.get("g_nonce")?.value;
  const fail = (path: string) => {
    const r = NextResponse.redirect(`${appUrl()}${path}${path.includes("?") ? "&" : "?"}e=google`);
    r.cookies.delete({ name: "g_nonce", path: "/api/auth/google" });
    return r;
  };
  const loginPath = to === "admin" ? "/admin/login" : slug ? `/painel/${slug}/login` : "/";
  if (!googleEnabled() || !subject?.startsWith("g:") || !nonce || nonce !== cookieNonce) return fail(loginPath);
  const code = url.searchParams.get("code");
  if (!code) return fail(loginPath);
  const user = await googleEmail(code).catch(() => null);
  if (!user) return fail(loginPath);

  if (to === "admin") {
    if (!adminEmails().includes(user.email)) {
      await audit(null, `google: ${user.email}`, "login.fail", "admin via Google (e-mail não autorizado)");
      return fail("/admin/login?m=email");
    }
    await setSession("platform");
    await audit(null, `admin (Google ${user.email})`, "login.ok");
    const r = NextResponse.redirect(`${appUrl()}/admin`);
    r.cookies.delete({ name: "g_nonce", path: "/api/auth/google" });
    return r;
  }

  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!t || t.demo) return fail(loginPath);
  // e-mails do dono: o do contrato (cliente) e o e-mail Google cadastrado nas configurações
  const owner = await db.query.customers.findFirst({ where: and(eq(schema.customers.tenantId, t.id)) });
  const allowed = [owner?.email, t.loginEmail].filter(Boolean).map((e) => e!.trim().toLowerCase());
  if (!allowed.includes(user.email)) {
    await audit(t.id, `google: ${user.email}`, "login.fail", "e-mail Google não autorizado");
    return fail(`${loginPath}?m=email`);
  }
  await setSession(ownerSubject(t));
  await audit(t.id, `dono (Google ${user.email})`, "login.ok");
  const r = NextResponse.redirect(`${appUrl()}/painel/${t.slug}`);
  r.cookies.delete({ name: "g_nonce", path: "/api/auth/google" });
  return r;
}
