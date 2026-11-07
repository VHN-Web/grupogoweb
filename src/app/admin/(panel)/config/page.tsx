import { CURRENCIES } from "@/core/types";
import { listBillingProviders } from "@/adapters/billing/registry";
import { gatewayMap, getSettings } from "@/services/billing";
import { Flash } from "@/components/Flash";
import { saveSettings, testStorage } from "../actions";
import { blobConfigured } from "@/adapters/storage";

const CUR = { PYG: "Guarani (Gs.)", USD: "Dólar (US$)", BRL: "Real (R$)" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const gw = gatewayMap(s.gatewayByCurrency);
  const providers = listBillingProviders();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Flash {...sp} />
      <h1 className="text-xl font-bold">Configurações da plataforma</h1>
      <section className="card flex flex-wrap items-center gap-3 p-5 text-sm">
        <div className="min-w-48 flex-1">
          <h2 className="font-semibold">Armazenamento de imagens</h2>
          <p className="text-muted">{blobConfigured() ? "Vercel Blob conectado (fotos de produtos, logos e banners)." : process.env.VERCEL ? "Não configurado: os lojistas não conseguem enviar fotos. Conecte um Blob Store ao projeto na Vercel." : "Modo local: imagens ficam na pasta .uploads."}</p>
        </div>
        <form action={testStorage}><button className="btn-ghost">Testar envio de imagem</button></form>
      </section>
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
            <textarea name="manualInstructions" className="input min-h-24" defaultValue={s.manualInstructions ?? ""} placeholder={"Pix: sua-chave@email.com (Titular: Seu Nome)\nEnvie o comprovante pelo WhatsApp do suporte."} />
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

        <Section title="Dados legais (aparecem no contrato e no recibo)" desc="Enquanto não houver CNPJ, use seu nome completo e CPF.">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Razão social ou nome completo"><input name="legalName" className="input" defaultValue={s.legalName ?? ""} placeholder="Ex.: Lázaro da Silva" /></F>
            <F label="CNPJ ou CPF"><input name="legalDoc" className="input" inputMode="numeric" defaultValue={s.legalDoc ?? ""} placeholder="000.000.000-00" /></F>
            <F label="Endereço" className="sm:col-span-2"><input name="legalAddress" className="input" defaultValue={s.legalAddress ?? ""} /></F>
            <F label="Cidade/UF (local da assinatura)"><input name="legalCity" className="input" defaultValue={s.legalCity ?? ""} placeholder="Abreu e Lima/PE" /></F>
            <F label="Guardar contratos e recibos por (meses)"><input name="docsRetentionMonths" type="number" min={1} max={120} className="input" defaultValue={s.docsRetentionMonths} /></F>
          </div>
          <p className="mt-2 text-xs text-muted">Depois desse prazo, contratos e recibos antigos são apagados automaticamente — o contrato mais recente de cada cliente é sempre mantido. O cliente recebe a cópia por e-mail.</p>
        </Section>

        <Section title="Nota fiscal de serviço (NFS-e)" desc="Desligada: hoje cada pagamento gera um recibo. Ative quando tiver a conta PJ.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="nfseEnabled" defaultChecked={s.nfseEnabled} /> Emitir NFS-e automaticamente a cada pagamento
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <F label="Emissor">
              <select name="nfseProvider" className="input" defaultValue={s.nfseProvider ?? ""}>
                <option value="">— escolher —</option>
                <option value="nacional">NFS-e Nacional (gov.br)</option>
                <option value="focus">Focus NFe</option>
                <option value="enotas">eNotas</option>
              </select>
            </F>
            <F label="Inscrição municipal"><input name="nfseMunicipalReg" className="input" defaultValue={s.nfseMunicipalReg ?? ""} /></F>
            <F label="Código do serviço (LC 116)"><input name="nfseServiceCode" className="input" defaultValue={s.nfseServiceCode ?? ""} placeholder="1.05" /></F>
          </div>
          <p className="mt-2 text-xs text-muted">
            {s.nfseEnabled
              ? "Ativada: novos pagamentos geram uma NFS-e com status \"em emissão\" na aba Notas, até a integração com o emissor ser concluída."
              : "Só liga com CNPJ (14 dígitos) nos dados legais, inscrição municipal e emissor preenchidos. Até lá, os pagamentos geram recibos."}
          </p>
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
