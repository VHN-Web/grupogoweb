"use client";
// Assessoria GoWeb: diagnóstico + objetivos + barrinhas + prévia. Tudo recalcula na hora no navegador
// (mesmas regras puras de core/advisory.ts); ao contratar, o servidor recalcula tudo de novo.
import { useMemo, useState } from "react";
import {
  ACTION_LABELS,
  ASSUMPTIONS,
  DURATIONS,
  FRONTS,
  FRONT_LABELS,
  OBJECTIVES,
  OBJECTIVE_LABELS,
  PRO_ACTIONS,
  buildPlan,
  diagnose,
  estimate,
  goalsFor,
  snapTotal,
  splitInvestment,
  type Objective,
  type Pricing,
  type SelfReport,
  type StoreMetrics,
} from "@/core/advisory";
import { MINOR_UNITS, formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { DOW, GAP_TEXT, PARTNER_TEXT } from "./texts";

type Props = {
  locale: "es" | "pt";
  currency: Currency;
  pricing: Pricing;
  metrics: StoreMetrics;
  isPro: boolean;
  demo: boolean;
  action: (f: FormData) => void | Promise<void>;
  initial?: { objectives: Objective[]; total: number; months: number; report: SelfReport } | null;
};

const EMPTY: SelfReport = { hasInstagram: false, followers: null, postsPerWeek: null, hasGoogleProfile: false, googleRating: null, googleReviews: null, profitPerOrderPct: null };

export function AdvisorySimulator({ locale, currency, pricing, metrics, isPro, demo, action, initial }: Props) {
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  const L = (o: { es: string; pt: string }) => o[locale];
  const fm = (v: number) => formatMoney(v, currency);
  const unit = 10 ** (MINOR_UNITS[currency] ?? 0);

  const [report, setReport] = useState<SelfReport>(initial?.report ?? EMPTY);
  const [objectives, setObjectives] = useState<Objective[]>(initial?.objectives ?? ["revenue"]);
  const [total, setTotal] = useState(initial?.total ?? pricing.minimum * 3);
  const [months, setMonths] = useState<number>(initial?.months ?? 3);
  const [busy, setBusy] = useState(false);

  const d = useMemo(() => diagnose(metrics, report), [metrics, report]);
  const split = useMemo(() => splitInvestment(snapTotal(total, pricing), months, pricing), [total, months, pricing]);
  const objs: Objective[] = objectives.length ? objectives : ["revenue"];
  const goals = useMemo(() => goalsFor(d, objs, split, report), [d, objs, split, report]);
  const est = useMemo(() => estimate(d, objs, split), [d, objs, split]);
  const plan = useMemo(() => buildPlan({ objectives: objs, months, split, diagnosis: d }), [objs, months, split, d]);

  const toggle = (o: Objective) => setObjectives((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : cur.length >= 3 ? cur : [...cur, o]));
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v.replace(",", "."))) || 0);
  const scoreColor = (n: number) => (n >= 70 ? "#2FAE5F" : n >= 40 ? "#E0A100" : "#D64545");
  const slotText = (s: { dow: number; hour: number }) => `${DOW[locale][s.dow]} ${String(s.hour).padStart(2, "0")}h`;
  const feeShare = Math.round((split.feeBase / split.total) * 100);

  return (
    <form
      action={async (f) => {
        setBusy(true);
        try {
          await action(f);
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-5"
    >
      {/* diagnóstico */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[6px]" style={{ borderColor: scoreColor(d.score) }} aria-label={T(`Nota ${d.score} de 100`, `Nota ${d.score} de 100`)}>
            <span className="text-2xl font-bold">{d.score}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{T("Diagnóstico de tu tienda", "Diagnóstico da sua loja")}</h2>
            <p className="text-sm text-muted">
              {T("Últimos 90 días", "Últimos 90 dias")}: {metrics.orders} {T("pedidos", "pedidos")} · {T("ticket promedio", "ticket médio")} {fm(d.ticket)} · {fm(d.monthlyRevenue)}/{T("mes", "mês")}
            </p>
            {!d.enoughData && <p className="mt-1 text-xs text-muted">{T("Con menos de 30 pedidos mostramos metas, pero no estimaciones en dinero.", "Com menos de 30 pedidos mostramos metas, mas não estimativas em dinheiro.")}</p>}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {FRONTS.map((f) => (
            <div key={f} className="rounded-xl bg-black/[.03] p-3 dark:bg-white/5">
              <p className="text-xs font-semibold text-muted">{L(FRONT_LABELS[f])}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${d.fronts[f]}%`, background: scoreColor(d.fronts[f]) }} />
              </div>
              <p className="mt-1 text-sm font-bold">{d.fronts[f]}</p>
            </div>
          ))}
        </div>
        {d.gaps.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {d.gaps.map((g) => (
              <li key={g} className="flex gap-2">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#E0A100]" />
                {GAP_TEXT[g] ? L(GAP_TEXT[g]) : g}
              </li>
            ))}
          </ul>
        )}
        {(d.peakSlots.length > 0 || d.weakSlots.length > 0) && (
          <p className="mt-3 text-xs text-muted">
            {d.peakSlots.length > 0 && <>{T("Más movimiento", "Mais movimento")}: {d.peakSlots.map(slotText).join(", ")}. </>}
            {d.weakSlots.length > 0 && <>{T("Horarios flojos", "Horários fracos")}: {d.weakSlots.map(slotText).join(", ")}.</>}
          </p>
        )}
      </section>

      {/* presença digital (o que o sistema não sabe sozinho) */}
      <section className="card p-5">
        <h2 className="font-semibold">{T("Tu presencia digital", "Sua presença digital")}</h2>
        <p className="text-sm text-muted">{T("Respondé lo que sepas: mejora el diagnóstico.", "Responda o que souber: melhora o diagnóstico.")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="hasInstagram" value="1" checked={report.hasInstagram} onChange={(e) => setReport({ ...report, hasInstagram: e.target.checked })} className="h-5 w-5 accent-[#3CC46B]" />
            {T("Tengo Instagram de la tienda", "Tenho Instagram da loja")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="hasGoogleProfile" value="1" checked={report.hasGoogleProfile} onChange={(e) => setReport({ ...report, hasGoogleProfile: e.target.checked })} className="h-5 w-5 accent-[#3CC46B]" />
            {T("Tengo perfil en Google / Maps", "Tenho perfil no Google / Maps")}
          </label>
          <label className="text-sm">
            {T("Seguidores en Instagram", "Seguidores no Instagram")}
            <input name="followers" inputMode="numeric" className="input mt-1" value={report.followers ?? ""} onChange={(e) => setReport({ ...report, followers: num(e.target.value) })} />
          </label>
          <label className="text-sm">
            {T("Posteos por semana hoy", "Posts por semana hoje")}
            <input name="postsPerWeek" inputMode="numeric" className="input mt-1" value={report.postsPerWeek ?? ""} onChange={(e) => setReport({ ...report, postsPerWeek: num(e.target.value) })} />
          </label>
          <label className="text-sm">
            {T("Nota en Google (ej. 4,6)", "Nota no Google (ex. 4,6)")}
            <input name="googleRating" inputMode="decimal" className="input mt-1" value={report.googleRating ?? ""} onChange={(e) => setReport({ ...report, googleRating: num(e.target.value) })} />
          </label>
          <label className="text-sm">
            {T("Cantidad de reseñas en Google", "Quantidade de avaliações no Google")}
            <input name="googleReviews" inputMode="numeric" className="input mt-1" value={report.googleReviews ?? ""} onChange={(e) => setReport({ ...report, googleReviews: num(e.target.value) })} />
          </label>
          <label className="text-sm sm:col-span-2">
            {T("Ganancia promedio por pedido (% del valor, opcional)", "Lucro médio por pedido (% do valor, opcional)")}
            <input name="profitPct" inputMode="numeric" className="input mt-1 max-w-[10rem]" value={report.profitPerOrderPct != null ? Math.round(report.profitPerOrderPct * 100) : ""} onChange={(e) => {
              const v = num(e.target.value);
              setReport({ ...report, profitPerOrderPct: v != null && v > 0 && v <= 100 ? v / 100 : null });
            }} />
            <span className="mt-1 block text-xs text-muted">{T("Sirve para avisarte cuando un anuncio cuesta más de lo que deja.", "Serve para avisar quando um anúncio custa mais do que deixa.")}</span>
          </label>
        </div>
      </section>

      {/* objetivos */}
      <section className="card p-5">
        <h2 className="font-semibold">{T("¿Qué querés lograr?", "O que você quer alcançar?")}</h2>
        <p className="text-sm text-muted">{T("Elegí hasta 3.", "Escolha até 3.")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OBJECTIVES.map((o) => {
            const on = objectives.includes(o);
            return (
              <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on} className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${on ? "border-[#2FAE5F] bg-[#2FAE5F] text-white" : "border-line hover:border-[#2FAE5F]"}`}>
                {L(OBJECTIVE_LABELS[o])}
              </button>
            );
          })}
        </div>
        {objectives.map((o) => (
          <input key={o} type="hidden" name="objectives" value={o} />
        ))}
      </section>

      {/* barrinhas */}
      <section className="card p-5">
        <h2 className="font-semibold">{T("¿Cuánto querés invertir?", "Quanto você quer investir?")}</h2>
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">{T("Por mes, en total", "Por mês, no total")}</span>
            <span className="text-2xl font-bold">{fm(split.total)}</span>
          </div>
          <input type="range" min={pricing.minimum} max={Math.max(pricing.sliderMax, split.total)} step={pricing.step} value={split.total} onChange={(e) => setTotal(Number(e.target.value))} className="mt-2 w-full accent-[#2FAE5F]" aria-label={T("Inversión por mes", "Investimento por mês")} />
          <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {T("¿Más? Escribí el valor:", "Mais? Digite o valor:")}
            <input
              inputMode="decimal"
              className="input w-40"
              placeholder={String(Math.round(pricing.sliderMax / unit))}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(/\./g, "").replace(",", "."));
                if (Number.isFinite(v) && v > 0) setTotal(Math.round(v * unit));
              }}
            />
          </label>
          <input type="hidden" name="total" value={split.total} />
        </div>
        <div className="mt-5">
          <span className="text-sm text-muted">{T("¿Por cuánto tiempo?", "Por quanto tempo?")}</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DURATIONS.map((m) => (
              <button key={m} type="button" onClick={() => setMonths(m)} aria-pressed={months === m} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${months === m ? "border-[#2FAE5F] bg-[#2FAE5F]/10" : "border-line"}`}>
                {m} {T("meses", "meses")}
                {m === 6 && pricing.discount6 > 0 && <span className="block text-xs font-normal text-muted">−{Math.round(pricing.discount6 * 100)}% {T("en la asesoría", "na assessoria")}</span>}
                {m === 12 && pricing.discount12 > 0 && <span className="block text-xs font-normal text-muted">−{Math.round(pricing.discount12 * 100)}% {T("en la asesoría", "na assessoria")}</span>}
              </button>
            ))}
          </div>
          <input type="hidden" name="months" value={months} />
        </div>
      </section>

      {/* prévia */}
      <section className="card p-5">
        <h2 className="text-lg font-bold">{T("Vista previa de tu plan", "Prévia do seu plano")}</h2>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full" aria-hidden>
          <div style={{ width: `${feeShare}%`, background: "#1F7FD8" }} />
          <div style={{ width: `${100 - feeShare}%`, background: "#2FAE5F" }} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <p className="text-xs font-semibold" style={{ color: "#1F7FD8" }}>{T("Asesoría GoWeb (pagás a GoWeb)", "Assessoria GoWeb (você paga à GoWeb)")}</p>
            <p className="text-xl font-bold">{fm(split.fee)}<span className="text-sm font-normal text-muted">/{T("mes", "mês")}</span></p>
            {split.discount > 0 && <p className="text-xs text-muted">{T("Incluye descuento de", "Inclui desconto de")} {fm(split.discount)}/{T("mes", "mês")}</p>}
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="text-xs font-semibold" style={{ color: "#2FAE5F" }}>{T("Anuncios sugeridos (pagás directo a Meta/Google)", "Anúncios sugeridos (você paga direto à Meta/Google)")}</p>
            <p className="text-xl font-bold">{fm(split.ads)}<span className="text-sm font-normal text-muted">/{T("mes", "mês")}</span></p>
            {split.adsTooSmall && <p className="text-xs text-muted">{T(`Por debajo de ${fm(pricing.adsMinimum)} no recomendamos anuncios: el plan usa solo acciones orgánicas.`, `Abaixo de ${fm(pricing.adsMinimum)} não recomendamos anúncio: o plano usa só ações orgânicas.`)}</p>}
          </div>
        </div>

        <h3 className="mt-5 text-sm font-semibold">{T("Qué incluye", "O que inclui")}</h3>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          <li>✓ {T("Diagnóstico y plan mes a mes", "Diagnóstico e plano mês a mês")}</li>
          <li>✓ {split.tier.postsPerWeek} {T("posteos por semana, con texto listo", "posts por semana, com legenda pronta")}</li>
          <li>✓ {T("Checklist de Google y Maps", "Checklist do Google e do Maps")}</li>
          {split.tier.adPlans && !split.adsTooSmall && <li>✓ {T("Guía semanal de anuncio con link medido", "Roteiro semanal de anúncio com link medido")}</li>}
          {split.tier.campaigns && <li>✓ {T("Campañas de vuelta y cumpleaños", "Campanhas de volta e aniversário")}</li>}
          <li>✓ {L(PARTNER_TEXT[split.tier.partner])}</li>
          <li>✓ {T("Avisos por WhatsApp y Google Calendar", "Avisos no WhatsApp e no Google Agenda")}</li>
        </ul>

        <h3 className="mt-5 text-sm font-semibold">{T("Metas", "Metas")}</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {goals.ticket && <li>{T("Ticket promedio", "Ticket médio")}: {fm(goals.ticket.from)} → <b>{fm(goals.ticket.to)}</b></li>}
          {goals.repeatRate && <li>{T("Clientes que vuelven", "Clientes que voltam")}: {Math.round(goals.repeatRate.from * 100)}% → <b>{Math.round(goals.repeatRate.to * 100)}%</b></li>}
          {goals.newPerMonth && <li>{T("Clientes nuevos por mes", "Clientes novos por mês")}: {goals.newPerMonth.from} → <b>{goals.newPerMonth.to}</b></li>}
          {goals.reviews && <li>{T("Reseñas en Google", "Avaliações no Google")}: {goals.reviews.from} → <b>{goals.reviews.to}</b></li>}
          <li>{T("Posteos por semana", "Posts por semana")}: <b>{goals.postsPerWeek}</b></li>
        </ul>

        <div className="mt-5 rounded-xl bg-[#2FAE5F]/10 p-4">
          <p className="text-sm font-semibold">{T("Resultado posible por mes", "Resultado possível por mês")}</p>
          {est ? (
            <>
              <p className="mt-1 text-2xl font-bold">+{fm(est.monthlyLow)} {T("a", "a")} +{fm(est.monthlyHigh)}</p>
              {est.adsOrdersHigh > 0 && <p className="text-sm">{T("Pedidos por anuncios", "Pedidos vindos de anúncios")}: {est.adsOrdersLow} {T("a", "a")} {est.adsOrdersHigh}</p>}
            </>
          ) : (
            <p className="mt-1 text-sm">{T("Necesitamos al menos 30 pedidos en 90 días para estimar en dinero.", "Precisamos de pelo menos 30 pedidos em 90 dias para estimar em dinheiro.")}</p>
          )}
          <p className="mt-2 text-xs text-muted">
            {T("Estimación, no es garantía. Supuestos:", "Estimativa, não é garantia. Premissas:")} {T("ticket", "ticket")} +{ASSUMPTIONS.ticketUp[0] * 100}% {T("a", "a")} +{ASSUMPTIONS.ticketUp[1] * 100}%; {T("vuelta", "recompra")} +{ASSUMPTIONS.repeatUpPts[0] * 100} {T("a", "a")} +{ASSUMPTIONS.repeatUpPts[1] * 100} {T("puntos", "pontos")}; {T("horario flojo", "horário fraco")} +{ASSUMPTIONS.weakUp[0] * 100}% {T("a", "a")} +{ASSUMPTIONS.weakUp[1] * 100}%; {T("costo por pedido del anuncio", "custo por pedido do anúncio")} {ASSUMPTIONS.costPerOrderOfTicket[1] * 100}% {T("a", "a")} {ASSUMPTIONS.costPerOrderOfTicket[0] * 100}% {T("del ticket", "do ticket")}. {T("Calculado con los números de tu tienda.", "Calculado com os números da sua loja.")}
          </p>
        </div>

        <h3 className="mt-5 text-sm font-semibold">{T("Mes a mes", "Mês a mês")}</h3>
        <ol className="mt-2 space-y-2">
          {plan.map((m) => (
            <li key={m.month} className="rounded-xl border border-line p-3 text-sm">
              <p className="font-semibold">{T("Mes", "Mês")} {m.month}</p>
              <p className="mt-1 text-muted">
                {m.actions.map((a, i) => (
                  <span key={a}>
                    {i > 0 && " · "}
                    {L(ACTION_LABELS[a])}
                    {!isPro && PRO_ACTIONS.has(a) && <span className="text-xs font-semibold"> ({T("con GoInteligence", "com GoInteligence")})</span>}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button disabled={busy || demo} className="btn-brand px-5 py-3 font-semibold disabled:opacity-60">
            {busy ? T("Enviando…", "Enviando…") : T("Quiero contratar", "Quero contratar")}
          </button>
          <p className="text-xs text-muted">{demo ? T("Tienda de demostración: solo simulación.", "Loja de demonstração: só simulação.") : T("Un socio de GoWeb te contacta para confirmar. No se cobra nada ahora.", "Um sócio da GoWeb fala com você para confirmar. Nada é cobrado agora.")}</p>
        </div>
      </section>
    </form>
  );
}
