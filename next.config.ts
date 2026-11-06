import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Cabeçalhos de segurança aplicados em todas as páginas
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https:",
  "frame-src 'self'",
  "frame-ancestors 'self'", // ninguém pode embutir o site para enganar o cliente (clickjacking)
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // PGlite (Postgres em WASM, usado só em dev local) precisa rodar fora do bundle
  serverExternalPackages: ["@electric-sql/pglite"],
  // Upload de logo/banner/fotos via Server Actions (limite padrão é 1 MB)
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
