// Online/offline pelo botão "Ficar offline" da notificação fixa do app Android (sem abrir o app).
import { NextResponse } from "next/server";
import { getCourier } from "@/lib/courier-auth";
import { setCourierOnline } from "@/services/courier-app";
import { audit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getCourier();
  if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { online?: unknown } | null;
  if (typeof body?.online !== "boolean") return NextResponse.json({ error: "bad request" }, { status: 400 });
  await setCourierOnline(s.courier, body.online);
  await audit(s.tenant.id, `entregador:${s.courier.name}`, body.online ? "courier.online" : "courier.offline", s.courier.name);
  return NextResponse.json({ ok: true, online: body.online });
}
