// "Abrir no app": do navegador (já logado pelo link de acesso) para o app Android, levando a sessão.
// Sem o app instalado, o Chrome volta para /entregador/baixar.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COURIER_COOKIE } from "@/lib/courier-auth";
import { courierByToken } from "@/services/courier-app";
import { androidOpenAppUrl } from "@/core/courier-native";
import { appUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get(COURIER_COOKIE)?.value;
  if (!token || !(await courierByToken(token))) return NextResponse.redirect(`${appUrl()}/entregador/entrar`);
  return new Response(null, { status: 302, headers: { Location: androidOpenAppUrl(token, `${appUrl()}/entregador/baixar`), "Cache-Control": "no-store" } });
}
