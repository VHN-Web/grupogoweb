import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export { hashPassword, verifyPassword } from "./password";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

// Autenticação simples por estabelecimento (1 senha de admin por tenant).
// TODO(evolução): usuários múltiplos com papéis (dono, caixa, cozinha) — ver docs/ROADMAP.md

const COOKIE = "mp_session";
const MAX_AGE = 60 * 60 * 24 * 14; // 14 dias

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET ausente");
    return "dev-secret-change-me-please";
  }
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function makeToken(subject: string, maxAgeSec = MAX_AGE): string {
  const payload = `${subject}|${Math.floor(Date.now() / 1000) + maxAgeSec}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const [subject, exp] = payload.split("|");
  if (!subject || Number(exp) < Date.now() / 1000) return null;
  return subject;
}

export async function setSession(subject: string) {
  (await cookies()).set(COOKIE, makeToken(subject), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

async function sessionSubject() {
  return readToken((await cookies()).get(COOKIE)?.value);
}

/** Garante que o usuário logado é admin do tenant `slug`. Retorna o tenant. */
export async function requireTenantAdmin(slug: string) {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) redirect("/painel");
  const subject = await sessionSubject();
  // O admin da plataforma (você) acessa o painel de qualquer cliente — necessário na implantação
  if (subject !== `tenant:${tenant.id}` && subject !== "platform") redirect(`/painel/${slug}/login`);
  return tenant;
}

export async function isPlatformAdmin() {
  return (await sessionSubject()) === "platform";
}

export async function requirePlatformAdmin() {
  if (!(await isPlatformAdmin())) redirect("/admin/login");
}
