// Checkout: o cliente compartilhou a localização → endereço aproximado para ele só conferir e pôr o número.
import { NextResponse } from "next/server";
import { z } from "zod";
import { tooMany } from "@/lib/security";
import { reverseGeocode } from "@/adapters/geocoding";

const body = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export async function POST(req: Request) {
  const limited = await tooMany(req, "georev", 20, 600);
  if (limited) return limited;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false }, { status: 400 });
  const r = await reverseGeocode(p.data.lat, p.data.lng);
  return NextResponse.json(r ? { ok: true, ...r } : { ok: false });
}
