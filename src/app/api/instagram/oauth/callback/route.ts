// Volta do login oficial do Instagram: confere o state (selado, 10 min), o plano de novo, troca o código e liga o webhook.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanAuthCode, readState } from "@/core/instagram";
import { IgError, InstagramError, igFinishLogin } from "@/services/instagram";
import { openSecret } from "@/lib/secrets";
import { appUrl } from "@/lib/urls";
import { tooMany } from "@/lib/security";

export const dynamic = "force-dynamic";

async function backTo(stateRaw: string | null) {
  try {
    const st = readState(JSON.parse(openSecret(stateRaw ?? "")), 0); // só para saber para onde voltar (mesmo vencido)
    if (st?.scope === "store" && st.tenantId) {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, st.tenantId), columns: { slug: true } });
      if (t) return `/painel/${t.slug}/${st.purpose === "publish" ? "crescer" : "instagram"}`;
    }
  } catch {}
  return "/admin/geovana/instagram";
}

export async function GET(req: Request) {
  const limited = await tooMany(req, "ig-oauth", 20, 600);
  if (limited) return limited;
  const u = new URL(req.url);
  const state = u.searchParams.get("state");
  const code = u.searchParams.get("code");
  const back = await backTo(state);
  if (u.searchParams.get("error") || !code || !state) {
    const why = u.searchParams.get("error_description") || "Login cancelado.";
    return NextResponse.redirect(`${appUrl()}${back}?err=${encodeURIComponent(why)}`);
  }
  try {
    const r = await igFinishLogin(cleanAuthCode(code), state);
    const dest = r.tenant ? `/painel/${r.tenant.slug}/${r.purpose === "publish" ? "crescer" : "instagram"}` : "/admin/geovana/instagram";
    return NextResponse.redirect(`${appUrl()}${dest}?ok=${encodeURIComponent(`Instagram @${r.username ?? ""} conectado.`)}`);
  } catch (e) {
    const msg = e instanceof InstagramError || e instanceof IgError ? e.message : "Não foi possível concluir o login do Instagram.";
    if (!(e instanceof InstagramError)) console.error("[instagram oauth]", e);
    return NextResponse.redirect(`${appUrl()}${back}?err=${encodeURIComponent(msg)}`);
  }
}
