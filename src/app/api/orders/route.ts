import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createOrder, OrderError } from "@/services/orders";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getRegion, tr } from "@/core/region";

export async function POST(req: Request) {
  const limited = await tooMany(req, "orders", 20, 600);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  // idioma da loja (Brasil = português), para as mensagens de erro
  const slug = typeof body?.slug === "string" ? body.slug : "";
  const tenant = slug ? await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { country: true } }) : null;
  const T = tr(getRegion(tenant?.country).locale);
  try {
    const result = await createOrder(body);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    if (e instanceof ZodError) return NextResponse.json({ error: T("Revisá los datos del pedido", "Revise os dados do pedido"), issues: e.issues }, { status: 400 });
    console.error("[orders] erro", e);
    return NextResponse.json({ error: T("Error interno. Intentá de nuevo.", "Erro interno. Tente de novo.") }, { status: 500 });
  }
}
