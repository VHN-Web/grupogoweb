import "server-only";
// Sessão do entregador: o cookie guarda o token do link de acesso enviado pela loja.
// Gerar um novo link no painel (Motoboys) desconecta o aparelho antigo.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { courierByToken } from "@/services/courier-app";

export const COURIER_COOKIE = "gw_cour";
const MAX_AGE = 60 * 60 * 24 * 365;

export async function setCourierSession(token: string) {
  (await cookies()).set(COURIER_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

export async function clearCourierSession() {
  (await cookies()).delete(COURIER_COOKIE);
}

export const getCourier = cache(async () => courierByToken((await cookies()).get(COURIER_COOKIE)?.value));

export async function requireCourier() {
  const s = await getCourier();
  if (!s) redirect("/entregador/entrar");
  return s;
}
