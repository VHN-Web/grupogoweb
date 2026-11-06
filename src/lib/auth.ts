import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export { hashPassword, verifyPassword } from "./password";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PANEL_AREAS, type PanelArea } from "@/core/types";

// Autenticação do painel: dono (senha do estabelecimento), funcionários (usuário + senha,
// com áreas liberadas pelo dono — GoInteligence) e admin da plataforma.

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

export type PanelAccess = {
  tenant: typeof schema.tenants.$inferSelect;
  role: "owner" | "staff";
  staffId?: string;
  staffName?: string;
  areas: Set<PanelArea>;
};

/** Quem está logado no painel do tenant `slug` (dono, admin da plataforma ou funcionário). */
export async function getPanelAccess(slug: string): Promise<PanelAccess | null> {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) return null;
  const subject = await sessionSubject();
  // O admin da plataforma (você) acessa o painel de qualquer cliente — necessário na implantação
  if (subject === `tenant:${tenant.id}` || subject === "platform") {
    return { tenant, role: "owner", areas: new Set(PANEL_AREAS) };
  }
  if (subject?.startsWith("staff:")) {
    const s = await db.query.staff.findFirst({ where: eq(schema.staff.id, subject.slice(6)) });
    if (s && s.active && s.tenantId === tenant.id && tenant.tier === "pro") {
      let perms: PanelArea[] = [];
      try {
        perms = (JSON.parse(s.permissions) as string[]).filter((p): p is PanelArea => (PANEL_AREAS as readonly string[]).includes(p));
      } catch {}
      perms = perms.filter((p) => p !== "team"); // equipe é sempre exclusiva do dono
      return { tenant, role: "staff", staffId: s.id, staffName: s.name, areas: new Set(perms) };
    }
  }
  return null;
}

/**
 * Garante acesso ao painel do tenant `slug`. Retorna o tenant.
 * `area` = área exigida (funcionários só entram nas áreas liberadas pelo dono).
 */
export async function requireTenantAdmin(slug: string, area?: PanelArea) {
  const acc = await getPanelAccess(slug);
  if (!acc) {
    const exists = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true } });
    redirect(exists ? `/painel/${slug}/login` : "/painel");
  }
  if (area && !acc.areas.has(area)) redirect(`/painel/${slug}/sem-acesso`);
  return acc.tenant;
}

/** Igual a requireTenantAdmin, mas devolve também o tipo de acesso (para menus). */
export async function requirePanelAccess(slug: string, area?: PanelArea) {
  const acc = await getPanelAccess(slug);
  if (!acc) redirect(`/painel/${slug}/login`);
  if (area && !acc.areas.has(area)) redirect(`/painel/${slug}/sem-acesso`);
  return acc;
}

export async function isPlatformAdmin() {
  return (await sessionSubject()) === "platform";
}

export async function requirePlatformAdmin() {
  if (!(await isPlatformAdmin())) redirect("/admin/login");
}
