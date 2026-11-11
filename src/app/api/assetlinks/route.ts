// /.well-known/assetlinks.json (rewrite em next.config.ts) — Digital Asset Links: deixa o Android abrir o link de acesso (/entregador/acesso/...) direto no app do entregador.
// ANDROID_CERT_SHA256 = impressões digitais SHA-256 da chave que assina o APK (separadas por vírgula).
import { assetLinks } from "@/core/courier-native";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(assetLinks(process.env.ANDROID_CERT_SHA256), { headers: { "Cache-Control": "public, max-age=3600" } });
}
