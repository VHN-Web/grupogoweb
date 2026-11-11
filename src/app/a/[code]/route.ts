// Link do afiliado: /a/CODIGO → conta o clique, guarda o afiliado no navegador (60 dias) e abre a página de demonstração.
import { NextResponse } from "next/server";
import { activeAffiliateByCode, affiliateConfig, recordClick } from "@/services/affiliates";
import { clientIp } from "@/lib/security";
import { REF_COOKIE } from "@/lib/affiliate-auth";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(req.url);
  const a = await activeAffiliateByCode(code);
  if (!a) return NextResponse.redirect(new URL("/?lang=pt", url));
  const bot = /bot|crawl|spider|preview|facebookexternalhit|whatsapp/i.test(req.headers.get("user-agent") ?? "");
  if (!bot) await recordClick(a, `${await clientIp(req)}|${req.headers.get("user-agent") ?? ""}`, url.searchParams.get("origem")).catch(() => null);
  const cfg = await affiliateConfig();
  // leva a origem junto: a tela CRM → Acessos mostra de onde veio quem abriu o link
  const origem = url.searchParams.get("origem")?.replace(/[^\w-]/g, "").slice(0, 30);
  const res = NextResponse.redirect(new URL(`/a/${a.code}/demo${origem ? `?origem=${origem}` : ""}`, url));
  res.cookies.set(REF_COOKIE, a.code, { path: "/", maxAge: cfg.cookieDays * 86400, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  return res;
}
