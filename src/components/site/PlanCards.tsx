import Link from "next/link";
import { BRAND } from "@/components/brand/GoWebLogo";
import { formatMinor, formatPyg } from "@/core/money";
import { planFeature, planName } from "@/core/plans";
import { CORE_INFO, type ModulePrices } from "@/core/modules";
import { tr, type Locale } from "@/core/region";
import type { Plan } from "@/db/schema";
import { H, INK, IVORY, MUTED } from "./tokens";

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0"><path d="M5 12l5 5L20 7" /></svg>
);

/** Cartões de planos (página inicial e /planos). Deixa claro: hoje só a implantação; mensalidade 30 dias após a entrega. */
export function PlanCards({ locale, plans, mp }: { locale: Locale; plans: Plan[]; mp: ModulePrices }) {
  const T = tr(locale);
  const pt = locale === "pt";
  const money = (brl: number, pyg: number) => (pt ? formatMinor(brl, "BRL") : formatPyg(pyg));
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((p) => {
        const hi = p.interval === "YEARLY";
        return (
          <div key={p.id} className={`plan-card flex flex-col gap-5 rounded-3xl border-[1.5px] p-8 ${hi ? "" : "bg-[var(--s-card)] text-[var(--s-ink)]"}`} style={{ ...(hi ? { background: INK, color: IVORY } : {}), borderColor: hi ? BRAND : p.intelligence ? "#1F7FD8" : "var(--s-line)" }}>
            {hi ? (
              <span className="self-start rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: BRAND, color: INK }}>{T("El más elegido", "Mais escolhido")}</span>
            ) : p.intelligence ? (
              <span className="self-start rounded-full bg-[#1F7FD8] px-3 py-1.5 text-xs font-bold text-white">{T("Con inteligencia", "Com inteligência")}</span>
            ) : (
              <span className="h-[28px]" />
            )}
            <h3 style={{ fontFamily: H }} className="text-3xl font-extrabold">{planName(p.name, locale)}</h3>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span style={{ fontFamily: H }} className="text-[40px] font-extrabold tracking-tight">{money(p.priceBrlMinor, p.pricePyg)}</span>
                <span className={hi ? "" : "text-[var(--s-muted)]"} style={hi ? { color: MUTED } : undefined}>/ {hi ? T("año", "ano") : T("mes", "mês")}</span>
              </div>
              {!pt && <p className="text-sm" style={{ color: hi ? MUTED : undefined }}>o {formatMinor(p.priceUsdMinor, "USD")} · {formatMinor(p.priceBrlMinor, "BRL")}</p>}
            </div>
            <PayNote dark={hi} setup={money(p.setupBrlMinor, p.setupPyg)} hasSetup={(pt ? p.setupBrlMinor : p.setupPyg) > 0} T={T} yearly={hi} />
            <ul className="flex flex-col gap-3 text-[15.5px]">
              {(p.features ?? "").split("\n").filter(Boolean).map((f) => planFeature(f, locale)).map((f) => (
                <li key={f} className="flex items-start gap-2.5"><Check />{f}</li>
              ))}
              {p.includesDomain && <li className="flex items-start gap-2.5"><Check />{T("Dominio propio incluido", "Domínio próprio incluso")}</li>}
            </ul>
            <Link href={`/contratar?plano=${p.id}&lang=${locale}`} className="mt-auto rounded-2xl py-4 text-center font-bold transition-transform hover:-translate-y-0.5" style={{ background: hi ? BRAND : "var(--s-ink)", color: hi ? INK : "var(--s-bg)" }}>{T("Quiero este plan", "Quero este plano")}</Link>
          </div>
        );
      })}
      {mp.enabled && (
        <div className="plan-card flex flex-col gap-5 rounded-3xl border-[1.5px] border-dashed bg-[var(--s-card)] p-8 text-[var(--s-ink)]" style={{ borderColor: BRAND }}>
          <span className="self-start rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 text-xs font-bold text-[var(--s-good-fg)]">{T("Pagás solo lo que usás", "Pague só o que usa")}</span>
          <h3 style={{ fontFamily: H }} className="text-3xl font-extrabold">{T("Personalizado", "Personalizado")}</h3>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[15px] text-[var(--s-muted)]">{T("desde", "a partir de")}</span>
            <span style={{ fontFamily: H }} className="text-[40px] font-extrabold tracking-tight">{money(mp.core.BRL, mp.core.PYG)}</span>
            <span className="text-[var(--s-muted)]">/ {T("mes", "mês")}</span>
          </div>
          <PayNote setup={money(mp.setup.BRL, mp.setup.PYG)} hasSetup T={T} />
          <ul className="flex flex-col gap-3 text-[15.5px]">
            {[pt ? CORE_INFO.pt : CORE_INFO.es, T("Sumás solo los módulos que necesitás: mesas, delivery, caja, marketing, agenda…", "Some só os módulos que precisa: mesas, delivery, caixa, marketing, agenda…"), T("Agregás o quitás módulos cuando quieras", "Adicione ou remova módulos quando quiser")].map((f) => (
              <li key={f} className="flex items-start gap-2.5"><Check />{f}</li>
            ))}
          </ul>
          <Link href={`/contratar?plano=personalizado&lang=${locale}`} className="mt-auto rounded-2xl py-4 text-center font-bold transition-transform hover:-translate-y-0.5" style={{ background: BRAND, color: INK }}>{T("Armar mi plan", "Montar meu plano")}</Link>
        </div>
      )}
    </div>
  );
}

function PayNote({ setup, hasSetup, T, dark, yearly }: { setup: string; hasSetup: boolean; T: (es: string, pt: string) => string; dark?: boolean; yearly?: boolean }) {
  return (
    <div className={`rounded-2xl p-3.5 text-sm ${dark ? "bg-white/5" : "bg-[var(--s-soft)]"}`}>
      <p><b>{T("Hoy", "Hoje")}:</b> {hasSetup ? T(`solo la implementación (${setup})`, `só a implantação (${setup})`) : T("nada", "nada")}</p>
      <p className={dark ? "" : "text-[var(--s-muted)]"} style={dark ? { color: MUTED } : undefined}>
        {yearly ? T("La anualidad vence 30 días después de la entrega.", "A anuidade vence 30 dias depois da entrega.") : T("La 1.ª mensualidad vence 30 días después de la entrega.", "A 1ª mensalidade só vence 30 dias depois da entrega.")}
      </p>
    </div>
  );
}
