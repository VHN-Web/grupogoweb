// Build na Vercel: confere o banco, aplica o schema, cria as lojas demo (só se o banco estiver vazio) e compila.
// Prévias (VERCEL_ENV=preview, homologação): só mexem no banco se ele for PROVADAMENTE outro que não o da produção —
// PRODUCTION_DB_FINGERPRINT configurada e diferente. Produção: comportamento de sempre.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("postgres")) {
  console.error("\n❌ DATABASE_URL não configurada.");
  console.error("   Na Vercel: Storage > Create Database > Neon (Postgres) e conecte ao projeto. Depois faça Redeploy.\n");
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

// mesma regra de src/core/sandbox.ts#dbFingerprint (testada em sandbox.test.ts): host sem "-pooler" + porta + banco
function dbFingerprint(u) {
  try {
    const x = new URL(u);
    const id = `${x.hostname.toLowerCase().replace("-pooler.", ".")}:${x.port || "5432"}/${x.pathname.replace(/^\//, "").toLowerCase() || "postgres"}`;
    return createHash("sha256").update(id).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

const env = process.env.VERCEL_ENV ?? "";
const sandbox = process.env.APP_MODE !== "production" && (process.env.APP_MODE === "sandbox" || env === "preview");
const fp = dbFingerprint(url);
console.log(`\nℹ️  Ambiente: ${env || "local"} · impressão digital do banco: ${fp} (não expõe senha; use-a em PRODUCTION_DB_FINGERPRINT)\n`);

if (sandbox) {
  const prod = (process.env.PRODUCTION_DB_FINGERPRINT ?? "").trim().toLowerCase();
  if (prod && prod === fp) {
    console.error("\n❌ Esta prévia está apontando para o banco da PRODUÇÃO. Build interrompido sem tocar no banco.");
    console.error("   Na Vercel: Settings > Environment Variables > DATABASE_URL só em Preview, com o banco de teste.\n");
    process.exit(1);
  }
  if (!prod) {
    console.warn("\n⚠️  PRODUCTION_DB_FINGERPRINT não configurada: a prévia NÃO altera o banco (sem schema e sem seed)");
    console.warn("   e o app da prévia não abre o banco até a variável existir. Veja docs/HOMOLOGACAO.md.\n");
  } else {
    run("npx drizzle-kit push --force"); // banco de teste: pode ser recriado
    run("npx tsx src/db/seed.ts --if-empty");
  }
} else {
  run("npx drizzle-kit push --force");
  run("npx tsx src/db/seed.ts --if-empty");
}
run("npx next build");
