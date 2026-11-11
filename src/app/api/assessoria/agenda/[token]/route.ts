// Assessoria GoWeb: agenda do plano em .ics (o lojista assina no Google Agenda/iPhone uma vez e atualiza sozinha).
// O token longo e aleatório é o segredo do link; nada de dado de cliente vai no feed.
import { calendarFeed } from "@/services/advisory";
import { tooMany } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = await tooMany(req, "advisory-ics", 60, 600);
  if (limited) return limited;
  const { token } = await params;
  const ics = await calendarFeed(token.replace(/\.ics$/, ""));
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900", "content-disposition": 'inline; filename="assessoria.ics"' } });
}
