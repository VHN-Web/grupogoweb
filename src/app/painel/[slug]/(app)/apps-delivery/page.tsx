import { redirect } from "next/navigation";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { OD_CATEGORIES, OD_CATEGORY_PT, OD_PLATFORMS, OD_PLATFORM_INFO, splitAddress, type OdPlatform } from "@/core/opendelivery";
import { channelInfo, channelUrls, listChannels, odConfig } from "@/services/opendelivery";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { CopyField } from "@/components/forms/CopyField";
import { Icon } from "@/components/ui/Icon";
import { connectAppAction, onboardAppAction, pollNowAction, removeAppAction, syncMenuAction, toggleAppAction } from "../od-actions";

export const dynamic = "force-dynamic";

export default async function DeliveryAppsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string; app?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "settings");
  if (t.country !== "BR") redirect(`/painel/${slug}`);
  const { fm, fmtDate } = panelI18n(t);
  const [channels, cfg] = await Promise.all([listChannels(t.id), odConfig()]);
  const since = new Date(Date.now() - 30 * 86400_000);
  const sums = await db.query.orders.findMany({
    where: and(eq(schema.orders.tenantId, t.id), isNotNull(schema.orders.channel), gte(schema.orders.createdAt, since)),
    columns: { channel: true, totalPyg: true, status: true },
  });
  const sold = (p: string) => sums.filter((o) => o.channel === p && o.status !== "CANCELLED").reduce((a, o) => a + o.totalPyg, 0);
  const addr = splitAddress(t.address);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Apps de delivery</h1>
        <p className="text-sm text-muted">
          Receba os pedidos da 99Food e da Keeta aqui no painel, junto com os do seu site: mesmo quadro, mesma impressora, mesmo caixa. O cardápio vai
          para os apps sozinho e cada mudança de status volta para o cliente no app. Funciona pelo padrão Open Delivery da Abrasel.
        </p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      {channels.length > 0 && (
        <form action={syncMenuAction.bind(null, slug)}>
          <SubmitButton className="btn-ghost text-sm" pending="Avisando…"><Icon name="send" size={16} /> Enviar cardápio atualizado para os apps</SubmitButton>
        </form>
      )}

      {OD_PLATFORMS.map((p: OdPlatform) => {
        const info = OD_PLATFORM_INFO[p];
        const ch = channels.find((c) => c.platform === p);
        const hasDefault = !!(cfg[p]?.clientId && cfg[p]?.clientSecretSealed);
        const saved = ch ? channelInfo(ch) : null;
        const a = saved?.address ?? addr;
        const urls = ch ? channelUrls(ch) : null;
        const n = sums.filter((o) => o.channel === p).length;
        const editing = !ch || sp.app === p;
        return (
          <section key={p} className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-black text-black" style={{ background: info.color }}>{info.name.slice(0, 2)}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{info.name}</h2>
                <p className="text-xs text-muted">
                  {!ch ? "Não conectado" : !ch.enabled ? "Pausado — pedidos não entram" : ch.lastError && ch.lastErrorAt && (!ch.lastEventAt || ch.lastErrorAt > ch.lastEventAt) ? "Conectado, com aviso" : "Conectado"}
                  {n ? ` · ${n} pedido(s) em 30 dias · ${fm(sold(p))}` : ""}
                </p>
              </div>
              {ch && (
                <div className="flex flex-wrap gap-2">
                  <form action={pollNowAction.bind(null, slug, p)}><SubmitButton className="btn-ghost py-1.5 text-xs" pending="Buscando…">Buscar pedidos agora</SubmitButton></form>
                  <form action={toggleAppAction.bind(null, slug, p)}><button className="btn-ghost py-1.5 text-xs">{ch.enabled ? "Pausar" : "Ligar"}</button></form>
                </div>
              )}
            </div>

            {ch && (
              <div className="space-y-3 p-4 text-sm">
                {ch.lastError && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Último aviso{ch.lastErrorAt ? ` (${fmtDate(ch.lastErrorAt, { dateStyle: "short", timeStyle: "short" })})` : ""}: {ch.lastError}
                  </p>
                )}
                <dl className="grid gap-1 text-xs text-muted sm:grid-cols-3">
                  <div><dt className="font-semibold text-ink">Cadastro no app</dt><dd>{ch.onboardedAt ? fmtDate(ch.onboardedAt, { dateStyle: "short" }) : "pendente"}</dd></div>
                  <div><dt className="font-semibold text-ink">App leu o cardápio</dt><dd>{ch.lastMenuAt ? fmtDate(ch.lastMenuAt, { dateStyle: "short", timeStyle: "short" }) : "ainda não"}</dd></div>
                  <div><dt className="font-semibold text-ink">Último evento</dt><dd>{ch.lastEventAt ? fmtDate(ch.lastEventAt, { dateStyle: "short", timeStyle: "short" }) : "nenhum"}</dd></div>
                </dl>
                <p className="text-xs text-muted">Se o {info.name} pedir, informe estes dados da sua loja (já enviamos automaticamente quando o app aceita):</p>
                <div className="grid gap-2">
                  <CopyField label="Merchant ID" value={ch.merchantId} />
                  <CopyField label="URL do cardápio (GET /merchant)" value={urls!.merchantUrl} />
                  <CopyField label="X-API-KEY do cardápio" value={urls!.apiKey} secret />
                  <CopyField label="Webhook de pedidos (newEvent)" value={urls!.webhookUrl} />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <form action={onboardAppAction.bind(null, slug, p)}><SubmitButton className="btn-ghost py-1.5 text-xs" pending="Enviando…">Reenviar cadastro ao app</SubmitButton></form>
                  {!editing && <a className="btn-ghost py-1.5 text-xs" href={`?app=${p}`}>Editar dados</a>}
                  <form action={removeAppAction.bind(null, slug, p)}><button className="btn-ghost py-1.5 text-xs text-red-600">Desconectar</button></form>
                </div>
              </div>
            )}

            {editing && (
              <form action={connectAppAction.bind(null, slug, p)} className="grid gap-3 border-t border-line bg-paper/50 p-4 text-sm sm:grid-cols-2">
                <p className="text-xs text-muted sm:col-span-2">{info.help}</p>
                <label className="grid gap-1">Client ID
                  <input name="clientId" className="input" autoComplete="off" defaultValue={ch?.clientId ?? ""} placeholder={hasDefault ? "Deixe vazio para usar o da GoWeb" : ""} />
                </label>
                <label className="grid gap-1">Client Secret
                  <input name="clientSecret" type="password" className="input" autoComplete="new-password" placeholder={ch ? "•••••• (mantém o atual)" : hasDefault ? "Deixe vazio para usar o da GoWeb" : ""} />
                </label>
                <label className="grid gap-1 sm:col-span-2">Endereço da API do app
                  <input name="baseUrl" className="input" defaultValue={ch?.baseUrl ?? cfg[p]?.baseUrl ?? info.defaultBaseUrl} placeholder="https://…" />
                </label>
                <label className="grid gap-1">App ID <span className="text-xs text-muted">(opcional)</span>
                  <input name="appId" className="input" defaultValue={ch?.appId ?? ""} />
                </label>
                <label className="grid gap-1">Tempo médio de preparo (min)
                  <input name="preparationMin" type="number" min={5} max={120} className="input" defaultValue={saved?.info.preparationMin ?? 25} />
                </label>
                <h3 className="pt-2 font-semibold sm:col-span-2">Dados da loja no app</h3>
                <label className="grid gap-1">CNPJ
                  <input name="document" inputMode="numeric" className="input" required defaultValue={saved?.info.document ?? ""} />
                </label>
                <label className="grid gap-1">Razão social
                  <input name="corporateName" className="input" required defaultValue={saved?.info.corporateName ?? ""} />
                </label>
                <label className="grid gap-1 sm:col-span-2">E-mail de contato
                  <input name="email" type="email" className="input" defaultValue={saved?.info.email ?? ""} />
                </label>
                <label className="grid gap-1 sm:col-span-2">Rua
                  <input name="street" className="input" required defaultValue={a.street} />
                </label>
                <label className="grid gap-1">Número<input name="number" className="input" defaultValue={a.number} /></label>
                <label className="grid gap-1">Complemento<input name="complement" className="input" defaultValue={a.complement} /></label>
                <label className="grid gap-1">Bairro<input name="district" className="input" required defaultValue={a.district} /></label>
                <label className="grid gap-1">Cidade<input name="city" className="input" required defaultValue={a.city} /></label>
                <label className="grid gap-1">UF<input name="state" maxLength={2} className="input uppercase" required defaultValue={a.state} /></label>
                <label className="grid gap-1">CEP<input name="postalCode" inputMode="numeric" className="input" required defaultValue={a.postalCode} /></label>
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1">Categorias (até 3)</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {OD_CATEGORIES.map((c) => (
                      <label key={c} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs">
                        <input type="checkbox" name="categories" value={c} defaultChecked={saved?.info.categories.includes(c)} /> {OD_CATEGORY_PT[c] ?? c}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input type="checkbox" name="autoConfirm" defaultChecked={ch?.autoConfirm ?? true} /> Aceitar automaticamente os pedidos do {info.name} (recomendado: o app cancela se demorar)
                </label>
                <div className="sm:col-span-2">
                  <SubmitButton className="btn-brand" pending="Testando credenciais…">{ch ? "Salvar e testar" : `Conectar ${info.name}`}</SubmitButton>
                </div>
              </form>
            )}
          </section>
        );
      })}

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">Como funciona</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>Pedido novo no app aparece em <b>Pedidos</b> com o selo do app e já entra aceito (se a opção estiver ligada).</li>
          <li>&quot;Preparar&quot;, &quot;Pronto&quot;, &quot;Saiu para entrega&quot; e &quot;Entregue&quot; avisam o app na hora. Cancelar aqui cancela lá.</li>
          <li>Se o entregador for do app, os seus motoboys não são chamados: o app avisa quando ele sair e entregar.</li>
          <li>Produtos, preços, fotos, estoque e &quot;aberto/fechado&quot; vão para os apps sozinhos quando você muda aqui.</li>
          <li>Pagamento feito no app entra como <b>recebido</b>; pagamento na entrega fica <b>a receber</b>, com o troco informado.</li>
        </ul>
      </section>
    </div>
  );
}
