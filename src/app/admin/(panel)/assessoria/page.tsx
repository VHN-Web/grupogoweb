import Link from "next/link";
import { getPlatformAdmin, requirePlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { DEFAULT_ADVISORY, OBJECTIVE_LABELS, parseObjectives, type BaseCurrency, type Pricing } from "@/core/advisory";
import { MINOR_UNITS, formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { adminPlans, advisoryConfig } from "@/services/advisory";
import { activatePlanAction, planStatusAction, saveAdvisoryConfigAction } from "../advisory-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assessoria GoWeb" };

const fmtDate = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const major = (v: number, c: BaseCurrency) => String(v / 10 ** (MINOR_UNITS[c] ?? 0)).replace(".", ",");
const pctTxt = (v: number) => String(Math.round(v * 1000) / 10).replace(".", ",");
const STATUS: Record<string, string> = { requested: "Pedido", active: "Ativo", paused: "Pausado", ended: "Encerrado" };

function PricingFields({ c, p, owner }: { c: BaseCurrency; p: Pricing | undefined; owner: boolean }) {
  const d = p ?? DEFAULT_ADVISORY.pricing.BRL!;
  const sym = c === "BRL" ? "R$" : "Gs.";
  const field = (name: string, label: string, value: string, hint?: string) => (
    <label className="text-sm">
      {label}
      <input name={`${c}_${name}`} defaultValue={p ? value : ""} placeholder={p ? undefined : hint} inputMode="decimal" disabled={!owner} className="input mt-1" />
    </label>
  );
  return (
    <fieldset className="rounded-xl border border-line p-4" disabled={!owner}>
      <legend className="px-1 text-sm font-semibold">
        <label className="flex items-center gap-2">
          <input type="checkbox" name={`${c}_on`} value="1" defaultChecked={!!p} className="h-4 w-4 accent-[#3CC46B]" />
          {c === "BRL" ? "Brasil (R$)" : "Paraguai (Gs.)"} {!p && <span className="text-xs font-normal text-muted">— sem preço: o complemento não aparece nesse país</span>}
        </label>
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("minimum", `Mínimo da assessoria (${sym}/mês)`, major(d.minimum, c), c === "PYG" ? "defina em Gs." : undefined)}
        {field("rate1", "% sobre o que passa do mínimo", pctTxt(d.rate1))}
        {field("cut", `… até (${sym})`, major(d.cut, c))}
        {field("rate2", "% sobre o que passa disso", pctTxt(d.rate2))}
        {field("sliderMax", `Fim da barrinha (${sym})`, major(d.sliderMax, c))}
        {field("step", `Passo da barrinha (${sym})`, major(d.step, c))}
        {field("adsMinimum", `Verba mínima para sugerir anúncio (${sym})`, major(d.adsMinimum, c))}
        {field("discount6", "Desconto 6 meses (%)", pctTxt(d.discount6))}
        {field("discount12", "Desconto 12 meses (%)", pctTxt(d.discount12))}
      </div>
      <p className="mt-4 text-sm font-semibold">Entregas por faixa (valor da assessoria)</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">A partir de ({sym})</th>
              <th>Posts/semana</th>
              <th>Roteiro de anúncio</th>
              <th>Campanhas</th>
              <th>Sócio</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3].map((i) => {
              const tier = d.tiers[i] ?? d.tiers[d.tiers.length - 1];
              return (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2">{i === 0 ? <span className="text-muted">mínimo</span> : <input name={`${c}_t${i}_from`} defaultValue={p ? major(tier.from, c) : ""} placeholder={p ? undefined : `${[0, 1.5, 4, 10][i]}× o mínimo`} inputMode="decimal" className="input w-28" />}</td>
                  <td className="pr-2"><input name={`${c}_t${i}_posts`} defaultValue={tier.postsPerWeek} inputMode="numeric" className="input w-16" /></td>
                  <td><input type="checkbox" name={`${c}_t${i}_ads`} value="1" defaultChecked={tier.adPlans} className="h-4 w-4" /></td>
                  <td><input type="checkbox" name={`${c}_t${i}_camp`} value="1" defaultChecked={tier.campaigns} className="h-4 w-4" /></td>
                  <td>
                    <select name={`${c}_t${i}_partner`} defaultValue={tier.partner} className="input w-auto">
                      <option value="none">não</option>
                      <option value="monthly">mensal (30 min)</option>
                      <option value="biweekly">quinzenal</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

export default async function AdminAssessoriaPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requirePlatformAdmin();
  const me = await getPlatformAdmin();
  const owner = me?.role === "owner";
  const [cfg, rows] = await Promise.all([advisoryConfig(), adminPlans()]);
  const requested = rows.filter((r) => r.plan.status === "requested");
  const running = rows.filter((r) => r.plan.status !== "requested");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Assessoria GoWeb</h1>
        <p className="text-sm text-muted">Complemento opcional de crescimento, para qualquer plano. Não muda planos, módulos nem faturas: a cobrança segue o fluxo atual e o sócio ativa o plano depois de cobrar.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="card p-5">
        <h2 className="font-semibold">Pedidos para ativar ({requested.length})</h2>
        {requested.length === 0 && <p className="mt-2 text-sm text-muted">Nenhum pedido novo.</p>}
        <ul className="mt-2 divide-y divide-line">
          {requested.map(({ plan, tenant }) => (
            <li key={plan.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <Link href={`/painel/${tenant.slug}/crescer`} className="underline">{tenant.name}</Link> · {fmtDate(plan.requestedAt ?? plan.createdAt)}
                </p>
                <p className="text-muted">
                  {formatMoney(plan.monthlyTotal, tenant.currency as Currency)}/mês · {plan.months} meses · assessoria <b>{formatMoney(plan.fee, tenant.currency as Currency)}</b> · anúncios {formatMoney(plan.ads, tenant.currency as Currency)} · {parseObjectives(JSON.parse(plan.objectives)).map((o) => OBJECTIVE_LABELS[o].pt).join(", ")}
                </p>
                {tenant.whatsapp && <p className="text-xs text-muted">WhatsApp {tenant.whatsapp}</p>}
              </div>
              <form action={activatePlanAction.bind(null, plan.id)}>
                <SubmitButton className="btn-brand px-3 py-1.5 text-xs" pending="Ativando…">Ativar (já cobrado)</SubmitButton>
              </form>
              <form action={planStatusAction.bind(null, plan.id, "cancelled")}>
                <button className="btn-ghost px-3 py-1.5 text-xs font-semibold">Recusar</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Planos ({running.length})</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1">Loja</th>
                <th>Situação</th>
                <th>Assessoria/mês</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Autonomia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {running.map(({ plan, tenant }) => (
                <tr key={plan.id} className="border-t border-line">
                  <td className="py-2"><Link href={`/painel/${tenant.slug}/crescer`} className="underline">{tenant.name}</Link></td>
                  <td>{STATUS[plan.status] ?? plan.status}</td>
                  <td>{formatMoney(plan.fee, tenant.currency as Currency)}</td>
                  <td>{plan.activatedAt ? fmtDate(plan.activatedAt) : "—"}</td>
                  <td>{plan.endsAt ? fmtDate(plan.endsAt) : "—"}</td>
                  <td>{plan.autonomy === "off" ? "não" : plan.autonomy === "all" ? "todos" : "aprovados"}</td>
                  <td className="space-x-1 whitespace-nowrap text-right">
                    {plan.status === "active" && (
                      <form action={planStatusAction.bind(null, plan.id, "paused")} className="inline">
                        <button className="btn-ghost px-2 py-1 text-xs font-semibold">Pausar</button>
                      </form>
                    )}
                    {plan.status === "paused" && (
                      <form action={activatePlanAction.bind(null, plan.id)} className="inline">
                        <button className="btn-ghost px-2 py-1 text-xs font-semibold">Retomar</button>
                      </form>
                    )}
                    {(plan.status === "active" || plan.status === "paused") && (
                      <form action={planStatusAction.bind(null, plan.id, "ended")} className="inline">
                        <button className="btn-ghost px-2 py-1 text-xs font-semibold">Encerrar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Configuração {owner ? "" : <span className="text-xs font-normal text-muted">(só o dono edita)</span>}</h2>
        <p className="text-sm text-muted">Assessoria = mínimo + % sobre a faixa do meio + % sobre o que passa dela. O resto do valor escolhido pelo lojista vira a verba sugerida de anúncios, paga por ele direto à Meta ou ao Google.</p>
        <form action={saveAdvisoryConfigAction} className="mt-4 space-y-4">
          <fieldset disabled={!owner} className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="enabled" value="1" defaultChecked={cfg.enabled} className="h-5 w-5 accent-[#3CC46B]" />
              Mostrar a Assessoria para os lojistas
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="igPublishEnabled" value="1" defaultChecked={cfg.igPublishEnabled} className="mt-0.5 h-5 w-5 accent-[#3CC46B]" />
              <span>
                <b>Publicação automática no Instagram</b>
                <span className="block text-xs text-muted">Ligue só depois que a Meta aprovar a permissão instagram_business_content_publish no app da GoWeb. Antes disso o lojista aprova e posta ele mesmo.</span>
              </span>
            </label>
            <label className="block text-sm">
              Textos com IA por loja por mês
              <input name="aiMonthlyPerStore" defaultValue={cfg.aiMonthlyPerStore} inputMode="numeric" className="input mt-1 w-32" />
            </label>
          </fieldset>
          <PricingFields c="BRL" p={cfg.pricing.BRL} owner={owner} />
          <PricingFields c="PYG" p={cfg.pricing.PYG} owner={owner} />
          {owner && <SubmitButton className="btn-brand px-4 py-2" pending="Salvando…">Salvar configuração</SubmitButton>}
        </form>
      </section>
    </div>
  );
}
