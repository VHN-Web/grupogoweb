"use server";
// Apps de delivery (Open Delivery: 99Food, Keeta). Só Brasil. Credenciais seladas; nunca voltam ao navegador.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit, rateLimit } from "@/lib/security";
import { isValidCnpj } from "@/core/asaas";
import { OD_CATEGORIES, OD_PLATFORM_INFO, isOdPlatform, type OdPlatform } from "@/core/opendelivery";
import { OdError, answerCancellation, connectChannel, notifyMerchantChanged, onboardChannel, pollChannel, removeChannel, setChannelEnabled } from "@/services/opendelivery";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const page = (slug: string) => `/painel/${slug}/apps-delivery`;
const back = (slug: string, kind: "ok" | "err", msg: string): never => redirect(`${page(slug)}?${kind}=${encodeURIComponent(msg)}`);
const msgOf = (e: unknown) => (e instanceof OdError || e instanceof Error ? e.message : "Erro inesperado.");

async function brTenant(slug: string) {
  const t = await requireTenantAdmin(slug, "settings");
  if (t.country !== "BR") redirect(`/painel/${slug}`);
  return t;
}

async function channelOf(tenantId: string, platform: string) {
  if (!isOdPlatform(platform)) return null;
  return db.query.odChannels.findFirst({ where: and(eq(schema.odChannels.tenantId, tenantId), eq(schema.odChannels.platform, platform)) });
}

export async function connectAppAction(slug: string, platform: OdPlatform, f: FormData) {
  const t = await brTenant(slug);
  if (!isOdPlatform(platform)) back(slug, "err", "App desconhecido.");
  if (!(await rateLimit(`od-connect:${t.id}`, 10, 3600))) back(slug, "err", "Muitas tentativas. Tente de novo em 1 hora.");
  const doc = str(f, "document").replace(/\D/g, "");
  if (!isValidCnpj(doc)) back(slug, "err", "CNPJ inválido.");
  const email = str(f, "email").toLowerCase();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(slug, "err", "E-mail inválido.");
  const cats = f.getAll("categories").map(String).filter((c) => (OD_CATEGORIES as readonly string[]).includes(c)).slice(0, 3);
  const prep = Math.min(120, Math.max(5, Number(str(f, "preparationMin")) || 25));
  const cep = str(f, "postalCode").replace(/\D/g, "");
  if (cep.length !== 8) back(slug, "err", "CEP inválido.");
  const uf = str(f, "state", 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) back(slug, "err", "UF inválida (ex.: PE).");
  let ch;
  try {
    ch = await connectChannel(t, platform, {
      clientId: str(f, "clientId", 200),
      clientSecret: str(f, "clientSecret", 400),
      baseUrl: str(f, "baseUrl", 300),
      appId: str(f, "appId", 100),
      autoConfirm: f.get("autoConfirm") === "on",
      info: { document: doc, corporateName: str(f, "corporateName", 120), categories: cats, email, preparationMin: prep },
      address: {
        street: str(f, "street", 120),
        number: str(f, "number", 20) || "S/N",
        district: str(f, "district", 80),
        city: str(f, "city", 80),
        state: uf,
        postalCode: cep,
        complement: str(f, "complement", 80),
      },
    });
  } catch (e) {
    back(slug, "err", msgOf(e));
  }
  await audit(t.id, await actorName(slug), "od.connect", OD_PLATFORM_INFO[platform].name);
  // tenta já enviar o cadastro (URL do cardápio + webhook); se o app não suportar, a loja informa manualmente
  const onboarded = await onboardChannel(ch!).then(() => true).catch(() => false);
  revalidatePath(page(slug));
  back(slug, "ok", onboarded ? `${OD_PLATFORM_INFO[platform].name} conectado e cadastro enviado.` : `${OD_PLATFORM_INFO[platform].name} conectado. Envie ao app os endereços abaixo para concluir.`);
}

export async function onboardAppAction(slug: string, platform: OdPlatform) {
  const t = await brTenant(slug);
  const ch = await channelOf(t.id, platform);
  if (!ch) back(slug, "err", "App não conectado.");
  try {
    await onboardChannel(ch!);
  } catch (e) {
    back(slug, "err", msgOf(e));
  }
  revalidatePath(page(slug));
  back(slug, "ok", "Cadastro enviado ao app.");
}

export async function syncMenuAction(slug: string) {
  const t = await brTenant(slug);
  const n = await notifyMerchantChanged(t.id);
  revalidatePath(page(slug));
  back(slug, "ok", n ? "Avisamos os apps: eles vão buscar o cardápio atualizado." : "Nenhum app ligado.");
}

export async function pollNowAction(slug: string, platform: OdPlatform) {
  const t = await brTenant(slug);
  const ch = await channelOf(t.id, platform);
  if (!ch) back(slug, "err", "App não conectado.");
  const n = await pollChannel(ch!);
  revalidatePath(page(slug));
  back(slug, "ok", n ? `${n} evento(s) recebido(s).` : "Nada novo no app.");
}

export async function toggleAppAction(slug: string, platform: OdPlatform) {
  const t = await brTenant(slug);
  const ch = await channelOf(t.id, platform);
  if (!ch) back(slug, "err", "App não conectado.");
  await setChannelEnabled(t.id, ch!.id, !ch!.enabled);
  await audit(t.id, await actorName(slug), ch!.enabled ? "od.pause" : "od.resume", OD_PLATFORM_INFO[platform].name);
  revalidatePath(page(slug));
  back(slug, "ok", ch!.enabled ? "Recebimento pausado." : "Recebimento ligado.");
}

export async function removeAppAction(slug: string, platform: OdPlatform) {
  const t = await brTenant(slug);
  const ch = await channelOf(t.id, platform);
  if (ch) {
    await removeChannel(t.id, ch.id);
    await audit(t.id, await actorName(slug), "od.remove", OD_PLATFORM_INFO[platform].name);
  }
  revalidatePath(page(slug));
  back(slug, "ok", "App desconectado.");
}

export async function answerCancelAction(slug: string, orderId: string, accept: boolean) {
  const t = await requireTenantAdmin(slug, "orders");
  let err = "";
  try {
    await answerCancellation(t.id, orderId, accept);
  } catch (e) {
    err = msgOf(e);
  }
  revalidatePath(`/painel/${slug}`, "layout");
  redirect(`/painel/${slug}/pedidos/${orderId}${err ? `?err=${encodeURIComponent(err)}` : ""}`);
}
