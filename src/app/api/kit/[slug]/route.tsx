// Artes prontas (post 1080×1080 e story 1080×1920) do kit de divulgação, geradas na hora.
import { ImageResponse } from "next/og";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMoney } from "@/core/money";
import { getRegion, tr } from "@/core/region";
import type { Currency } from "@/core/types";
import { appUrl, tenantPublicUrl } from "@/lib/urls";

export const runtime = "nodejs";

const fg = (hex: string) => {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#111" : "#fff";
};
const abs = (u: string | null | undefined) => (!u ? null : /^https:\/\//.test(u) ? u : u.startsWith("/") ? `${appUrl()}${u}` : null);

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const q = new URL(req.url).searchParams;
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!t || t.suspended) return new Response("not found", { status: 404 });
  const story = q.get("formato") === "story";
  const pid = q.get("p");
  const p = pid ? await db.query.products.findFirst({ where: and(eq(schema.products.id, pid), eq(schema.products.tenantId, t.id)) }) : null;
  const T = tr(getRegion(t.country).locale);
  const bg = /^#[0-9a-fA-F]{6}$/.test(t.primaryColor) ? t.primaryColor : "#16130F";
  const ink = fg(bg);
  const W = 1080, H = story ? 1920 : 1080;
  const photo = abs(p?.imageUrl);
  const logo = abs(t.logoUrl);
  const price = p ? formatMoney(p.promoPricePyg && p.promoEndsAt && p.promoEndsAt > new Date() ? p.promoPricePyg : p.pricePyg, t.currency as Currency) : null;
  const url = tenantPublicUrl(t).replace(/^https?:\/\//, "");

  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: bg, color: ink, padding: 80, fontFamily: "sans-serif", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {logo && <img src={logo} width={120} height={120} style={{ borderRadius: 60, objectFit: "cover", background: "#fff" }} alt="" />}
          <div style={{ display: "flex", fontSize: 58, fontWeight: 800 }}>{t.name}</div>
        </div>
        {photo ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <img src={photo} width={story ? 900 : 560} height={story ? 900 : 560} style={{ borderRadius: 48, objectFit: "cover" }} alt="" />
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: story ? 120 : 96, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2 }}>
            {p ? p.name : T("Pedí online, sin filas.", "Peça online, sem fila.")}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {p && photo && <div style={{ display: "flex", fontSize: 64, fontWeight: 800 }}>{p.name}</div>}
          {price && <div style={{ display: "flex", fontSize: 84, fontWeight: 900 }}>{price}</div>}
          <div style={{ display: "flex", alignSelf: "flex-start", background: ink, color: bg, borderRadius: 999, padding: "22px 44px", fontSize: 40, fontWeight: 800 }}>
            {T("Pedí en", "Peça em")} {url}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H },
  );
  if (q.get("download")) {
    const buf = await img.arrayBuffer();
    return new Response(buf, { headers: { "content-type": "image/png", "content-disposition": `attachment; filename="${slug}-${story ? "story" : "post"}.png"` } });
  }
  img.headers.set("cache-control", "public, max-age=300");
  return img;
}
