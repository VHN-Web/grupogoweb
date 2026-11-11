// Checkout: endereço a partir do CEP (Brasil) — preenche rua, bairro, cidade e UF.
import { NextResponse } from "next/server";
import { tooMany } from "@/lib/security";
import { isValidCep } from "@/core/address";
import { lookupCep } from "@/adapters/geocoding";

export async function GET(req: Request) {
  const limited = await tooMany(req, "cep", 40, 600);
  if (limited) return limited;
  const cep = new URL(req.url).searchParams.get("cep") ?? "";
  if (!isValidCep(cep)) return NextResponse.json({ ok: false, reason: "INVALID" }, { status: 400 });
  const r = await lookupCep(cep);
  if (!r) return NextResponse.json({ ok: false, reason: "NOT_FOUND" });
  return NextResponse.json({ ok: true, ...r.parts }, { headers: { "cache-control": "public, max-age=86400" } });
}
