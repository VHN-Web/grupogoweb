"use server";
// Admin → Configurações → Apps de delivery: credenciais padrão da GoWeb por app (Open Delivery).
// Usadas quando a loja conecta sem informar as próprias (ex.: Keeta dá um Client ID por sistema).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminActor, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { isOdPlatform, OD_PLATFORM_INFO } from "@/core/opendelivery";
import { OdError, saveOdDefaults } from "@/services/opendelivery";

const back = (msg: string, kind: "ok" | "err" = "ok"): never => redirect(`/admin/config?${kind}=${encodeURIComponent(msg)}#apps-delivery`);
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim().slice(0, 400);

export async function saveOdDefaultsAction(platform: string, f: FormData) {
  await requirePlatformOwner();
  if (!isOdPlatform(platform)) back("App desconhecido.", "err");
  try {
    await saveOdDefaults(platform as Parameters<typeof saveOdDefaults>[0], { clientId: str(f, "clientId"), clientSecret: str(f, "clientSecret"), baseUrl: str(f, "baseUrl"), appId: str(f, "appId") });
  } catch (e) {
    back(e instanceof OdError ? e.message : "Não foi possível salvar.", "err");
  }
  await audit(null, await adminActor(), "od.defaults", OD_PLATFORM_INFO[platform as keyof typeof OD_PLATFORM_INFO].name);
  revalidatePath("/admin/config");
  back(`Credenciais da ${OD_PLATFORM_INFO[platform as keyof typeof OD_PLATFORM_INFO].name} salvas.`);
}
