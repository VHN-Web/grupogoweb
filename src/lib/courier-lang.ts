import "server-only";
// Idioma do app do entregador nesta requisição (telas com ou sem sessão) e troca de idioma.
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getRegion } from "@/core/region";
import { COURIER_LANG_COOKIE, courierT, isCourierLang, resolveCourierLang, type CourierLang } from "@/core/courier-i18n";
import { getCourier } from "@/lib/courier-auth";

/** Logado: escolha salva → loja. Sem sessão (entrar, baixar): cookie → navegador → português. */
export async function requestCourierLang(): Promise<CourierLang> {
  const [c, h, s] = await Promise.all([cookies(), headers(), getCourier().catch(() => null)]);
  const cookie = c.get(COURIER_LANG_COOKIE)?.value;
  if (s) return resolveCourierLang({ saved: s.courier.lang, cookie, store: getRegion(s.tenant.country).locale });
  return resolveCourierLang({ cookie, accept: h.get("accept-language") });
}

export async function requestCourierT() {
  const lang = await requestCourierLang();
  return { lang, T: courierT(lang) };
}

/** Guarda o idioma no aparelho (cookie, 1 ano — lido também pela tela offline) e no cadastro do entregador logado. */
export async function saveCourierLang(lang: string) {
  if (!isCourierLang(lang)) return;
  (await cookies()).set(COURIER_LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production" });
  const s = await getCourier().catch(() => null);
  if (s) await db.update(schema.couriers).set({ lang }).where(eq(schema.couriers.id, s.courier.id));
}
