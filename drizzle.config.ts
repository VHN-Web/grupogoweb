import { defineConfig } from "drizzle-kit";
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "";
const isPg = url.startsWith("postgres");

// Local (sem DATABASE_URL postgres): PGlite = PostgreSQL embutido em ./.pglite (sem Docker).
// Produção: DATABASE_URL=postgres://... (Neon, Supabase, RDS...)
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(isPg ? { dbCredentials: { url } } : { driver: "pglite", dbCredentials: { url: "./.pglite" } }),
});
