import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";
import { isSandboxEnv, sandboxDbGuard } from "@/core/sandbox";

export type DB = NodePgDatabase<typeof schema>;

/**
 * DATABASE_URL=postgres://...  -> PostgreSQL real (produção)
 * vazio                        -> PGlite (PostgreSQL embutido em ./.pglite) para dev local
 * Ambos falam o mesmo dialeto, então o código não muda.
 */
export function createDb(): DB {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    // prévia (homologação): só abre um banco provadamente diferente do da produção (core/sandbox.ts)
    if (isSandboxEnv(process.env)) {
      const g = sandboxDbGuard(url, process.env.PRODUCTION_DB_FINGERPRINT);
      if (!g.ok) {
        const msg =
          g.reason === "same_as_production"
            ? "Ambiente de teste apontando para o banco da PRODUÇÃO. Configure um DATABASE_URL só para Preview na Vercel."
            : "Ambiente de teste sem PRODUCTION_DB_FINGERPRINT: não dá para provar que o banco não é o da produção. Veja docs/HOMOLOGACAO.md.";
        // nenhuma conexão é aberta; qualquer uso do banco falha com a explicação (o build da prévia ainda compila)
        return new Proxy({} as DB, {
          get() {
            throw new Error(msg);
          },
        });
      }
    }
    return drizzlePg(new Pool({ connectionString: url, max: 10 }), { schema });
  }
  const client = new PGlite("./.pglite");
  return drizzlePglite(client, { schema }) as unknown as DB;
}
