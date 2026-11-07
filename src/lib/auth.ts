import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
export { hashPassword, verifyPassword } from "./password";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PANEL_AREAS, type PanelArea } from "@/core/types";
import { areaAllowed, hasModule, parseModules } from "@/core/modules";

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

/** Admin da plataforma: sessão curta (12 h). Dono/equipe: 14 dias. */
export const ADMIN_MAX_AGE = 60 * 60 * 12;

export async function setSession(subject: string, maxAge = subject.startsWith("platform") ? ADMIN_MAX_AGE : MAX_AGE) {
  (await cookies()).set(COOKIE, makeToken(subject, maxAge), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

/** Sujeito da sessão com versão: trocar a senha incrementa a versão e derruba os outros aparelhos. */
export const ownerSubject = (t: { id: string; sessionVersion: number }) => `tenant:${t.id}@${t.sessionVersion}`;
export const staffSubject = (s: { id: string; sessionVersion: number }) => `staff:${s.id}@${s.sessionVersion}`;
/** Admin cadastrado (a senha-mestra do .env continua usando o sujeito "platform"). */
export const adminSubject = (a: { id: string; sessionVersion: number }) => `platform:${a.id}@${a.sessionVersion}`;

function splitVer(rest: string): [string, number] {
  const [id, v] = rest.split("@");
  return [id, Number(v ?? NaN)];
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
  isPlatform?: boolean;
};

/** Nome de quem está agindo, para o registro de atividades. */
export async function actorName(slug: string): Promise<string> {
  const acc = await getPanelAccess(slug);
  if (!acc) return "desconhecido";
  if (acc.isPlatform) return `admin GoWeb${acc.staffName ? `: ${acc.staffName}` : ""}`;
  return acc.role === "owner" ? "dono" : `equipe: ${acc.staffName}`;
}

/** Quem está logado no painel do tenant `slug` (dono, admin da plataforma ou funcionário). */
export async function getPanelAccess(slug: string): Promise<PanelAccess | null> {
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
  if (!tenant) return null;
  const subject = await sessionSubject();
  // Plano personalizado: só as áreas dos módulos contratados (plano fechado = todas)
  const mods = parseModules(tenant.modules);
  const ALL = new Set(PANEL_AREAS.filter((a) => areaAllowed(mods, a)));
  // O admin da plataforma (você) acessa o painel de qualquer cliente — necessário na implantação
  const admin = await platformAdminFrom(subject);
  if (admin) return { tenant, role: "owner", areas: ALL, isPlatform: true, staffName: admin.id ? admin.name : undefined };
  if (subject?.startsWith("tenant:")) {
    const [id, v] = splitVer(subject.slice(7));
    if (id === tenant.id && v === tenant.sessionVersion) return { tenant, role: "owner", areas: ALL };
  }
  if (subject?.startsWith("staff:")) {
    const [sid, v] = splitVer(subject.slice(6));
    const s = await db.query.staff.findFirst({ where: eq(schema.staff.id, sid) });
    if (s && s.active && s.sessionVersion === v && s.tenantId === tenant.id && tenant.tier === "pro" && hasModule(tenant, "equipe")) {
      let perms: PanelArea[] = [];
      try {
        perms = (JSON.parse(s.permissions) as string[]).filter((p): p is PanelArea => (PANEL_AREAS as readonly string[]).includes(p));
      } catch {}
      perms = perms.filter((p) => p !== "team" && ALL.has(p)); // equipe é sempre exclusiva do dono
      return { tenant, role: "staff", staffId: s.id, staffName: s.name, areas: new Set(perms) };
    }
  }
  return null;
}

/** Área fora do plano personalizado → página do plano (com o módulo); senão, sem permissão (funcionário). */
function blockedPath(slug: string, t: { modules: string | null }, area: PanelArea) {
  return areaAllowed(parseModules(t.modules), area) ? `/painel/${slug}/sem-acesso` : `/painel/${slug}/plano?modulo=${area}`;
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
  if (area && !acc.areas.has(area)) redirect(blockedPath(slug, acc.tenant, area));
  return acc.tenant;
}

/** Igual a requireTenantAdmin, mas devolve também o tipo de acesso (para menus). */
export async function requirePanelAccess(slug: string, area?: PanelArea) {
  const acc = await getPanelAccess(slug);
  if (!acc) redirect(`/painel/${slug}/login`);
  if (area && !acc.areas.has(area)) redirect(blockedPath(slug, acc.tenant, area));
  return acc;
}

export type PlatformAdminSession = { id: string | null; name: string; email: string | null; role: "owner" | "admin" };

async function platformAdminFrom(subject: string | null): Promise<PlatformAdminSession | null> {
  if (!subject) return null;
  // senha-mestra do .env (dono da plataforma)
  if (subject === "platform") return { id: null, name: "Administrador principal", email: null, role: "owner" };
  if (!subject.startsWith("platform:")) return null;
  const [id, v] = splitVer(subject.slice(9));
  const a = await db.query.platformAdmins.findFirst({ where: eq(schema.platformAdmins.id, id) });
  if (!a || !a.active || a.sessionVersion !== v) return null;
  return { id: a.id, name: a.name, email: a.email, role: a.role };
}

/** Quem está logado no admin da plataforma (null = ninguém). */
export async function getPlatformAdmin() {
  return platformAdminFrom(await sessionSubject());
}

export async function isPlatformAdmin() {
  return !!(await getPlatformAdmin());
}

export async function requirePlatformAdmin() {
  const a = await getPlatformAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

/** Só o dono da plataforma (senha-mestra ou admin com papel "owner") cadastra outros admins. */
export async function requirePlatformOwner() {
  const a = await requirePlatformAdmin();
  if (a.role !== "owner") redirect("/admin?err=" + encodeURIComponent("Só o administrador principal pode fazer isso."));
  return a;
}

/** Nome para o registro de atividades do admin. */
export async function adminActor() {
  const a = await getPlatformAdmin();
  return a?.id ? `admin: ${a.name}` : "admin";
}
