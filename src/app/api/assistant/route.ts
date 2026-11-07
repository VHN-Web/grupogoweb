import { NextResponse } from "next/server";
import { z } from "zod";
import { actorName, getPanelAccess } from "@/lib/auth";
import { isLimited, rateLimit } from "@/lib/security";
import { runAssistant } from "@/services/assistant";

export const dynamic = "force-dynamic";

const body = z.object({
  slug: z.string().min(1).max(60),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).min(1).max(20),
});

export async function POST(req: Request) {
  // só aceita chamadas da própria página (protege contra envio a partir de outro site)
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const acc = await getPanelAccess(parsed.data.slug);
  if (!acc) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // limite por loja: 60 mensagens por hora (custo da IA e abuso)
  const key = `assistant:${acc.tenant.id}`;
  if (await isLimited(key, 60)) return NextResponse.json({ error: "limit" }, { status: 429 });
  await rateLimit(key, 60, 3600);
  const who = await actorName(parsed.data.slug);
  return NextResponse.json(await runAssistant(acc, who, parsed.data.messages));
}
