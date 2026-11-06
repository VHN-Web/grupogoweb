import { CURRENCIES } from "@/core/types";
import { listBillingProviders } from "@/adapters/billing/registry";
import { gatewayMap, getSettings } from "@/services/billing";
import { Flash } from "@/components/Flash";
import { saveSettings } from "../actions";

const CUR = { PYG: "Guaraníes (Gs.)", USD: "Dólares (US$)", BRL: "Reais (R$)" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const gw = gatewayMap(s.gatewayByCurrency);
  const providers = listBillingProviders();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Flash {...sp} />
      <h1 className="text-xl font-bold">Configurações da plataforma</h1>
      <form action={saveSettings} className="space-y-5">
        <Section title="Sua empresa">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Nome comercial"><input name="companyName" className="input" defaultValue={s.companyName} /></F>
            <F label="Domínio da plataforma"><input name="platformDomain" className="input" defaultValue={s.platformDomain ?? ""} placeholder="goweboficial.com" /></F>
            <F label="WhatsApp de suporte"><input name="supportWhatsapp" className="input" defaultValue={s.supportWhatsapp ?? ""} /></F>
            <F label="E-mail de suporte"><input name="supportEmail" className="input" defaultValue={s.supportEmail ?? ""} /></F>
          </div>
          <p className="mt-2 text-xs text-muted">Com o domínio da plataforma configurado (DNS wildcard *.seudominio → servidor), cada cliente também abre em <b>slug.seudominio</b>.</p>
        </Section>

        <Section title="Gateway por moeda" desc="O cliente escolhe a moeda na página da fatura; cada moeda usa o gateway definido aqui.">
          <div className="space-y-2">
            {CURRENCIES.map((c) => (
              <div key={c} className="flex flex-wrap items-center gap-3">
                <span className="w-36 text-sm font-semibold">{CUR[c]}</span>
                <select name={`gw_${c}`} defaultValue={gw[c]} className="input w-auto flex-1">
                  {providers.filter((p) => p.currencies.includes(c)).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}{p.isConfigured() ? "" : " — não configurado"}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <F label="Instruções para pagamento manual (transferência / depósito)" className="mt-3">
            <textarea name="manualInstructions" className="input min-h-24" defaultValue={s.manualInstructions ?? ""} placeholder={"Banco Itaú PY · Cuenta 000000 · Titular ...\nPix: chave@empresa.com\nEnviá el comprobante por WhatsApp."} />
          </F>
          <p className="mt-2 text-xs text-muted">Credenciais ficam no servidor (variáveis de ambiente): MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET. Webhook do Mercado Pago: <code>/api/billing/webhook/mercadopago</code>.</p>
        </Section>

        <Section title="Domínio adicional" desc="Valor cobrado na implantação (1º ano) e na renovação anual — exceto em planos com domínio incluso.">
          <div className="grid grid-cols-3 gap-2">
            <input name="domainPyg" className="input" defaultValue={s.domainPricePyg} aria-label="Gs." placeholder="Gs." />
            <input name="domainUsd" className="input" defaultValue={s.domainPriceUsdMinor / 100} aria-label="US$" placeholder="US$" />
            <input name="domainBrl" className="input" defaultValue={s.domainPriceBrlMinor / 100} aria-label="R$" placeholder="R$" />
          </div>
        </Section>

        <Section title="Cobrança automática">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Gerar a fatura X dias antes do vencimento"><input name="invoiceDaysBefore" type="number" className="input" defaultValue={s.invoiceDaysBefore} /></F>
            <F label="Suspender após X dias de atraso"><input name="graceDays" type="number" className="input" defaultValue={s.graceDays} /></F>
          </div>
        </Section>
        <button className="btn-primary">Salvar configurações</button>
      </form>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
function F({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
