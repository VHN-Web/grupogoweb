import { NextResponse } from "next/server";
import { z } from "zod";
import { actorName, getPanelAccess } from "@/lib/auth";
import { confirmAction } from "@/services/assistant";

export const dynamic = "force-dynamic";

const body = z.object({ slug: z.string().min(1).max(60), token: z.string().min(10).max(4000) });

export async function POST(req: Request) {
  // só aceita chamadas da própria página (protege contra envio a partir de outro site)
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const acc = await getPanelAccess(parsed.data.slug);
  if (!acc) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json(await confirmAction(acc, await actorName(parsed.data.slug), parsed.data.token));
}
