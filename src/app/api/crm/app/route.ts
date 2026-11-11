// App Android do CRM: dados dos widgets + avisos novos (o app busca a cada 15 min e quando abre).
import { NextResponse } from "next/server";
import { getPlatformAdmin } from "@/lib/auth";
import { appFeed, widgetData } from "@/services/crm-notify";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await getPlatformAdmin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: a.id ?? "platform", name: a.id ? a.name : "Lázaro" };
  const since = new URL(req.url).searchParams.get("since");
  const [widget, feed] = await Promise.all([widgetData(actor), appFeed(actor, since ? new Date(since) : null)]);
  return NextResponse.json({ widget, ...feed, now: new Date().toISOString() });
}
