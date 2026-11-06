import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

/**
 * DATABASE_URL=postgres://...  -> PostgreSQL real (produção)
 * vazio                        -> PGlite (PostgreSQL embutido em ./.pglite) para dev local
 * Ambos falam o mesmo dialeto, então o código não muda.
 */
export function createDb(): DB {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    return drizzlePg(new Pool({ connectionString: url, max: 10 }), { schema });
  }
  const client = new PGlite("./.pglite");
  return drizzlePglite(client, { schema }) as unknown as DB;
}
