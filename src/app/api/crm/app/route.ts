// App Android do CRM e a ilha do CRM web: dados dos widgets + avisos novos + o que está "ao vivo" agora
// (o app busca a cada 15 min e quando abre; a ilha do navegador a cada ~25 s com a tela aberta).
import { NextResponse } from "next/server";
import { getPlatformAdmin } from "@/lib/auth";
import { appFeed, widgetData } from "@/services/crm-notify";
import { appExtras, fireDue } from "@/services/crm-planner";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await getPlatformAdmin();
  if (!a) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: a.id ?? "platform", name: a.id ? a.name : "Lázaro" };
  const since = new URL(req.url).searchParams.get("since");
  // lembretes e avisos da agenda que chegaram na hora (garantia extra além do disparador por minuto)
  await fireDue().catch(() => null);
  const [widget, feed, extras] = await Promise.all([widgetData(actor), appFeed(actor, since ? new Date(since) : null), appExtras(actor).catch(() => null)]);
  return NextResponse.json({ widget: { ...widget, ...(extras ? { agenda: extras.agenda, reminders: extras.reminders, note: extras.note, funnel: extras.funnel } : {}) }, live: extras?.live ?? null, ...feed, now: new Date().toISOString() });
}
