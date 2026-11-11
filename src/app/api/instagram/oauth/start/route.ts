// Início do login oficial do Instagram. ?escopo=goweb (admin da plataforma) ou ?loja=<slug> (dono/equipe da loja GoInteligence).
// A sessão e o plano são conferidos aqui, no servidor, e de novo na volta (callback).
import { NextResponse } from "next/server";
import { getPanelAccess, getPlatformAdmin } from "@/lib/auth";
import { igLoginUrl, InstagramError } from "@/services/instagram";
import { appUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const slug = u.searchParams.get("loja");
  const back = slug ? `/painel/${encodeURIComponent(slug)}/instagram` : "/admin/geovana/instagram";
  try {
    if (slug) {
      const acc = await getPanelAccess(slug);
      if (!acc || !acc.areas.has("customers")) return NextResponse.redirect(`${appUrl()}/painel/${encodeURIComponent(slug)}/login`);
      const actor = acc.isPlatform ? "admin da plataforma" : acc.role === "owner" ? "dono" : `equipe: ${acc.staffName ?? acc.staffId}`;
      return NextResponse.redirect(await igLoginUrl({ tenantId: acc.tenant.id }, actor));
    }
    const admin = await getPlatformAdmin();
    if (!admin) return NextResponse.redirect(`${appUrl()}/admin/login`);
    return NextResponse.redirect(await igLoginUrl("goweb", admin.name));
  } catch (e) {
    const msg = e instanceof InstagramError ? e.message : "Não foi possível iniciar o login do Instagram.";
    return NextResponse.redirect(`${appUrl()}${back}?err=${encodeURIComponent(msg)}`);
  }
}
