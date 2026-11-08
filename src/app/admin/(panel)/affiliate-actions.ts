"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_AFFILIATE_CONFIG, parseAffiliateConfig, type LeadStatus } from "@/core/affiliates";
import { adminActor, requirePlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";
import { AffiliateError, affiliateLink, cancelCommission, fmtDateTime, markCommissionPaid, notifyAffiliate, setCustomerAffiliate, updateLead } from "@/services/affiliates";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (tab: string, ok?: string, err?: string): never =>
  redirect(`/admin/afiliados?aba=${tab}${ok ? `&ok=${encodeURIComponent(ok)}` : ""}${err ? `&err=${encodeURIComponent(err)}` : ""}`);
/** "2026-11-20" + "19:00" (horário de Brasília) → Date */
const brDate = (day: string, time: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T${/^\d{2}:\d{2}$/.test(time) ? time : "19:00"}:00-03:00`) : null);

async function activate(ids: string[]) {
  if (!ids.length) return 0;
  const rows = await db
    .update(schema.affiliates)
    .set({ status: "ACTIVE", activatedAt: new Date() })
    .where(and(inArray(schema.affiliates.id, ids), inArray(schema.affiliates.status, ["PENDING", "SUSPENDED"])))
    .returning();
  for (const a of rows) {
    await notifyAffiliate(a, "GoWeb Afiliados: seu link foi liberado!", `Parabéns, ${a.name.split(" ")[0]}! Você já pode indicar a GoWeb.\n\nSeu link: ${affiliateLink(a.code)}\n\nNo portal você acompanha cliques, indicações, agenda e comissões.`);
  }
  return rows.length;
}

export async function setAffiliateStatus(f: FormData) {
  await requirePlatformAdmin();
  const id = s(f, "id");
  const st = s(f, "status");
  if (st === "ACTIVE") await activate([id]);
  else if (st === "SUSPENDED" || st === "PENDING") await db.update(schema.affiliates).set({ status: st }).where(eq(schema.affiliates.id, id));
  if (f.has("note")) await db.update(schema.affiliates).set({ adminNote: s(f, "note").slice(0, 500) || null }).where(eq(schema.affiliates.id, id));
  if (f.has("cohortId")) await db.update(schema.affiliates).set({ cohortId: s(f, "cohortId") || null }).where(eq(schema.affiliates.id, id));
  await audit(null, await adminActor(), "affiliate.status", `${id} → ${st}`);
  back(s(f, "tab") || "afiliados", "Afiliado atualizado.");
}

// ---------------------------------------------------------------- lives de boas-vindas
export async function saveCohort(f: FormData) {
  await requirePlatformAdmin();
  const startsAt = brDate(s(f, "day"), s(f, "time"));
  if (!startsAt) back("lives", undefined, "Informe a data da live.");
  const values = { title: s(f, "title") || `Live de boas-vindas — ${startsAt!.toLocaleDateString("pt-BR")}`, startsAt: startsAt!, liveUrl: s(f, "liveUrl") || null, notes: s(f, "notes") || null };
  const id = s(f, "id");
  if (id) await db.update(schema.affiliateCohorts).set(values).where(eq(schema.affiliateCohorts.id, id));
  else {
    const [c] = await db.insert(schema.affiliateCohorts).values(values).returning();
    // Quem está na fila sem turma entra nesta
    await db.update(schema.affiliates).set({ cohortId: c.id }).where(and(eq(schema.affiliates.status, "PENDING"), isNull(schema.affiliates.cohortId)));
  }
  back("lives", "Live salva.");
}

export async function deleteCohort(f: FormData) {
  await requirePlatformAdmin();
  await db.delete(schema.affiliateCohorts).where(eq(schema.affiliateCohorts.id, s(f, "id")));
  back("lives", "Live removida (os inscritos voltam para a fila).");
}

/** Envia o link da live por WhatsApp/e-mail para todos os inscritos da turma que ainda aguardam. */
export async function notifyCohort(f: FormData) {
  await requirePlatformAdmin();
  const c = await db.query.affiliateCohorts.findFirst({ where: eq(schema.affiliateCohorts.id, s(f, "id")) });
  if (!c) back("lives");
  if (!c!.liveUrl) back("lives", undefined, "Cadastre o link da live antes de avisar.");
  const list = await db.query.affiliates.findMany({ where: and(eq(schema.affiliates.cohortId, c!.id), eq(schema.affiliates.status, "PENDING")) });
  for (const a of list) await notifyAffiliate(a, "GoWeb Afiliados: link da live de boas-vindas", `Olá ${a.name.split(" ")[0]}! A sua live de boas-vindas é em ${fmtDateTime(c!.startsAt)}.\n\nLink: ${c!.liveUrl}\n\nDepois da live o seu link de afiliado é liberado.`);
  back("lives", `Aviso enviado para ${list.length} ${list.length === 1 ? "pessoa" : "pessoas"}.`);
}

/** Depois da live: libera quem participou (marcados). */
export async function activateCohort(f: FormData) {
  await requirePlatformAdmin();
  const ids = f.getAll("ids").map(String);
  const n = await activate(ids);
  await audit(null, await adminActor(), "affiliate.activate_cohort", `${n} liberados`);
  back("lives", `${n} ${n === 1 ? "afiliado liberado" : "afiliados liberados"}.`);
}

// ---------------------------------------------------------------- agenda
export async function adminUpdateLead(f: FormData) {
  await requirePlatformAdmin();
  try {
    const d = brDate(s(f, "day"), s(f, "time"));
    await updateLead(s(f, "id"), { admin: true }, { status: (s(f, "status") || undefined) as LeadStatus | undefined, scheduledAt: d ?? undefined, adminNote: s(f, "adminNote") });
  } catch (e) {
    if (e instanceof AffiliateError) back("agenda", undefined, e.message);
    throw e;
  }
  back("agenda", "Indicação atualizada.");
}

// ---------------------------------------------------------------- comissões
export async function payAffiliate(f: FormData) {
  const me = await requirePlatformAdmin();
  const ids = f.getAll("ids").map(String);
  let n = 0;
  for (const id of ids) if (await markCommissionPaid(id, me.name, s(f, "ref"))) n++;
  await audit(null, await adminActor(), "affiliate.pay", `${n} comissões (${s(f, "ref") || "sem ref."})`);
  revalidatePath("/admin/afiliados");
  back("pagar", `${n} ${n === 1 ? "comissão marcada como paga" : "comissões marcadas como pagas"}.`);
}

export async function cancelCommissionAction(f: FormData) {
  await requirePlatformAdmin();
  await cancelCommission(s(f, "id"), s(f, "reason"));
  await audit(null, await adminActor(), "affiliate.cancel_commission", s(f, "id"));
  back("pagar", "Comissão cancelada.");
}

// ---------------------------------------------------------------- materiais
export async function saveMaterial(f: FormData) {
  await requirePlatformAdmin();
  const kind = s(f, "kind") as "video" | "live" | "arquivo" | "texto" | "link";
  if (!["video", "live", "arquivo", "texto", "link"].includes(kind) || !s(f, "title")) back("materiais", undefined, "Preencha o tipo e o título.");
  const url = s(f, "url");
  if (url && !/^https?:\/\//.test(url)) back("materiais", undefined, "O link precisa começar com https://");
  await db.insert(schema.affiliateMaterials).values({
    kind,
    title: s(f, "title").slice(0, 120),
    description: s(f, "description").slice(0, 400) || null,
    url: url || null,
    body: s(f, "body").slice(0, 3000) || null,
    liveAt: brDate(s(f, "day"), s(f, "time")),
    pinned: f.get("pinned") === "on",
  });
  back("materiais", "Material publicado.");
}

export async function deleteMaterial(f: FormData) {
  await requirePlatformAdmin();
  await db.delete(schema.affiliateMaterials).where(eq(schema.affiliateMaterials.id, s(f, "id")));
  back("materiais", "Material removido.");
}

// ---------------------------------------------------------------- regras
export async function saveAffiliateConfig(f: FormData) {
  await requirePlatformAdmin();
  const pct = (k: string) => Math.round(Number(s(f, k).replace(",", ".")) * 100);
  const cfg = parseAffiliateConfig(
    JSON.stringify({
      tiers: DEFAULT_AFFILIATE_CONFIG.tiers.map((_, i) => ({ minSales: Number(s(f, `min${i}`)), pctBp: pct(`pct${i}`) })),
      referrerPctBp: pct("referrer"),
      annualPctBp: pct("annual"),
      cookieDays: Number(s(f, "cookieDays")),
    }),
  );
  await db.insert(schema.platformSettings).values({ id: "default", affiliateConfig: JSON.stringify(cfg) }).onConflictDoUpdate({ target: schema.platformSettings.id, set: { affiliateConfig: JSON.stringify(cfg), updatedAt: new Date() } });
  await audit(null, await adminActor(), "affiliate.config", JSON.stringify(cfg).slice(0, 280));
  back("regras", "Regras salvas. Valem para as próximas comissões.");
}

// ---------------------------------------------------------------- cliente → afiliado
export async function setCustomerAffiliateAction(customerId: string, f: FormData) {
  await requirePlatformAdmin();
  try {
    await setCustomerAffiliate(customerId, s(f, "code") || null);
  } catch (e) {
    if (e instanceof AffiliateError) redirect(`/admin/clientes/${customerId}?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  await audit(null, await adminActor(), "affiliate.set_customer", `${customerId} → ${s(f, "code") || "nenhum"}`);
  redirect(`/admin/clientes/${customerId}?ok=${encodeURIComponent("Afiliado do cliente atualizado.")}`);
}
