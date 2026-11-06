import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { makeToken } from "@/lib/auth";
import { googleAuthUrl, googleEnabled } from "@/lib/google";
import { appUrl } from "@/lib/urls";
import { tooMany } from "@/lib/security";

// Início do "Entrar com Google". ?para=admin  ou  ?para=painel&loja=<slug>
export async function GET(req: Request) {
  const limited = await tooMany(req, "google-start", 30, 600);
  if (limited) return limited;
  const url = new URL(req.url);
  const to = url.searchParams.get("para") === "admin" ? "admin" : "painel";
  const slug = (url.searchParams.get("loja") ?? "").replace(/[^a-z0-9-]/g, "").slice(0, 60);
  const back = to === "admin" ? `${appUrl()}/admin/login` : `${appUrl()}/painel/${slug}/login`;
  if (!googleEnabled() || (to === "painel" && !slug)) return NextResponse.redirect(`${back}?e=google`);
  const nonce = randomBytes(16).toString("base64url");
  // estado assinado + cookie: garante que a volta do Google é desta mesma tentativa (contra CSRF)
  const state = makeToken(`g:${nonce}:${to}:${slug}`, 600);
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set("g_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  return res;
}
