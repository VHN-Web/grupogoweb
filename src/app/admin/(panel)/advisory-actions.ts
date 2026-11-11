"use server";
// Admin → Assessoria: preços e liga/desliga (só o dono) e ativação dos planos pedidos (sócios).
import { redirect } from "next/navigation";
import { adminActor, requirePlatformAdmin, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { MINOR_UNITS } from "@/core/money";
import type { AdvisoryConfig, BaseCurrency, Pricing, Tier } from "@/core/advisory";
import { AdvisoryError, activatePlan, advisoryConfig, saveAdvisoryConfig, setPlanStatus } from "@/services/advisory";

const PAGE = "/admin/assessoria";
const back = (kind: "ok" | "err", msg: string): never => redirect(`${PAGE}?${kind}=${encodeURIComponent(msg)}`);

/** Valor digitado em reais/guaraníes → unidade menor. */
const minor = (raw: FormDataEntryValue | null, c: BaseCurrency) => {
  const s = String(raw ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return NaN;
  return Math.round(Number(s) * 10 ** (MINOR_UNITS[c] ?? 0));
};
const pct = (raw: FormDataEntryValue | null) => Number(String(raw ?? "").replace(",", ".")) / 100;

export async function saveAdvisoryConfigAction(f: FormData) {
  await requirePlatformOwner();
  const cur = await advisoryConfig();
  const pricing: AdvisoryConfig["pricing"] = {};
  for (const c of ["BRL", "PYG"] as const) {
    if (f.get(`${c}_on`) !== "1") continue;
    const tiers: Tier[] = [0, 1, 2, 3].map((i) => ({
      from: i === 0 ? 0 : minor(f.get(`${c}_t${i}_from`), c),
      postsPerWeek: Number(f.get(`${c}_t${i}_posts`)),
      adPlans: f.get(`${c}_t${i}_ads`) === "1",
      campaigns: f.get(`${c}_t${i}_camp`) === "1",
      partner: (["none", "monthly", "biweekly"].includes(String(f.get(`${c}_t${i}_partner`))) ? String(f.get(`${c}_t${i}_partner`)) : "none") as Tier["partner"],
    }));
    const p: Pricing = {
      minimum: minor(f.get(`${c}_minimum`), c),
      rate1: pct(f.get(`${c}_rate1`)),
      cut: minor(f.get(`${c}_cut`), c),
      rate2: pct(f.get(`${c}_rate2`)),
      sliderMax: minor(f.get(`${c}_sliderMax`), c),
      step: minor(f.get(`${c}_step`), c),
      adsMinimum: minor(f.get(`${c}_adsMinimum`), c),
      discount6: pct(f.get(`${c}_discount6`)),
      discount12: pct(f.get(`${c}_discount12`)),
      tiers,
    };
    if (!(p.minimum > 0)) back("err", `Informe o mínimo da assessoria (${c}).`);
    pricing[c] = p;
  }
  const next: AdvisoryConfig = {
    enabled: f.get("enabled") === "1",
    igPublishEnabled: f.get("igPublishEnabled") === "1",
    aiMonthlyPerStore: Number(f.get("aiMonthlyPerStore")) || cur.aiMonthlyPerStore,
    pricing,
  };
  // moeda desligada vai como null (não volta para o padrão)
  await saveAdvisoryConfig({ ...next, pricing: { BRL: pricing.BRL ?? null, PYG: pricing.PYG ?? null } } as unknown as AdvisoryConfig);
  await audit(null, await adminActor(), "assessoria.config", `${next.enabled ? "ligada" : "desligada"}; publicação ${next.igPublishEnabled ? "ligada" : "desligada"}; moedas ${Object.keys(pricing).join(",") || "nenhuma"}`);
  back("ok", "Configuração da Assessoria salva ✓");
}

export async function activatePlanAction(planId: string) {
  await requirePlatformAdmin();
  try {
    await activatePlan(planId, await adminActor());
  } catch (e) {
    back("err", e instanceof AdvisoryError ? e.message : "Não foi possível ativar.");
  }
  back("ok", "Plano ativado: calendário e tarefas gerados, lojista avisado.");
}

export async function planStatusAction(planId: string, status: "paused" | "ended" | "cancelled") {
  await requirePlatformAdmin();
  try {
    await setPlanStatus(planId, status, await adminActor());
  } catch (e) {
    back("err", e instanceof AdvisoryError ? e.message : "Não foi possível alterar.");
  }
  back("ok", "Plano atualizado.");
}
