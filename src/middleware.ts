import { NextResponse, type NextRequest } from "next/server";

// Roteamento por domínio (white-label):
//   - Host principal (APP_URL / domínio da plataforma): segue normal (/slug, /painel, /admin...)
//   - Subdomínio slug.dominio-da-plataforma ou domínio próprio do cliente:
//     "/" vira "/{slug}", "/pedido/x" vira "/{slug}/pedido/x", etc.
// Pré-requisito de infraestrutura (🧑): apontar o DNS e adicionar o domínio no provedor
// de hospedagem (ex.: Vercel > Domains, ou via API da Vercel para automatizar).

const PASS = /^\/(_next|api|pay|fatura|contrato|recibo|contratar|painel|admin|uploads|icon\.svg|favicon\.ico|robots\.txt|sitemap\.xml|vitrine)(\/|$)/;
const cache = new Map<string, { slug: string | null; at: number }>();
const TTL = 60_000;

function mainHosts() {
  const hosts = new Set(["localhost", "127.0.0.1", "goweboficial.com", "www.goweboficial.com"]);
  try {
    const h = new URL(process.env.APP_URL ?? "http://localhost").hostname;
    hosts.add(h);
    hosts.add(`www.${h}`);
  } catch {}
  return hosts;
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const { pathname } = req.nextUrl;
  // ?lang=pt|es escolhido na página vale também para o <html lang> e o título (layout raiz)
  const lang = req.nextUrl.searchParams.get("lang");
  if (lang === "pt" || lang === "es") {
    const h = new Headers(req.headers);
    h.set("x-gw-lang", lang);
    if (!host || mainHosts().has(host) || host.endsWith(".vercel.app") || PASS.test(pathname)) return NextResponse.next({ request: { headers: h } });
  }
  if (!host || mainHosts().has(host) || host.endsWith(".vercel.app") || PASS.test(pathname)) return NextResponse.next();

  let entry = cache.get(host);
  if (!entry || Date.now() - entry.at > TTL) {
    try {
      const r = await fetch(new URL(`/api/domains/resolve?host=${encodeURIComponent(host)}`, req.nextUrl.origin));
      const j = (await r.json()) as { slug?: string };
      entry = { slug: j.slug ?? null, at: Date.now() };
    } catch {
      entry = { slug: null, at: Date.now() };
    }
    cache.set(host, entry);
  }
  if (!entry.slug) return NextResponse.next();
  if (pathname === `/${entry.slug}` || pathname.startsWith(`/${entry.slug}/`)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/${entry.slug}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
