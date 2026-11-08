import "server-only";
// Sessão do afiliado: cookie próprio (não mistura com a sessão do painel/admin).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { makeToken, readToken } from "./auth";

const COOKIE = "gw_aff";
const MAX_AGE = 60 * 60 * 24 * 30;
export const REF_COOKIE = "gw_ref"; // código do afiliado que trouxe o visitante (60 dias)

export const affiliateSubject = (a: { id: string; sessionVersion: number }) => `aff:${a.id}@${a.sessionVersion}`;

export async function setAffiliateSession(a: { id: string; sessionVersion: number }) {
  (await cookies()).set(COOKIE, makeToken(affiliateSubject(a), MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearAffiliateSession() {
  (await cookies()).delete(COOKIE);
}

export async function getAffiliate() {
  const sub = readToken((await cookies()).get(COOKIE)?.value);
  if (!sub?.startsWith("aff:")) return null;
  const [id, v] = sub.slice(4).split("@");
  const a = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.id, id), with: { cohort: true } });
  if (!a || a.sessionVersion !== Number(v)) return null;
  return a;
}

export async function requireAffiliate() {
  const a = await getAffiliate();
  if (!a) redirect("/afiliados/login");
  return a;
}

/** Código de afiliado guardado no navegador do visitante (link /a/CODE ou ?ref=CODE). */
export async function refCodeFromCookie() {
  return (await cookies()).get(REF_COOKIE)?.value ?? null;
}

/** Páginas que só abrem depois da live (afiliado ATIVO). */
export async function requireActiveAffiliate() {
  const a = await requireAffiliate();
  if (a.status !== "ACTIVE") redirect("/afiliados");
  return a;
}
