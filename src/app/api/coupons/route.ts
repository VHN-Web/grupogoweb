import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { couponError, findCoupon, validateCoupon } from "@/services/intelligence";
import { getRegion } from "@/core/region";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";

const Body = z.object({ slug: z.string(), code: z.string().max(30), subtotalPyg: z.number().int().min(0) });

/** Confere um cupom e devolve o desconto (o pedido recalcula tudo no servidor de novo). */
export async function POST(req: Request) {
  const limited = await tooMany(req, "coupons", 20, 600);
  if (limited) return limited;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, error: "—" }, { status: 400 });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, p.data.slug) });
  if (!t) return NextResponse.json({ ok: false }, { status: 404 });
  const r = await validateCoupon(t, p.data.code, p.data.subtotalPyg);
  if (r.ok) return NextResponse.json({ ok: true, code: r.code, discountPyg: r.discount });
  const c = await findCoupon(t.id, p.data.code);
  return NextResponse.json({
    ok: false,
    error: couponError(r.reason, getRegion(t.country).locale, c ? formatMoney(c.minSubtotal, t.currency as Currency) : undefined),
  });
}
