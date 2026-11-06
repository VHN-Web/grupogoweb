// Build na Vercel: confere o banco, aplica o schema, cria as lojas demo (só se o banco estiver vazio) e compila.
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("postgres")) {
  console.error("\n❌ DATABASE_URL não configurada.");
  console.error("   Na Vercel: Storage > Create Database > Neon (Postgres) e conecte ao projeto. Depois faça Redeploy.\n");
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("npx drizzle-kit push --force");
run("npx tsx src/db/seed.ts --if-empty");
run("npx next build");
