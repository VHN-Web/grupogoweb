import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { COMPANY_TYPES } from "@/core/asaas";
import { parsePaymentConfig } from "@/core/tenant-config";
import { asaasConfig, cycleSummary, subaccountOverview, tenantAsaasInfo } from "@/services/asaas";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { billingMethodAction, checkoutMethodsAction, createSubaccountAction, payoutAction, transferNowAction } from "../asaas-actions";

export const dynamic = "force-dynamic";

const CYCLE_LABEL: Record<string, string> = {
  ACCUMULATING: "Em andamento",
  PAID_BY_SPLIT: "Quitada pelas vendas",
  AWAITING_RESIDUAL: "Saldo a pagar",
  PAID_RESIDUAL: "Saldo pago",
  OVERDUE_SUSPENDED: "Vencida (suspenso)",
};

export default async function ReceivablesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "settings");
  if (t.country !== "BR") redirect(`/painel/${slug}`);
  const { fm, fmtDate } = panelI18n(t);
  const cfg = await asaasConfig();
  const customer = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, t.id), with: { plan: true } });
  const has = !!t.asaasWalletId;
  const [ov, cyc] = await Promise.all([has ? subaccountOverview(t).catch(() => null) : null, customer ? cycleSummary(customer.id) : null]);
  const info = tenantAsaasInfo(t);
  const pay = parsePaymentConfig(t.paymentConfig);
  const pixOn = pay.options.some((o) => o.provider === "asaas" && o.method === "PIX" && o.enabled);
  const cardOn = pay.options.some((o) => o.provider === "asaas" && o.method === "CARD" && o.enabled);
  const pct = t.splitPct ?? cfg.defaultSplitPct;
  const hybrid = cfg.hybridEnabled && customer?.plan.interval === "MONTHLY";
  const cur = cyc?.current;
  const progress = cur ? Math.min(100, Math.round((cur.amortizedMinor / Math.max(1, cur.targetMinor)) * 100)) : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Recebimentos online</h1>
        <p className="text-sm text-muted">Pix e cartão no seu site, com o dinheiro caindo na sua conta. Uma parte de cada venda abate a sua mensalidade da GoWeb — se as vendas cobrirem tudo, você não paga nada no mês.</p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      {!cfg.apiKeySealed && !has && (
        <section className="card p-5 text-sm">
          <p className="font-semibold">Em breve</p>
          <p className="mt-1 text-muted">Os recebimentos online pela GoWeb ainda estão sendo ativados. Enquanto isso, use o Mercado Pago em Configurações → Integrações.</p>
        </section>
      )}

      {/* mensalidade abatida */}
      {hybrid && has && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Sua mensalidade, abatida nas vendas</h2>
            <span className="text-xs text-muted">{String(pct).replace(".", ",")}% de cada venda online, até quitar o mês</span>
          </div>
          {cur ? (
            <>
              <div className="mt-4 flex items-end justify-between gap-2">
                <p className="text-3xl font-black tabular-nums">{fm(cur.amortizedMinor)}</p>
                <p className="text-sm text-muted">de {fm(cur.targetMinor)}</p>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${progress}%` }} /></div>
              <p className="mt-2 text-sm">
                {cur.amortizedMinor >= cur.targetMinor ? (
                  <b className="text-emerald-700">Mensalidade quitada pelas vendas! As próximas vendas do ciclo vão 100% para você.</b>
                ) : (
                  <>Faltam <b>{fm(cur.targetMinor - cur.amortizedMinor)}</b>. O ciclo fecha em <b>{fmtDate(cur.endAt, { dateStyle: "short" })}</b>; se sobrar saldo, ele é cobrado nesse dia e você tem até {fmtDate(cur.graceEndAt, { dateStyle: "short" })} para pagar.</>
                )}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">O ciclo começa na entrega do seu site e renova a cada 30 dias.</p>
          )}
          {cyc && cyc.history.filter((h) => h.status !== "ACCUMULATING").length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
              {cyc.history.filter((h) => h.status !== "ACCUMULATING").map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex-1">{fmtDate(h.startAt, { dateStyle: "short" })} – {fmtDate(h.endAt, { dateStyle: "short" })}</span>
                  <span className="text-muted">abatido {fm(h.amortizedMinor)}{h.residualMinor ? ` · saldo ${fm(h.residualMinor)}` : ""}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.status === "OVERDUE_SUSPENDED" || h.status === "AWAITING_RESIDUAL" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{CYCLE_LABEL[h.status]}</span>
                  {h.invoiceId && (h.status === "AWAITING_RESIDUAL" || h.status === "OVERDUE_SUSPENDED") && <a className="btn-brand rounded-lg px-3 py-1 text-xs" href={`/fatura/${h.invoiceId}`}>Pagar saldo</a>}
                </li>
              ))}
            </ul>
          )}
          {customer && (
            <form action={billingMethodAction.bind(null, slug)} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
              <span className="font-semibold">Se sobrar saldo:</span>
              <label className="flex items-center gap-1.5"><input type="radio" name="method" value="PIX" defaultChecked={customer.preferredBilling !== "CREDIT_CARD"} /> receber link (Pix, boleto ou cartão)</label>
              <label className="flex items-center gap-1.5"><input type="radio" name="method" value="CREDIT_CARD" defaultChecked={customer.preferredBilling === "CREDIT_CARD"} disabled={!customer.cardTokenSealed} /> cobrar no cartão {customer.cardLabel ? <b>{customer.cardLabel}</b> : <span className="text-muted">(pague uma fatura com cartão para salvar)</span>}</label>
              <button className="btn-ghost py-1.5 text-sm">Salvar</button>
            </form>
          )}
        </section>
      )}

      {has ? (
        <>
          <section className="card p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-48 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Saldo disponível</p>
                <p className="text-3xl font-black tabular-nums">{ov?.balanceMinor != null ? fm(ov.balanceMinor) : "—"}</p>
                <p className="mt-1 text-xs text-muted">Pix cai na hora; cartão fica disponível em ~30 dias (regra das bandeiras).</p>
              </div>
              <form action={transferNowAction.bind(null, slug)}>
                <SubmitButton className="btn-brand" pending="Transferindo…"><Icon name="send" size={16} /> Transferir para meu Pix</SubmitButton>
              </form>
            </div>
            {ov?.status && ov.status !== "APPROVED" && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <b>Cadastro em análise.</b> Para liberar os saques, envie os documentos pedidos:
                {ov.pendingDocs.length > 0 ? (
                  <ul className="mt-2 space-y-1">{ov.pendingDocs.map((d) => <li key={d.url}><a className="font-semibold underline" target="_blank" rel="noopener noreferrer" href={d.url}>{d.title} ↗</a></li>)}</ul>
                ) : (
                  <span> confira o e-mail enviado pelo Asaas para {info.email ?? "o seu e-mail"}.</span>
                )}
              </div>
            )}
            <form action={payoutAction.bind(null, slug)} className="mt-4 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-[1fr_auto] sm:items-end">
              <label>Chave Pix para receber<input name="pixKey" className="input mt-1" defaultValue={info.pixKey ?? ""} required /></label>
              <button className="btn-ghost">Salvar</button>
              <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" name="autoTransfer" defaultChecked={info.autoTransfer !== false} /> Transferir o saldo automaticamente todo dia</label>
            </form>
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-semibold">No seu site</h2>
            <form action={checkoutMethodsAction.bind(null, slug)} className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" name="pix" defaultChecked={pixOn} /> Pix online (QR na hora, confirma sozinho)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="card" defaultChecked={cardOn} /> Cartão de crédito online</label>
              <button className="btn-ghost py-1.5">Salvar</button>
            </form>
            <p className="mt-2 text-xs text-muted">O cliente informa o CPF ao pagar online. Dinheiro e maquininha continuam como estão em Configurações.</p>
          </section>
        </>
      ) : (
        cfg.apiKeySealed && (
          <section className="card p-5">
            <h2 className="font-semibold">Ativar recebimentos</h2>
            <p className="mt-1 text-sm text-muted">Criamos a sua conta de recebimentos (Asaas, instituição de pagamento autorizada pelo Banco Central) sem você precisar abrir outro app. Use os dados do titular do CNPJ ou CPF que vai receber.</p>
            <form action={createSubaccountAction.bind(null, slug)} className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <label className="sm:col-span-2">Nome da empresa ou do titular<input name="name" className="input mt-1" defaultValue={customer?.businessName ?? t.name} required maxLength={120} /></label>
              <label>CNPJ ou CPF<input name="cpfCnpj" className="input mt-1" inputMode="numeric" defaultValue={t.ruc ?? customer?.ruc ?? ""} required /></label>
              <label>Tipo da empresa (se CNPJ)
                <select name="companyType" className="input mt-1" defaultValue="MEI">
                  {COMPANY_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label>Data de nascimento (se CPF)<input name="birthDate" type="date" className="input mt-1" /></label>
              <label>Faturamento mensal aproximado<MoneyInput name="incomeValue" currency="BRL" defaultMinor={0} /></label>
              <label>E-mail<input name="email" type="email" className="input mt-1" defaultValue={customer?.email ?? ""} required /></label>
              <label>Celular com DDD<input name="mobilePhone" className="input mt-1" inputMode="tel" defaultValue={(t.whatsapp ?? "").replace(/^\+55/, "")} required /></label>
              <label>CEP<input name="postalCode" className="input mt-1" inputMode="numeric" required /></label>
              <label>Bairro<input name="province" className="input mt-1" required /></label>
              <label className="sm:col-span-2">Endereço (rua/avenida)<input name="address" className="input mt-1" defaultValue={t.address ?? ""} required /></label>
              <label>Número<input name="addressNumber" className="input mt-1" required /></label>
              <label>Complemento<input name="complement" className="input mt-1" /></label>
              <label className="sm:col-span-2">Chave Pix para receber o dinheiro<input name="pixKey" className="input mt-1" required placeholder="CPF, CNPJ, e-mail, celular (+55…) ou chave aleatória" /></label>
              <label className="flex items-start gap-2 sm:col-span-2"><input type="checkbox" name="terms" className="mt-1" required /> Confirmo que os dados são verdadeiros e aceito os termos de uso do Asaas. Entendo que {String(pct).replace(".", ",")}% de cada venda online abate a mensalidade da GoWeb até quitá-la no mês.</label>
              <SubmitButton className="btn-brand sm:col-span-2" pending="Criando conta…">Criar minha conta de recebimentos</SubmitButton>
            </form>
          </section>
        )
      )}
    </div>
  );
}
