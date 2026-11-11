import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { quoteDeliveryForTenant } from "@/services/orders";
import { addressReady, EMPTY_ADDRESS } from "@/core/address";
import { geocodeAddress } from "@/adapters/geocoding";

// Taxa de entrega: pela localização compartilhada (lat/lng) OU pelo endereço digitado (o servidor acha a coordenada).
const parts = z.object({
  cep: z.string().max(9).default(""),
  street: z.string().max(120).default(""),
  number: z.string().max(12).default(""),
  noNumber: z.boolean().default(false),
  complement: z.string().max(60).default(""),
  neighborhood: z.string().max(60).default(""),
  city: z.string().max(60).default(""),
  state: z.string().max(40).default(""),
  reference: z.string().max(100).default(""),
});
const body = z.object({ slug: z.string(), lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), address: parts.optional(), subtotalPyg: z.number().int().min(0) });

export async function POST(req: Request) {
  const limited = await tooMany(req, "dq", 60, 600);
  if (limited) return limited;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "BAD_REQUEST" }, { status: 400 });
  const { slug, subtotalPyg } = parsed.data;
  let { lat, lng } = parsed.data;
  let precision: "gps" | "exact" | "street" | "area" = "gps";
  try {
    if (lat == null || lng == null) {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { country: true } });
      const a = { ...EMPTY_ADDRESS, ...parsed.data.address };
      if (!t || !addressReady(a, t.country)) return NextResponse.json({ ok: false, reason: "BAD_REQUEST" }, { status: 400 });
      const g = await geocodeAddress(a, t.country);
      if (!g) return NextResponse.json({ ok: false, reason: "ADDRESS_NOT_FOUND" });
      ({ lat, lng, precision } = g);
    }
    const q = await quoteDeliveryForTenant(slug, lat!, lng!, subtotalPyg);
    if (!q.ok && q.reason === "NO_STORE_LOCATION") {
      const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { deliveryBaseFeePyg: true } });
      return NextResponse.json({ ...q, baseFeePyg: t?.deliveryBaseFeePyg ?? 0, lat, lng, precision });
    }
    return NextResponse.json({ ...q, lat, lng, precision });
  } catch {
    return NextResponse.json({ ok: false, reason: "NOT_FOUND" }, { status: 404 });
  }
}
