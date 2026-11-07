"use server";
// Server Actions de "Clientes e divulgação" e "Crescimento".
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";
import { GROWTH_FEATURES, SEGMENTS, parseGrowth, type GrowthFeature, type Segment } from "@/core/growth";
import { getRegion, tr } from "@/core/region";
import { createCampaign, sendCampaign } from "@/services/growth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const num = (f: FormData, k: string) => Number(str(f, k).replace(",", "."));
const base = (slug: string) => `/painel/${slug}`;
function back(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

/** Salva as chaves liga/desliga e os ajustes de Crescimento. Recursos GoInteligence só ligam no plano pro. */
export async function saveGrowth(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "customers");
  const T = tr(getRegion(t.country).locale);
  const pro = t.tier === "pro";
  const on = (k: GrowthFeature) => bool(f, `${k}_on`) && (!GROWTH_FEATURES[k].pro || pro);
  const prev = parseGrowth(t.growthConfig);
  const googleUrl = str(f, "googleUrl");
  if (on("reviews") && !/^https:\/\//.test(googleUrl)) back(`${base(slug)}/crescimento`, "err", T("Pegá el enlace de reseñas de Google (empieza con https://).", "Cole o link de avaliação do Google (começa com https://)."));
  if (on("directory") && !str(f, "city")) back(`${base(slug)}/crescimento`, "err", T("Informá la ciudad para aparecer en la Vitrina.", "Informe a cidade para aparecer na Vitrine."));
  const next = parseGrowth(
    JSON.stringify({
      reviews: { enabled: on("reviews"), googleUrl },
      directory: { enabled: on("directory"), city: str(f, "city"), category: str(f, "category") },
      campaigns: { enabled: on("campaigns") },
      referral: { enabled: on("referral"), friendPct: num(f, "friendPct"), referrerPct: num(f, "referrerPct") },
      loyalty: { enabled: on("loyalty"), mode: str(f, "loyaltyMode"), stamps: num(f, "stamps"), rewardPct: num(f, "rewardPct"), cashbackPct: num(f, "cashbackPct") },
      birthday: { enabled: on("birthday"), pct: num(f, "birthdayPct") },
    }),
  );
  await db.update(schema.tenants).set({ growthConfig: JSON.stringify(next) }).where(eq(schema.tenants.id, t.id));
  const changed = (Object.keys(GROWTH_FEATURES) as GrowthFeature[]).filter((k) => prev[k].enabled !== next[k].enabled).map((k) => `${k}:${next[k].enabled ? "on" : "off"}`);
  await audit(t.id, await actorName(slug), "growth.save", changed.join(" ") || "ajustes");
  revalidatePath(`/${slug}`);
  back(`${base(slug)}/crescimento`, "ok", T("Guardado ✓", "Salvo ✓"));
}

export async function newCampaign(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "customers");
  const T = tr(getRegion(t.country).locale);
  const path = `${base(slug)}/clientes`;
  if (t.tier !== "pro") redirect(`${base(slug)}/plano`);
  if (!parseGrowth(t.growthConfig).campaigns.enabled) back(path, "err", T("Activá las campañas en Crecimiento.", "Ative as campanhas em Crescimento."));
  const segment = str(f, "segment") as Segment;
  const message = str(f, "message").slice(0, 700);
  if (!(SEGMENTS as readonly string[]).includes(segment) || message.length < 10) back(path, "err", T("Elegí el público y escribí el mensaje.", "Escolha o público e escreva a mensagem."));
  const pct = Math.round(num(f, "couponPct"));
  const days = Math.round(num(f, "couponDays"));
  const c = await createCampaign(t, {
    name: str(f, "name").slice(0, 80) || T("Campaña", "Campanha"),
    segment,
    message,
    couponPct: pct >= 1 && pct <= 80 ? pct : null,
    couponDays: days >= 1 && days <= 90 ? days : 15,
  });
  const n = (JSON.parse(c.recipients) as unknown[]).length;
  await audit(t.id, await actorName(slug), "campaign.create", `${c.name} · ${segment} · ${n}`);
  if (n === 0) back(path, "err", T("Nadie en ese público aceptó recibir ofertas todavía.", "Ninguém nesse público autorizou receber ofertas ainda."));
  redirect(`${path}/campanha/${c.id}`);
}

export async function autoSendCampaign(slug: string, id: string) {
  const t = await requireTenantAdmin(slug, "customers");
  if (t.tier !== "pro") redirect(`${base(slug)}/plano`);
  const T = tr(getRegion(t.country).locale);
  const path = `${base(slug)}/clientes/campanha/${id}`;
  const c = await db.query.campaigns.findFirst({ where: and(eq(schema.campaigns.id, id), eq(schema.campaigns.tenantId, t.id)) });
  if (!c) back(`${base(slug)}/clientes`, "err", T("Campaña no encontrada.", "Campanha não encontrada."));
  const r = await sendCampaign(t, c);
  await audit(t.id, await actorName(slug), "campaign.send", `${c.name} · ${r.sent}`);
  back(path, "ok", T(`${r.sent} mensajes enviados.`, `${r.sent} mensagens enviadas.`));
}
