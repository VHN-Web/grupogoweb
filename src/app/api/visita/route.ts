// Registro de acesso (site oficial / página de afiliados / links de afiliados) — chamado por components/analytics/VisitBeacon.
import { getPlatformAdmin } from "@/lib/auth";
import { getAffiliate } from "@/lib/affiliate-auth";
import { clientIp } from "@/lib/security";
import { visitArea } from "@/core/visits";
import { recordVisit } from "@/services/visits";
import { appUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // só o domínio da GoWeb: lojas com domínio próprio/subdomínio também têm "/" e não são o site oficial
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  let main = "";
  try {
    main = new URL(appUrl()).hostname.replace(/^www\./, "");
  } catch {}
  if (host !== main && host !== "goweboficial.com" && !host.endsWith(".vercel.app") && host !== "localhost") return new Response(null, { status: 204 });
  const path = str(body?.path, 300);
  const area = path ? visitArea(path) : null;
  if (!path || !area) return new Response(null, { status: 204 });
  // a equipe e os afiliados logados não entram na conta
  if (await getPlatformAdmin().catch(() => null)) return new Response(null, { status: 204 });
  if (area === "afiliados" && (await getAffiliate().catch(() => null))) return new Response(null, { status: 204 });
  await recordVisit({
    path,
    referrer: str(body?.ref, 500),
    origem: str(body?.origem, 40),
    utm: str(body?.utm, 40),
    ua: req.headers.get("user-agent"),
    ip: await clientIp(req).catch(() => "x"),
    country: req.headers.get("x-vercel-ip-country"),
  }).catch((e) => console.error("[visita]", e));
  return new Response(null, { status: 204 });
}
