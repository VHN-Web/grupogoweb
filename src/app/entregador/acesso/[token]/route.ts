// Link de acesso enviado pela loja: grava a sessão neste celular e abre o app.
import { NextResponse } from "next/server";
import { courierByToken } from "@/services/courier-app";
import { COURIER_COOKIE } from "@/lib/courier-auth";
import { clientIp, rateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = new URL(req.url);
  const to = (p: string) => new URL(p, `${base.protocol}//${req.headers.get("x-forwarded-host") ?? base.host}`);
  if (!(await rateLimit(`courier-link:${await clientIp().catch(() => "x")}`, 30, 15 * 60))) return NextResponse.redirect(to("/entregador/entrar?erro=limite"));
  const s = await courierByToken(token);
  if (!s) return NextResponse.redirect(to("/entregador/entrar?erro=link"));
  const res = NextResponse.redirect(to("/entregador?bemvindo=1"));
  res.cookies.set(COURIER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
