import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres em WASM, usado só em dev local) precisa rodar fora do bundle
  serverExternalPackages: ["@electric-sql/pglite"],
  // Upload de logo/banner/fotos via Server Actions (limite padrão é 1 MB)
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
