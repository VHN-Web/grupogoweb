import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// Status público do pedido (para a tela do cliente fazer polling). O id é um UUID não adivinhável.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await db.query.orders.findFirst({
    where: eq(schema.orders.id, id),
    columns: { status: true, paymentStatus: true, updatedAt: true },
  });
  if (!o) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(o, { headers: { "cache-control": "no-store" } });
}
