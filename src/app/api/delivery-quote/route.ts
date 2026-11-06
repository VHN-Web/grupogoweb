import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { quoteDeliveryForTenant } from "@/services/orders";

const body = z.object({ slug: z.string(), lat: z.number(), lng: z.number(), subtotalPyg: z.number().int().min(0) });

export async function POST(req: Request) {
  const limited = await tooMany(req, "dq", 60, 600);
  if (limited) return limited;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "BAD_REQUEST" }, { status: 400 });
  const { slug, lat, lng, subtotalPyg } = parsed.data;
  try {
    const q = await quoteDeliveryForTenant(slug, lat, lng, subtotalPyg);
    if (!q.ok && q.reason === "NO_STORE_LOCATION") {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { deliveryBaseFeePyg: true } });
      return NextResponse.json({ ...q, baseFeePyg: t?.deliveryBaseFeePyg ?? 0 });
    }
    return NextResponse.json(q);
  } catch {
    return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
  }
}
