import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/services/billing";

// Usado pelo middleware: descobre qual estabelecimento atende um host.
//   www.donmario.com.py   -> domínio próprio do tenant
//   donmario.goweboficial.com   -> subdomínio da plataforma
//   goweboficial.com / www      -> site principal
export async function GET(req: Request) {
  const host = (new URL(req.url).searchParams.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!host) return NextResponse.json({});
  const bare = host.replace(/^www\./, "");

  const byDomain = await db.query.tenants.findFirst({
    where: eq(schema.tenants.customDomain, host),
    columns: { slug: true },
  }) ?? await db.query.tenants.findFirst({ where: eq(schema.tenants.customDomain, bare), columns: { slug: true } })
     ?? await db.query.tenants.findFirst({ where: eq(schema.tenants.customDomain, `www.${bare}`), columns: { slug: true } });
  if (byDomain) return NextResponse.json({ slug: byDomain.slug });

  const s = await getSettings();
  const pd = s.platformDomain?.toLowerCase();
  if (pd) {
    if (bare === pd) return NextResponse.json({ main: true });
    if (host.endsWith(`.${pd}`)) {
      const sub = host.slice(0, -(pd.length + 1));
      if (!sub.includes(".")) {
        const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, sub), columns: { slug: true } });
        if (t) return NextResponse.json({ slug: t.slug });
      }
    }
  }
  return NextResponse.json({});
}
