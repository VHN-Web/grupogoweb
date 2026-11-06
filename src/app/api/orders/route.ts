import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createOrder, OrderError } from "@/services/orders";

export async function POST(req: Request) {
  const limited = await tooMany(req, "orders", 20, 600);
  if (limited) return limited;
  try {
    const result = await createOrder(await req.json());
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    if (e instanceof ZodError) return NextResponse.json({ error: "Revisá los datos del pedido · Revise os dados do pedido", issues: e.issues }, { status: 400 });
    console.error("[orders] erro", e);
    return NextResponse.json({ error: "Error interno. Intentá de nuevo." }, { status: 500 });
  }
}
