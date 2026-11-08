"use server";
// Admin → Configurações → Asaas: conectar a conta principal, regras do billing híbrido.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminActor, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { AsaasError, connectPlatform, disconnectPlatform, savePlatformRules } from "@/services/asaas";
import { getSettings } from "@/services/billing";

const back = (msg: string, kind: "ok" | "err" = "ok"): never => redirect(`/admin/config?${kind}=${encodeURIComponent(msg)}#asaas`);

export async function connectAsaasAction(f: FormData) {
  await requirePlatformOwner();
  const env = f.get("env") === "production" ? "production" : "sandbox";
  const key = String(f.get("apiKey") ?? "").replace(/\s+/g, "");
  if (!/^\S{30,400}$/.test(key)) back("Cole a chave de API do Asaas (começa com $aact_).", "err");
  const s = await getSettings();
  let msg = "";
  try {
    const cfg = await connectPlatform(env, key, s.supportEmail || "suporte@goweboficial.com");
    msg = `Asaas conectado (${env === "production" ? "produção" : "sandbox"})${cfg.accountName ? ` — ${cfg.accountName}` : ""}. Webhook configurado.`;
  } catch (e) {
    back(e instanceof AsaasError ? e.message : "Não foi possível conectar ao Asaas.", "err");
  }
  await audit(null, await adminActor(), "asaas.connect", env);
  revalidatePath("/admin/config");
  back(msg);
}

export async function saveAsaasRulesAction(f: FormData) {
  await requirePlatformOwner();
  await savePlatformRules({
    hybridEnabled: f.get("hybridEnabled") === "on",
    defaultSplitPct: Number(String(f.get("defaultSplitPct") ?? "5").replace(",", ".")),
    graceDays: Number(f.get("graceDays") ?? 7),
  });
  await audit(null, await adminActor(), "asaas.rules", f.get("hybridEnabled") === "on" ? "híbrido ligado" : "híbrido desligado");
  revalidatePath("/admin/config");
  back("Regras do Asaas salvas.");
}

export async function disconnectAsaasAction() {
  await requirePlatformOwner();
  await disconnectPlatform();
  await audit(null, await adminActor(), "asaas.disconnect", null);
  back("Asaas desconectado.");
}

/** % do split por cliente (vazio = padrão da plataforma). */
export async function setSplitPctAction(customerId: string, f: FormData) {
  await requirePlatformOwner();
  const { db, schema } = await import("@/db");
  const { eq } = await import("drizzle-orm");
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, customerId) });
  const to = `/admin/clientes/${customerId}`;
  if (!c?.tenantId) redirect(`${to}?err=${encodeURIComponent("Cliente sem sistema")}`);
  const raw = String(f.get("splitPct") ?? "").replace(",", ".").trim();
  const v = raw === "" ? null : Number(raw);
  if (v != null && (!Number.isFinite(v) || v < 0 || v > 50)) redirect(`${to}?err=${encodeURIComponent("Use de 0 a 50%")}`);
  await db.update(schema.tenants).set({ splitPct: v == null ? null : Math.round(v * 100) / 100 }).where(eq(schema.tenants.id, c!.tenantId!));
  await audit(null, await adminActor(), "asaas.split_pct", `${c!.businessName}: ${v ?? "padrão"}`);
  revalidatePath(to);
  redirect(`${to}?ok=${encodeURIComponent("Percentual salvo")}`);
}
