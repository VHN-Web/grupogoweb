"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizePixKey, type LeadStatus, type PixKeyType } from "@/core/affiliates";
import { isValidE164 } from "@/core/region";
import { hashPassword, verifyPassword } from "@/lib/password";
import { clearLimit, clientIp, isLimited, rateLimit } from "@/lib/security";
import { requireAffiliate, setAffiliateSession } from "@/lib/affiliate-auth";
import { AffiliateError, createLead, signupAffiliate, updateLead } from "@/services/affiliates";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, key: "ok" | "err", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

export async function signupAction(f: FormData) {
  const rec = s(f, "indicacao");
  const back = `/afiliados/cadastro${rec ? `?indicacao=${encodeURIComponent(rec)}` : ""}`;
  if (s(f, "website")) go(back, "err", "…");
  if (!(await rateLimit(`aff-signup:${await clientIp()}`, 5, 3600))) go(back, "err", "Muitas tentativas. Tente de novo em uma hora.");
  if (s(f, "password") !== s(f, "password2")) go(back, "err", "As senhas não conferem.");
  let a;
  try {
    a = await signupAffiliate({
      name: s(f, "name"),
      email: s(f, "email"),
      whatsapp: s(f, "whatsapp"),
      cpf: s(f, "cpf"),
      city: s(f, "city") || null,
      password: String(f.get("password") ?? ""),
      pixKeyType: (s(f, "pixKeyType") || "cpf") as PixKeyType,
      pixKey: s(f, "pixKeyType") === "cpf" && !s(f, "pixKey") ? s(f, "cpf") : s(f, "pixKey"),
      code: s(f, "code") || null,
      recruiterCode: rec || null,
      acceptedTerms: f.get("terms") === "on",
    });
  } catch (e) {
    if (e instanceof AffiliateError) go(back, "err", e.message);
    throw e;
  }
  await setAffiliateSession(a);
  redirect("/afiliados?bemvindo=1");
}

export async function loginAction(f: FormData) {
  const email = s(f, "email").toLowerCase();
  const key = `aff-login:${await clientIp()}`;
  if (await isLimited(key, 6)) go("/afiliados/login", "err", "Muitas tentativas. Aguarde 15 minutos.");
  const a = await db.query.affiliates.findFirst({ where: eq(schema.affiliates.email, email) });
  if (!a || !verifyPassword(String(f.get("password") ?? ""), a.passwordHash)) {
    await rateLimit(key, 6, 15 * 60);
    go("/afiliados/login", "err", "E-mail ou senha incorretos.");
  }
  await clearLimit(key);
  await setAffiliateSession(a!);
  redirect("/afiliados");
}

export async function addLeadAction(f: FormData) {
  const a = await requireAffiliate();
  if (a.status !== "ACTIVE") go("/afiliados", "err", "O seu cadastro ainda não foi liberado.");
  const day = s(f, "day");
  const time = s(f, "time") || "10:00";
  const scheduledAt = /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time) ? new Date(`${day}T${time}:00-03:00`) : null;
  try {
    await createLead(a.id, { businessName: s(f, "businessName"), contactName: s(f, "contactName"), whatsapp: s(f, "whatsapp"), email: s(f, "email") || null, city: s(f, "city") || null, segment: s(f, "segment") || null, note: s(f, "note") || null, scheduledAt }, "manual");
  } catch (e) {
    if (e instanceof AffiliateError) go("/afiliados/indicacoes?nova=1", "err", e.message);
    throw e;
  }
  go("/afiliados/indicacoes", "ok", scheduledAt ? "Indicação cadastrada com a demonstração agendada. +20 XP" : "Indicação cadastrada. +5 XP");
}

export async function updateLeadAction(f: FormData) {
  const a = await requireAffiliate();
  const day = s(f, "day");
  const time = s(f, "time") || "10:00";
  const scheduledAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T${time}:00-03:00`) : undefined;
  try {
    await updateLead(s(f, "id"), { affiliateId: a.id }, { status: (s(f, "status") || undefined) as LeadStatus | undefined, scheduledAt, note: f.has("note") ? s(f, "note") : undefined });
  } catch (e) {
    if (e instanceof AffiliateError) go("/afiliados/indicacoes", "err", e.message);
    throw e;
  }
  go("/afiliados/indicacoes", "ok", "Indicação atualizada.");
}

export async function saveProfileAction(f: FormData) {
  const a = await requireAffiliate();
  const type = s(f, "pixKeyType") as PixKeyType;
  const pix = normalizePixKey(type, s(f, "pixKey"));
  if (!pix) go("/afiliados/perfil", "err", "Chave Pix inválida para o tipo escolhido.");
  const wa = s(f, "whatsapp");
  if (!isValidE164(wa) || !wa.startsWith("+55")) go("/afiliados/perfil", "err", "WhatsApp inválido.");
  await db.update(schema.affiliates).set({ pixKeyType: type, pixKey: pix!, whatsapp: wa, city: s(f, "city") || null }).where(eq(schema.affiliates.id, a.id));
  go("/afiliados/perfil", "ok", "Dados salvos.");
}

export async function changePasswordAction(f: FormData) {
  const a = await requireAffiliate();
  if (!verifyPassword(String(f.get("current") ?? ""), a.passwordHash)) go("/afiliados/perfil", "err", "Senha atual incorreta.");
  const p = String(f.get("password") ?? "");
  if (p.length < 8) go("/afiliados/perfil", "err", "A nova senha precisa ter pelo menos 8 caracteres.");
  const [u] = await db.update(schema.affiliates).set({ passwordHash: hashPassword(p), sessionVersion: a.sessionVersion + 1 }).where(eq(schema.affiliates.id, a.id)).returning();
  await setAffiliateSession(u);
  go("/afiliados/perfil", "ok", "Senha alterada. Os outros aparelhos foram desconectados.");
}
