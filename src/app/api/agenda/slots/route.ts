import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { slotsFor } from "@/services/intelligence";

export async function GET(req: Request) {
  const limited = await tooMany(req, "slots", 120, 600);
  if (limited) return limited;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const productId = url.searchParams.get("productId") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ slots: [] }, { status: 400 });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!t) return NextResponse.json({ slots: [] }, { status: 404 });
  const slots = await slotsFor(t, productId, date);
  return NextResponse.json({ slots: slots.map((s) => ({ label: s.label, startsAt: s.startsAt.toISOString() })) });
}
