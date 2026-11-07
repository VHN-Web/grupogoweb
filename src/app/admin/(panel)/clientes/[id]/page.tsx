import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMinor } from "@/core/money";
import { PLATFORM_LABELS } from "@/core/types";
import { fmtDate } from "@/core/billing";
import { MODULES, MODULE_INFO, modulesLabel, parseModules } from "@/core/modules";
import { tenantPublicUrl } from "@/lib/urls";
import { invoiceUrl, getSettings } from "@/services/billing";
import { Flash } from "@/components/Flash";
import { StatusPill } from "@/components/StatusPill";
import { deleteCustomer, cancelCustomerAction, cancelInvoice, confirmInvoicePaid, deliver, saveDomain, setTier, suspendCustomer, toggleTask, saveCustomerModules } from "../../actions";

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.id, id), with: { plan: true, tenant: true } });
  if (!c) notFound();
  const [invoices, tasks, notes, settings] = await Promise.all([
    db.query.invoices.findMany({ where: eq(schema.invoices.customerId, id), orderBy: desc(schema.invoices.createdAt) }),
    db.query.adminTasks.findMany({ where: eq(schema.adminTasks.customerId, id), orderBy: schema.adminTasks.createdAt }),
    db.query.notifications.findMany({ where: eq(schema.notifications.customerId, id), orderBy: desc(schema.notifications.createdAt), limit: 20 }),
    getSettings(),
  ]);
  const openTasks = tasks.filter((t) => !t.done).length;

  return (
    <div className="space-y-5">
      <Flash {...sp} />
      <Link href="/admin/clientes" className="text-sm text-muted">← Clientes</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{c.businessName}</h1>
        <StatusPill status={c.status} />
      </div>

      {/* Próximo passo do fluxo */}
      {c.status === "AWAITING_SETUP_PAYMENT" && (
        <Step title="Aguardando o pagamento da implantação">
          O cliente recebeu o link da fatura. Quando o gateway confirmar (ou você marcar como paga abaixo), o sistema dele é criado automaticamente.
        </Step>
      )}
      {c.status === "IMPLEMENTING" && c.tenant && (
        <Step title="Em implantação — configure e entregue">
          <p>
            Abra o <a className="underline" target="_blank" href={`/painel/${c.tenant.slug}`}>painel do cliente</a> (você entra direto, logado como admin da plataforma)
            e configure cardápio, marca e mesas. Ao clicar em <b>Entregar</b>, uma senha é gerada e enviada ao cliente junto com a 1ª mensalidade.
          </p>
          {openTasks > 0 && <p className="mt-1 text-amber-800">Ainda há {openTasks} tarefa(s) em aberto.</p>}
          <form action={deliver.bind(null, c.id)} className="mt-3">
            <button className="btn-primary">Entregar ao cliente e iniciar cobrança mensal</button>
          </form>
        </Step>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Contrato</h2>
          <Row k="Plano" v={`${c.plan.name} (${PLATFORM_LABELS.interval[c.plan.interval]})${c.tenant?.tier === "pro" ? " · GoInteligence ativo" : ""}`} />
          <Row k="Valor" v={`${formatMinor(c.plan.pricePyg, "PYG")} · ${formatMinor(c.plan.priceUsdMinor, "USD")} · ${formatMinor(c.plan.priceBrlMinor, "BRL")}`} />
          {c.plan.isCustom && <Row k="Módulos" v={modulesLabel(parseModules(c.plan.modules), "pt")} />}
          <Row k="Moeda preferida" v={c.preferredCurrency} />
          <Row k="Próximo vencimento" v={c.nextBillingAt ? fmtDate(c.nextBillingAt) : "—"} />
          <Row k="Entregue em" v={c.deliveredAt ? fmtDate(c.deliveredAt) : "—"} />
          <Row k="Domínio" v={c.wantsDomain ? `${c.domainName ?? "a definir"}${c.plan.includesDomain ? " (grátis no plano)" : ""}` : "Não contratou"} />
        </section>
        <section className="card space-y-1 p-4 text-sm">
          <h2 className="mb-2 font-semibold">Contato</h2>
          <Row k="Responsável" v={c.contactName} />
          <Row k="E-mail" v={c.email} />
          <Row k="WhatsApp" v={c.whatsapp ? `${c.whatsapp}${c.whatsappOptIn ? " ✓ avisos" : " (sem avisos)"}` : "—"} />
          <Row k="RUC" v={c.ruc ?? "—"} />
          {c.notes && <p className="pt-2 text-muted">{c.notes}</p>}
        </section>
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Sistema</h2>
          {c.tenant ? (
            <>
              <p>Cardápio: <a className="underline" target="_blank" href={tenantPublicUrl(c.tenant)}>{tenantPublicUrl(c.tenant)}</a></p>
              {settings.platformDomain && <p className="text-muted">Também em: {c.tenant.slug}.{settings.platformDomain}</p>}
              <p>Painel: <a className="underline" target="_blank" href={`/painel/${c.tenant.slug}`}>/painel/{c.tenant.slug}</a></p>
              <form action={saveDomain.bind(null, c.id)} className="flex gap-2 pt-1">
                <input name="customDomain" className="input py-2" defaultValue={c.tenant.customDomain ?? ""} placeholder="www.donmario.com.py" />
                <button className="btn-ghost px-3">Salvar</button>
              </form>
              <p className="text-xs text-muted">Preencha só depois de apontar o DNS (CNAME do domínio → seu servidor).</p>
            </>
          ) : (
            <p className="text-muted">Será criado quando a implantação for paga.</p>
          )}
        </section>
      </div>

      {tasks.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Tarefas</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <form action={toggleTask.bind(null, c.id, t.id, !t.done)}>
                  <button className={`mt-0.5 grid h-5 w-5 place-items-center rounded-md ring-1 ${t.done ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`} aria-label="Concluir">
                    {t.done ? "✓" : ""}
                  </button>
                </form>
                <div>
                  <p className={t.done ? "text-muted line-through" : "font-medium"}>{t.title}</p>
                  {t.details && <p className="text-xs text-muted">{t.details}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Faturas</h2>
        <table className="mt-2 w-full min-w-[760px] text-sm">
          <tbody className="divide-y divide-line">
            {invoices.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{PLATFORM_LABELS.invoiceKind[i.kind]}</p>
                  <p className="text-xs text-muted">{i.description}</p>
                </td>
                <td className="px-4 py-3 text-xs">
                  {formatMinor(i.amountPyg, "PYG")}<br />{formatMinor(i.amountUsdMinor, "USD")}<br />{formatMinor(i.amountBrlMinor, "BRL")}
                </td>
                <td className="px-4 py-3">vence {fmtDate(i.dueAt)}</td>
                <td className="px-4 py-3">
                  <b className={i.status === "PAID" ? "text-emerald-700" : i.status === "CANCELLED" ? "text-muted" : ""}>{PLATFORM_LABELS.invoiceStatus[i.status]}</b>
                  {i.status === "PAID" && i.paidCurrency && i.paidAmountMinor != null && (
                    <p className="text-xs text-muted">{formatMinor(i.paidAmountMinor, i.paidCurrency)} via {i.provider}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {i.status === "OPEN" && (
                    <div className="flex flex-col items-end gap-2">
                      <a href={invoiceUrl(i.id)} target="_blank" className="text-xs underline">Link de pagamento ↗</a>
                      <form action={confirmInvoicePaid.bind(null, c.id, i.id)} className="flex gap-1">
                        {c.country === "BR" ? (
                          <input type="hidden" name="currency" value="BRL" />
                        ) : (
                          <select name="currency" className="input w-auto py-1 text-xs" defaultValue={c.preferredCurrency === "USD" ? "USD" : "PYG"}>
                            <option value="PYG">Gs.</option>
                            <option value="USD">US$</option>
                          </select>
                        )}
                        <button className="btn-ghost px-2.5 py-1 text-xs">Marcar paga</button>
                      </form>
                      <form action={cancelInvoice.bind(null, c.id, i.id)}><button className="text-xs text-red-600 hover:underline">Cancelar fatura</button></form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold">Mensagens enviadas</h2>
        <ul className="mt-2 divide-y divide-line text-sm">
          {notes.length === 0 && <li className="py-2 text-muted">Nenhuma</li>}
          {notes.map((n) => (
            <li key={n.id} className="py-2">
              <details>
                <summary className="cursor-pointer">
                  <span className="font-medium">{n.channel === "EMAIL" ? "E-mail:" : "WhatsApp:"} {n.subject ?? n.body.slice(0, 50)}</span>{" "}
                  <span className={`text-xs ${n.status === "FAILED" ? "text-red-600" : "text-muted"}`}>
                    {n.status === "LOGGED" ? "registrado (envio não configurado)" : n.status === "SENT" ? "enviado" : `falhou: ${n.error}`} · {fmtDate(n.createdAt)}
                  </span>
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-3 font-sans text-xs">{n.body}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>

      {c.status !== "CANCELLED" && c.tenant && (
        <section className="flex flex-wrap gap-2">
          {c.status === "SUSPENDED" ? (
            <form action={suspendCustomer.bind(null, c.id, false)}><button className="btn-ghost">Reativar manualmente</button></form>
          ) : (
            <form action={suspendCustomer.bind(null, c.id, true)}><button className="btn-ghost">Suspender</button></form>
          )}
          {c.tenant.tier === "pro" ? (
            <form action={setTier.bind(null, c.id, "basic")}><button className="btn-ghost">Desativar GoInteligence</button></form>
          ) : (
            <form action={setTier.bind(null, c.id, "pro")}><button className="btn-ghost">Ativar GoInteligence</button></form>
          )}
          <form action={cancelCustomerAction.bind(null, c.id)}><button className="btn-ghost text-red-600">Cancelar contrato</button></form>
        </section>
      )}

      {c.plan.isCustom && (
        <details className="card p-5 text-sm">
          <summary className="cursor-pointer font-semibold">Módulos do plano personalizado</summary>
          <form action={saveCustomerModules.bind(null, c.id)} className="mt-3 space-y-2">
            {MODULES.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="checkbox" name="modules" value={m} defaultChecked={(parseModules(c.plan.modules) ?? []).includes(m)} />
                <span><b>{MODULE_INFO[m].pt}</b>{MODULE_INFO[m].pro && " ✨"} <span className="text-muted">— {MODULE_INFO[m].descPt}</span></span>
              </label>
            ))}
            <p className="text-xs text-muted">A mensalidade é recalculada com os preços atuais de Admin → Planos e vale a partir da próxima fatura.</p>
            <button className="btn-primary">Salvar módulos</button>
          </form>
        </details>
      )}

      <details className="card border-red-200 p-5 text-sm">
        <summary className="cursor-pointer font-semibold text-red-700">Apagar cliente</summary>
        <form action={deleteCustomer.bind(null, c.id)} className="mt-3 space-y-3">
          <p className="text-muted">
            Remove o cliente da lista com faturas, contratos e recibos. Não dá para desfazer. Se ele ainda usa o sistema, prefira <b>Cancelar contrato</b>.
          </p>
          {c.tenant && !c.tenant.demo && (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="withStore" defaultChecked className="h-4 w-4" /> apagar também a loja /{c.tenant.slug} (site, painel, pedidos, caixa)
            </label>
          )}
          <input name="confirm" className="input" placeholder={`digite: ${c.businessName}`} autoComplete="off" />
          <button className="btn-ghost text-red-600">Apagar de vez</button>
        </form>
      </details>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-ink/80 bg-white p-4 text-sm">
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-muted">{children}</div>
    </div>
  );
}
