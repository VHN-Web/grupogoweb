// Endpoints do Open Delivery hospedados pela GoWeb (uma URL própria por loja e app):
//  GET  …/v1/merchant  → cardápio no padrão (exige X-API-KEY da loja)
//  POST …/v1/newEvent  → webhook de eventos de pedido (assinado: X-App-Signature = HMAC-SHA256 do corpo com o client secret)
import { NextResponse, after } from "next/server";
import { odVerify } from "@/core/opendelivery";
import { channelByHook, checkApiKey, handleEvents, merchantFor } from "@/services/opendelivery";
import { openSecret } from "@/lib/secrets";
import { tooMany } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string; path: string[] }> };
const err = (status: number, title: string) => NextResponse.json({ status, title }, { status });

export async function GET(req: Request, { params }: Ctx) {
  const { token, path } = await params;
  if (path.at(-1) !== "merchant") return err(404, "Not found");
  const limited = await tooMany(req, `od-merchant:${token}`, 120, 3600);
  if (limited) return limited;
  const ch = await channelByHook(token);
  if (!ch) return err(404, "Merchant not found");
  if (!checkApiKey(ch, req.headers.get("x-api-key"))) return err(403, "Invalid X-API-KEY");
  if (!ch.enabled) return err(404, "Merchant not available");
  try {
    return NextResponse.json(await merchantFor(ch));
  } catch (e) {
    console.error("[od merchant]", e);
    return err(503, "Service unavailable");
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { token, path } = await params;
  if (path.at(-1) !== "newEvent") return err(404, "Not found");
  const ch = await channelByHook(token);
  if (!ch) return err(404, "Merchant not found");
  const raw = await req.text();
  if (!odVerify(raw, req.headers.get("x-app-signature"), openSecret(ch.clientSecretSealed))) return err(401, "Invalid signature");
  const mid = req.headers.get("x-app-merchantid");
  if (mid && mid !== ch.merchantId && mid !== ch.orderingAppMerchantId) return err(400, "Unknown merchant");
  if (ch.appId && req.headers.get("x-app-id") && req.headers.get("x-app-id") !== ch.appId) return err(401, "Unknown app");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return err(400, "Invalid JSON");
  }
  const events = (Array.isArray(body) ? body : [body]) as Parameters<typeof handleEvents>[1];
  if (!ch.enabled) return new Response(null, { status: 200 });
  // responde na hora (o app tem prazo curto) e processa em seguida
  after(() => handleEvents(ch, events).catch((e) => console.error("[od webhook]", e)));
  return new Response(null, { status: 200 });
}
