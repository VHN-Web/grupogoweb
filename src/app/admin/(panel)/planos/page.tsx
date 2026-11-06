import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMinor } from "@/core/money";
import { PLATFORM_LABELS } from "@/core/types";
import type { Plan } from "@/db/schema";
import { Flash } from "@/components/Flash";
import { savePlan } from "../actions";

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const plans = await db.query.plans.findMany({ orderBy: asc(schema.plans.sortOrder) });
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
              <p className="text-xs text-muted">Implantação {formatMinor(p.setupPyg, "PYG")} · {formatMinor(p.setupUsdMinor, "USD")} · {formatMinor(p.setupBrlMinor, "BRL")}{p.includesDomain && " · domínio grátis"}</p>
            </summary>
            <PlanForm p={p} />
          </details>
        ))}
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
      <label className="col-span-2 flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Ativo (aparece na contratação)</label>
      <input name="sortOrder" className="input" placeholder="Ordem" defaultValue={p?.sortOrder ?? 0} />
      <button className="btn-primary col-span-3 mt-1">{p ? "Salvar" : "Criar plano"}</button>
    </form>
  );
}
