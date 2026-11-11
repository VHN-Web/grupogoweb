import Link from "next/link";
import { getPlatformAdmin, requirePlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { aiUsageByChannel, igOverview } from "@/services/instagram";
import { igGowebAiAction, igGowebDisconnectAction, igSaveAppAction } from "../../ig-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instagram · Geovana" };

const fmtN = (v: number) => v.toLocaleString("pt-BR");
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 })}`;
const fmtDate = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

export default async function AdminInstagramPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requirePlatformAdmin();
  const me = await getPlatformAdmin();
  const owner = me?.role === "owner";
  const [ov, usage] = await Promise.all([igOverview("goweb"), aiUsageByChannel()]);
  const acc = ov.account;
  const label = { goweb: "GoWeb", store: "Lojas" } as const;
  const net = { whatsapp: "WhatsApp", instagram: "Instagram" } as const;
  const total = usage.reduce((a, r) => a + r.costUsd, 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Geovana · Instagram</h1>
          <p className="text-sm text-muted">API oficial da Meta (Instagram API with Instagram Login). Conta institucional da GoWeb e contas das lojas GoInteligence.</p>
        </div>
        <Link href="/admin/geovana/conversas" className="btn-ghost px-3 py-1.5 text-xs font-semibold">Caixa de entrada</Link>
        <Link href="/admin/geovana/protecao" className="btn-ghost px-3 py-1.5 text-xs font-semibold">Proteção</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">1. App da Meta</h2>
        <p className="mt-1 text-muted">Crie um app do tipo Negócios em developers.facebook.com, adicione o produto Instagram (login pelo Instagram) e cadastre estes endereços:</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-[180px_1fr]">
          <dt className="font-semibold">URL de redirecionamento</dt><dd className="break-all font-mono text-xs">{ov.redirectUri}</dd>
          <dt className="font-semibold">URL do webhook</dt><dd className="break-all font-mono text-xs">{ov.webhookUrl}</dd>
          <dt className="font-semibold">Token de verificação</dt><dd className="break-all font-mono text-xs">{ov.verifyToken || "aparece depois de salvar o app"}</dd>
          <dt className="font-semibold">Campo do webhook</dt><dd className="font-mono text-xs">messages</dd>
        </dl>
        {owner ? (
          <form action={igSaveAppAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">ID do app do Instagram<input name="appId" defaultValue={ov.appId} inputMode="numeric" className="input mt-1" /></label>
            <label className="text-xs font-semibold">Chave secreta do app {ov.configured ? "(salva — preencha só para trocar)" : ""}<input name="appSecret" type="password" autoComplete="off" className="input mt-1" /></label>
            <div className="sm:col-span-2"><SubmitButton className="btn-brand">Salvar app</SubmitButton></div>
          </form>
        ) : (
          <p className="mt-3 text-xs text-muted">Só o administrador principal altera o app.</p>
        )}
        <p className="mt-3 text-xs text-muted">Para atender contas das lojas a Meta exige revisão do app (acesso avançado a instagram_business_manage_messages), política de privacidade publicada e verificação da empresa. A conta da própria GoWeb funciona antes disso.</p>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">2. Instagram da GoWeb</h2>
        {!ov.configured ? (
          <p className="mt-2 text-muted">Salve o app acima para conectar.</p>
        ) : acc ? (
          <div className="mt-2 space-y-2">
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">✓ @{acc.username ?? "instagram"} · {acc.status === "active" ? (acc.aiEnabled ? "Geovana atendendo" : "IA desligada (só caixa de entrada)") : "pausado"}{acc.expiresAt ? ` · acesso renovado sozinho (vence ${fmtDate(acc.expiresAt)})` : ""}</p>
            {acc.lastError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{acc.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              <form action={igGowebAiAction.bind(null, !acc.aiEnabled)}><button className="btn-ghost px-3 py-1.5 text-xs font-semibold">{acc.aiEnabled ? "Desligar a IA" : "Ligar a IA"}</button></form>
              {acc.status === "error" && <a href="/api/instagram/oauth/start?escopo=goweb" className="btn-brand px-3 py-1.5 text-xs">Reconectar</a>}
              {owner && <form action={igGowebDisconnectAction}><button className="px-3 py-1.5 text-xs font-semibold text-red-600">Desconectar</button></form>}
            </div>
          </div>
        ) : (
          <a href="/api/instagram/oauth/start?escopo=goweb" className="btn-brand mt-3 inline-block">Conectar o Instagram da GoWeb</a>
        )}
        <p className="mt-3 text-xs text-muted">A Geovana usa o mesmo conhecimento do WhatsApp da GoWeb (planos, preços, links). Leads do Direct entram no CRM com origem &quot;Instagram&quot;. Ela só responde até 24 h depois da última mensagem e nunca inicia conversa.</p>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">Consumo de IA por canal (mês)</h2>
        <p className="mt-1 text-muted">Controle central: WhatsApp e Instagram da mesma loja somam na franquia dela. Custo estimado pelos tokens reais e pelo preço configurado na Proteção.</p>
        {usage.length ? (
          <table className="mt-3 w-full text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1">Canal</th><th>Respostas</th><th>Tokens (entrada / saída)</th><th>Custo</th></tr></thead>
            <tbody>
              {usage.map((r) => (
                <tr key={`${r.kind}-${r.net}`} className="border-t border-line">
                  <td className="py-1.5 font-semibold">{label[r.kind]} · {net[r.net]}{r.kind === "store" ? ` (${r.stores} loja${r.stores === 1 ? "" : "s"})` : ""}</td>
                  <td>{fmtN(r.calls)}</td>
                  <td>{fmtN(r.tokensIn)} / {fmtN(r.tokensOut)}</td>
                  <td>{usd(r.costUsd)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold"><td className="py-1.5">Total</td><td>{fmtN(usage.reduce((a, r) => a + r.calls, 0))}</td><td /><td>{usd(total)}</td></tr>
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-muted">Nenhuma resposta de IA neste mês ainda.</p>
        )}
      </section>
    </div>
  );
}
