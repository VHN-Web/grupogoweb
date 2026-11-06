import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPanelAccess } from "@/lib/auth";

// Impressão automática: o painel "reserva" os pedidos novos ainda não impressos.
// A reserva é atômica, então o pedido sai uma única vez, mesmo com o painel aberto em vários aparelhos.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { slug?: string } | null;
  if (!b?.slug) return NextResponse.json({ ids: [] }, { status: 400 });
  const acc = await getPanelAccess(b.slug);
  if (!acc || !acc.areas.has("orders") || !acc.tenant.autoPrint) return NextResponse.json({ ids: [] }, { status: 403 });
  const since = new Date(Date.now() - 30 * 60 * 1000); // não imprime histórico antigo
  const rows = await db
    .update(schema.orders)
    .set({ printedAt: new Date() })
    .where(
      and(
        eq(schema.orders.tenantId, acc.tenant.id),
        isNull(schema.orders.printedAt),
        gte(schema.orders.createdAt, since),
        inArray(schema.orders.status, ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"]),
      ),
    )
    .returning({ id: schema.orders.id, createdAt: schema.orders.createdAt });
  rows.sort((a, b) => +a.createdAt - +b.createdAt);
  return NextResponse.json({ ids: rows.map((r) => r.id) });
}
