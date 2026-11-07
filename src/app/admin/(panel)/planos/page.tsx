import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMinor } from "@/core/money";
import { PLATFORM_LABELS } from "@/core/types";
import type { Plan } from "@/db/schema";
import { Flash } from "@/components/Flash";
import { saveModulePrices, savePlan } from "../actions";
import { CORE_INFO, MODULES, MODULE_INFO, customPrice, parseModulePrices } from "@/core/modules";
import { minorToInput } from "@/core/money";
import { getSettings } from "@/services/billing";
import type { Amounts } from "@/core/billing";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const plans = await db.query.plans.findMany({ where: eq(schema.plans.isCustom, false), orderBy: asc(schema.plans.sortOrder) });
  const mp = parseModulePrices((await getSettings()).modulePrices);
  const all = customPrice(mp, [...MODULES]);
  return (
    <div className="space-y-5">
      <Flash {...sp} />
      <div>
        <h1 className="text-xl font-bold">Planos</h1>
        <p className="text-sm text-muted">Defina o preço em cada moeda (sem conversão automática — você controla o valor exato em Gs., US$ e R$).</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((p) => (
          <details key={p.id} className="card p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name} {!p.active && <span className="text-xs text-muted">(inativo)</span>}</p>
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold">{PLATFORM_LABELS.interval[p.interval]}</span>
              </div>
              <p className="mt-1 text-sm">{formatMinor(p.pricePyg, "PYG")} · {formatMinor(p.priceUsdMinor, "USD")} · {formatMinor(p.priceBrlMinor, "BRL")}</p>
              <p className="text-xs text-muted">Implantação {formatMinor(p.setupPyg, "PYG")} · {formatMinor(p.setupUsdMinor, "USD")} · {formatMinor(p.setupBrlMinor, "BRL")}{p.includesDomain && " · domínio grátis"}{p.intelligence && " · GoInteligence"}</p>
            </summary>
            <PlanForm p={p} />
          </details>
        ))}
        <details className="card p-4 md:col-span-2">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Personalizado (o cliente monta) {!mp.enabled && <span className="text-xs text-muted">(desligado)</span>}</p>
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold">Mensal</span>
            </div>
            <p className="mt-1 text-sm">A partir de {formatMinor(mp.core.BRL, "BRL")} · {formatMinor(mp.core.PYG, "PYG")} · {formatMinor(mp.core.USD, "USD")} — com todos os módulos: {formatMinor(all.BRL, "BRL")}</p>
            <p className="text-xs text-muted">Implantação {formatMinor(mp.setup.BRL, "BRL")} · {formatMinor(mp.setup.PYG, "PYG")} · {formatMinor(mp.setup.USD, "USD")}</p>
          </summary>
          <form action={saveModulePrices} className="mt-4 space-y-3 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="enabled" defaultChecked={mp.enabled} /> Mostrar o plano personalizado na página de vendas</label>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-1">Item</th><th>R$</th><th>Gs.</th><th>US$</th></tr></thead>
                <tbody className="divide-y divide-line">
                  <PriceRow label="Implantação" hint="taxa única" prefix="setup" v={mp.setup} />
                  <PriceRow label={CORE_INFO.pt} hint={CORE_INFO.descPt} prefix="core" v={mp.core} />
                  {MODULES.map((m) => <PriceRow key={m} label={`${MODULE_INFO[m].pt}${MODULE_INFO[m].pro ? " ✨" : ""}`} hint={MODULE_INFO[m].descPt} prefix={`m_${m}`} v={mp.modules[m]} />)}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">✨ = recurso do GoInteligence. Os valores são mensais. Mudanças valem para novas contratações; quem já contratou mantém o preço.</p>
            <button className="btn-primary">Salvar preços</button>
          </form>
        </details>
        <details className="card p-4" open={plans.length === 0}>
          <summary className="cursor-pointer font-semibold">+ Novo plano</summary>
          <PlanForm />
        </details>
      </div>
    </div>
  );
}

const major = (v: number | undefined, d: 1 | 100) => (v == null ? "" : String(v / d));

function PlanForm({ p }: { p?: Plan }) {
  return (
    <form action={savePlan} className="mt-4 grid grid-cols-3 gap-2 text-sm">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="col-span-2"><label className="label">Nome</label><input name="name" className="input" defaultValue={p?.name} required /></div>
      <div><label className="label">Ciclo</label>
        <select name="interval" className="input" defaultValue={p?.interval ?? "MONTHLY"}><option value="MONTHLY">Mensal</option><option value="YEARLY">Anual</option></select>
      </div>
      <p className="col-span-3 mt-1 text-xs font-semibold text-muted">Mensalidade / anuidade</p>
      <input name="pricePyg" className="input" placeholder="Gs." defaultValue={major(p?.pricePyg, 1)} />
      <input name="priceUsd" className="input" placeholder="US$" defaultValue={major(p?.priceUsdMinor, 100)} />
      <input name="priceBrl" className="input" placeholder="R$" defaultValue={major(p?.priceBrlMinor, 100)} />
      <p className="col-span-3 mt-1 text-xs font-semibold text-muted">Implantação (pagamento único)</p>
      <input name="setupPyg" className="input" placeholder="Gs." defaultValue={major(p?.setupPyg, 1)} />
      <input name="setupUsd" className="input" placeholder="US$" defaultValue={major(p?.setupUsdMinor, 100)} />
      <input name="setupBrl" className="input" placeholder="R$" defaultValue={major(p?.setupBrlMinor, 100)} />
      <div className="col-span-3"><label className="label">Funcionalidades (1 por linha)</label><textarea name="features" className="input min-h-20" defaultValue={p?.features ?? ""} /></div>
      <label className="col-span-3 flex items-center gap-2"><input type="checkbox" name="includesDomain" defaultChecked={p?.includesDomain ?? false} /> Domínio incluso grátis</label>
      <label className="col-span-3 flex items-center gap-2"><input type="checkbox" name="intelligence" defaultChecked={p?.intelligence ?? false} /> Inclui GoInteligence (sugestões, carrinho abandonado, cupons, ofertas, agenda, equipe, relatórios)</label>
      <label className="col-span-2 flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Ativo (aparece na contratação)</label>
      <input name="sortOrder" className="input" placeholder="Ordem" defaultValue={p?.sortOrder ?? 0} />
      <button className="btn-primary col-span-3 mt-1">{p ? "Salvar" : "Criar plano"}</button>
    </form>
  );
}

function PriceRow({ label, hint, prefix, v }: { label: string; hint: string; prefix: string; v: Amounts }) {
  return (
    <tr>
      <td className="py-2 pr-3"><b>{label}</b><br /><span className="text-xs text-muted">{hint}</span></td>
      <td className="pr-2"><input name={`${prefix}_BRL`} defaultValue={minorToInput(v.BRL, "BRL")} className="input w-28" inputMode="decimal" /></td>
      <td className="pr-2"><input name={`${prefix}_PYG`} defaultValue={minorToInput(v.PYG, "PYG")} className="input w-32" inputMode="numeric" /></td>
      <td><input name={`${prefix}_USD`} defaultValue={minorToInput(v.USD, "USD")} className="input w-24" inputMode="decimal" /></td>
    </tr>
  );
}
