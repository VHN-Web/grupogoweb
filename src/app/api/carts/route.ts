import { hasModule } from "@/core/modules";
import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isValidE164, sanitizeName } from "@/core/region";
import { isPro, saveCart } from "@/services/intelligence";

const Body = z.object({
  slug: z.string(),
  cartId: z.string().max(60).optional().nullable(),
  name: z.string().max(60).optional().nullable(),
  phone: z.string().max(20).refine(isValidE164),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1).max(99) })).min(1).max(60),
});

/** Guarda o carrinho de quem já informou o WhatsApp (para recuperação de carrinho abandonado). */
export async function POST(req: Request) {
  const limited = await tooMany(req, "carts", 30, 600);
  if (limited) return limited;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, p.data.slug) });
  if (!t || !isPro(t) || !hasModule(t, "marketing")) return NextResponse.json({ ok: false });
  const id = await saveCart(t, { cartId: p.data.cartId, name: p.data.name ? sanitizeName(p.data.name) : null, phone: p.data.phone, items: p.data.items });
  return NextResponse.json({ ok: !!id, cartId: id });
}

/** Restaura um carrinho pelo link enviado ao cliente (?carrinho=ID). */
export async function GET(req: Request) {
  const limited = await tooMany(req, "carts-get", 60, 600);
  if (limited) return limited;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true } });
  if (!t || !id) return NextResponse.json({ ok: false }, { status: 404 });
  const c = await db.query.carts.findFirst({ where: and(eq(schema.carts.id, id), eq(schema.carts.tenantId, t.id)) });
  if (!c || c.status === "RECOVERED") return NextResponse.json({ ok: false }, { status: 404 });
  const items = JSON.parse(c.items) as { productId: string; quantity: number }[];
  return NextResponse.json({ ok: true, cartId: c.id, name: c.customerName, items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) });
}
