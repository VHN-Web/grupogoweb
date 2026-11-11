import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { ACTION_LABELS, OBJECTIVE_LABELS, THEME_LABELS, parseObjectives, type Action, type Objective, type SelfReport, type Theme } from "@/core/advisory";
import { advisoryConfig, advisoryErrorText, assertAdvisory, calendarLinks, currentPlan, planView, storeMetrics } from "@/services/advisory";
import { AdvisorySimulator } from "@/components/advisory/AdvisorySimulator";
import { PostCard } from "@/components/advisory/PostCard";
import { AD_STEPS, DOW, insightText } from "@/components/advisory/texts";
import { minorToInput } from "@/core/money";
import type { Currency } from "@/core/types";
import { aiCaptionAction, autonomyAction, cancelAdvisoryAction, postStatusAction, requestAdvisoryAction, savePostAction, taskAction } from "../advisory-actions";

export const dynamic = "force-dynamic";

const TABS = ["plano", "calendario", "tarefas", "agenda"] as const;

export default async function CrescerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string; aba?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, fm, fmtDate, locale } = panelI18n(t);
  const L = (o: { es: string; pt: string }) => o[locale];

  const avail = await assertAdvisory(t).catch((e: unknown) => ({ error: advisoryErrorText(e, t) }));
  if ("error" in avail) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">{T("Asesoría GoWeb", "Assessoria GoWeb")}</h1>
        <p className="card p-5 text-sm">{avail.error}</p>
      </div>
    );
  }
  const pricing = avail.pricing;

  const plan = await currentPlan(t.id);
  const flash = (
    <>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
    </>
  );
  const header = (
    <div>
      <h1 className="text-xl font-bold">{T("Asesoría GoWeb", "Assessoria GoWeb")}</h1>
      <p className="text-sm text-muted">{T("Un plan para vender más: más ticket, más clientes que vuelven, más presencia en Instagram y Google.", "Um plano para vender mais: ticket maior, mais clientes voltando, mais presença no Instagram e no Google.")}</p>
    </div>
  );

  // ---------------------------------------------------------------- sem plano: diagnóstico + simulação
  if (!plan || plan.status === "requested") {
    const now = new Date();
    const metrics = await storeMetrics(t, new Date(now.getTime() - 90 * 86_400_000), now);
    const initial = plan
      ? { objectives: parseObjectives(JSON.parse(plan.objectives)) as Objective[], total: plan.monthlyTotal, months: plan.months, report: JSON.parse(plan.selfReport) as SelfReport }
      : null;
    return (
      <div className="max-w-4xl space-y-5">
        {header}
        {flash}
        {plan && (
          <section className="card border-2 border-[#2FAE5F] p-5 text-sm">
            <p className="font-semibold">{T("Pedido enviado", "Pedido enviado")} · {fmtDate(plan.requestedAt ?? plan.createdAt)}</p>
            <p className="mt-1">
              {fm(plan.monthlyTotal)}/{T("mes", "mês")} · {plan.months} {T("meses", "meses")} · {T("asesoría", "assessoria")} {fm(plan.fee)} · {T("anuncios sugeridos", "anúncios sugeridos")} {fm(plan.ads)}
            </p>
            <p className="mt-1 text-muted">{T("Un socio de GoWeb te contacta para confirmar. Podés cambiar la simulación abajo y enviar de nuevo.", "Um sócio da GoWeb vai falar com você para confirmar. Dá para mudar a simulação abaixo e enviar de novo.")}</p>
            <form action={cancelAdvisoryAction.bind(null, slug)} className="mt-3">
              <button className="btn-ghost px-3 py-1.5 text-xs font-semibold">{T("Cancelar pedido", "Cancelar pedido")}</button>
            </form>
          </section>
        )}
        <AdvisorySimulator locale={locale} currency={t.currency as Currency} pricing={pricing} metrics={metrics} isPro={t.tier === "pro"} demo={t.demo} action={requestAdvisoryAction.bind(null, slug)} initial={initial} />
      </div>
    );
  }

  // ---------------------------------------------------------------- plano em andamento
  const [v, cfg] = await Promise.all([planView(t, plan), advisoryConfig()]);
  const tab = (TABS as readonly string[]).includes(sp.aba ?? "") ? (sp.aba as (typeof TABS)[number]) : "plano";
  const cal = await calendarLinks(t, plan, v.posts, [...v.actions, ...v.ads.map((a) => a.task)]);
  const tabLabel: Record<(typeof TABS)[number], string> = { plano: T("Plan y resultados", "Plano e resultados"), calendario: T("Calendario", "Calendário"), tarefas: T("Tareas", "Tarefas"), agenda: T("Agenda", "Agenda") };
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const card = (label: string, before: string | null, now: string) => (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="text-lg font-bold">{now}</p>
      {before && <p className="text-xs text-muted">{T("antes", "antes")}: {before}</p>}
    </div>
  );

  return (
    <div className="max-w-4xl space-y-5">
      {header}
      {flash}
      <section className="card flex flex-wrap items-center gap-3 p-4 text-sm">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${plan.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{plan.status === "active" ? T("En curso", "Em andamento") : T("En pausa", "Pausado")}</span>
        <span>
          {T("Mes", "Mês")} {v.month} {T("de", "de")} {plan.months}
        </span>
        <span className="text-muted">· {v.objectives.map((o) => L(OBJECTIVE_LABELS[o])).join(", ")}</span>
        <span className="ml-auto text-muted">
          {T("asesoría", "assessoria")} {fm(plan.fee)} · {T("anuncios", "anúncios")} {fm(plan.ads)}/{T("mes", "mês")}
        </span>
      </section>

      <nav className="flex gap-2 overflow-x-auto" aria-label={T("Secciones", "Seções")}>
        {TABS.map((k) => (
          <Link key={k} href={`/painel/${slug}/crescer?aba=${k}`} aria-current={tab === k ? "page" : undefined} className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold ${tab === k ? "btn bg-ink text-white" : "btn-ghost"}`}>
            {tabLabel[k]}
          </Link>
        ))}
      </nav>

      {tab === "plano" && (
        <>
          <section className="card p-5">
            <h2 className="font-semibold">{T("Antes y ahora (por mes)", "Antes e agora (por mês)")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {card(T("Ventas", "Vendas"), v.baseline ? fm(v.baseline.revenue) : null, fm(v.current.revenue))}
              {card(T("Pedidos", "Pedidos"), v.baseline ? String(v.baseline.orders) : null, String(v.current.orders))}
              {card(T("Ticket promedio", "Ticket médio"), v.baseline ? fm(v.baseline.ticket) : null, fm(v.current.ticket))}
              {card(T("Clientes que vuelven", "Clientes que voltam"), v.baseline ? pct(v.baseline.repeatRate) : null, pct(v.current.repeatRate))}
              {card(T("Clientes nuevos", "Clientes novos"), v.baseline ? String(v.baseline.newCustomers) : null, String(v.current.newCustomers))}
              {card(T("Pedidos en horarios flojos", "Pedidos nos horários fracos"), v.baseline ? String(v.baseline.weakOrders) : null, String(v.current.weakOrders))}
            </div>
            <p className="mt-2 text-xs text-muted">{T(`"Antes" = 90 días previos al plan; "ahora" = ${v.days} días del plan. Todo llevado a 30 días.`, `"Antes" = 90 dias antes do plano; "agora" = ${v.days} dias de plano. Tudo levado para 30 dias.`)}</p>
          </section>
          <section className="card p-5">
            <h2 className="font-semibold">{T("Lo que cambió", "O que mudou")}</h2>
            {v.insights.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {v.insights.map((i) => (
                  <li key={i.code}>{insightText(i, locale, fm)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">{T("Los primeros números aparecen después de la primera semana.", "Os primeiros números aparecem depois da primeira semana.")}</p>
            )}
          </section>
          <section className="card p-5">
            <h2 className="font-semibold">{T("Plan mes a mes", "Plano mês a mês")}</h2>
            <ol className="mt-2 space-y-2 text-sm">
              {v.months.map((m) => (
                <li key={m.month} className={`rounded-xl border p-3 ${m.month === v.month ? "border-[#2FAE5F]" : "border-line"}`}>
                  <p className="font-semibold">
                    {T("Mes", "Mês")} {m.month}
                    {m.month === v.month && <span className="ml-2 text-xs text-[#2FAE5F]">{T("ahora", "agora")}</span>}
                  </p>
                  <p className="text-muted">{m.actions.map((a) => L(ACTION_LABELS[a])).join(" · ")}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {tab === "calendario" && (
        <>
          <section className="card p-5 text-sm">
            <h2 className="font-semibold">{T("Publicación automática en Instagram", "Publicação automática no Instagram")}</h2>
            {!cfg.igPublishEnabled ? (
              <p className="mt-1 text-muted">{T("Disponible cuando Meta apruebe la publicación para GoWeb. Mientras tanto: aprobás, copiás el texto, bajás la foto y publicás vos.", "Disponível quando a Meta aprovar a publicação para a GoWeb. Enquanto isso: você aprova, copia a legenda, baixa a foto e posta.")}</p>
            ) : !v.account?.canPublish ? (
              <div className="mt-2 space-y-2">
                <p className="text-muted">{T("Conectá el Instagram de la tienda con permiso para publicar.", "Conecte o Instagram da loja com permissão para publicar.")}</p>
                <a href={`/api/instagram/oauth/start?loja=${encodeURIComponent(slug)}&publicar=1`} className="btn-brand inline-block px-3 py-1.5 text-xs">{T("Conectar para publicar", "Conectar para publicar")}</a>
              </div>
            ) : (
              <form action={autonomyAction.bind(null, slug)} className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-muted">@{v.account.username}</span>
                <select name="mode" defaultValue={plan.autonomy} className="input w-auto">
                  <option value="off">{T("Apagada: publico yo", "Desligada: eu posto")}</option>
                  <option value="approved">{T("Publicar los que yo apruebe", "Publicar os que eu aprovar")}</option>
                  <option value="all">{T("Publicar todos (aprueba solo 24 h antes)", "Publicar todos (aprova sozinho 24 h antes)")}</option>
                </select>
                <button className="btn-ghost px-3 py-1.5 text-xs font-semibold">{T("Guardar", "Salvar")}</button>
              </form>
            )}
          </section>
          {v.posts.length === 0 && <p className="card p-5 text-sm text-muted">{T("El calendario se arma solo al activar el plan.", "O calendário se monta sozinho quando o plano é ativado.")}</p>}
          <div className="space-y-3">
            {v.posts.map((p) => {
              const r = v.postResults.get(p.id);
              return (
                <PostCard
                  key={p.id}
                  locale={locale}
                  autonomy={plan.autonomy !== "off" && !!v.account?.canPublish && cfg.igPublishEnabled}
                  post={{
                    id: p.id,
                    when: fmtDate(p.scheduledAt, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
                    theme: L(THEME_LABELS[p.theme as Theme] ?? { es: p.theme, pt: p.theme }),
                    caption: p.caption,
                    imageUrl: p.imageUrl,
                    status: p.status,
                    error: p.error,
                    link: p.code,
                    result: r && r.orders ? T(`${r.orders} pedidos (${fm(r.revenue)}) vinieron del link de este post.`, `${r.orders} pedidos (${fm(r.revenue)}) vieram do link deste post.`) : null,
                  }}
                  save={savePostAction.bind(null, slug, p.id)}
                  ai={aiCaptionAction.bind(null, slug, p.id)}
                  setStatus={postStatusAction.bind(null, slug, p.id)}
                />
              );
            })}
          </div>
        </>
      )}

      {tab === "tarefas" && (
        <>
          <section className="card p-5">
            <h2 className="font-semibold">{T("Anuncios de la semana", "Anúncios da semana")}</h2>
            <p className="text-sm text-muted">{T("Vos creás el anuncio en tu cuenta y pagás directo a Meta o Google. Nosotros medimos los pedidos por el link.", "Você cria o anúncio na sua conta e paga direto à Meta ou ao Google. A gente mede os pedidos pelo link.")}</p>
            {v.ads.length === 0 && <p className="mt-3 text-sm text-muted">{T("Este plan no tiene anuncios por ahora.", "Este plano não tem anúncios por enquanto.")}</p>}
            <div className="mt-3 space-y-3">
              {v.ads.map(({ task, data, orders, revenue, result }) => (
                <details key={task.id} className="rounded-xl border border-line p-4 text-sm" open={task.status === "todo"}>
                  <summary className="cursor-pointer font-semibold">
                    {T("Semana", "Semana")} {data.week} · {data.network === "google" ? "Google" : "Instagram/Facebook"} · {fm(data.totalBudget)}
                    <span className="ml-2 text-xs font-normal text-muted">{task.status === "todo" ? T("pendiente", "pendente") : task.status === "done" ? T("hecho", "feito") : T("saltado", "pulado")}</span>
                  </summary>
                  <ul className="mt-3 space-y-1">
                    <li>{T("Qué anunciar", "O que anunciar")}: <b>{data.productName ?? T("tu producto más vendido", "seu produto mais vendido")}</b></li>
                    <li>{T("Días", "Dias")}: <b>{data.days.map((d) => DOW[locale][d]).join(T(" y ", " e "))}</b> · {T("valor por día", "valor por dia")}: <b>{fm(data.budgetPerDay)}</b></li>
                    <li>{T("Público", "Público")}: <b>{data.radiusKm} km</b> {T("alrededor de la tienda", "em volta da loja")}</li>
                    <li className="break-all">{T("Link (pegalo exacto)", "Link (cole exato)")}: <code className="rounded bg-black/5 px-1">{data.link}</code></li>
                  </ul>
                  <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted">
                    {AD_STEPS[data.network].map((s, i) => (
                      <li key={i}>{L(s)}</li>
                    ))}
                  </ol>
                  {task.spent != null && (
                    <p className="mt-3 rounded-lg bg-black/[.03] px-3 py-2">
                      {T("Resultado", "Resultado")}: {fm(task.spent)} {T("invertidos", "investidos")} · {orders} {T("pedidos", "pedidos")} · {fm(revenue)} {T("en ventas", "em vendas")}
                      {result.cpo != null && <> · {T("costo por pedido", "custo por pedido")} {fm(result.cpo)}</>}
                      {result.verdict === "stop" && <b className="block text-red-700">{T("Este anuncio cuesta más de lo que deja: pausalo o cambiá la imagen/producto.", "Este anúncio está custando mais do que deixa: pause ou troque a imagem/produto.")}</b>}
                      {result.verdict === "good" && <b className="block text-emerald-700">{T("Va bien: vale repetir.", "Está indo bem: vale repetir.")}</b>}
                    </p>
                  )}
                  <form action={taskAction.bind(null, slug, task.id)} className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="text-xs">
                      {T("¿Cuánto gastaste?", "Quanto você gastou?")}
                      <input name="spent" inputMode="decimal" className="input mt-1 w-32" defaultValue={task.spent != null ? minorToInput(task.spent, t.currency as Currency) : ""} />
                    </label>
                    <button className="btn-brand px-3 py-1.5 text-xs">{T("Guardar", "Salvar")}</button>
                    {task.status === "todo" && (
                      <button name="skip" value="1" className="btn-ghost px-3 py-1.5 text-xs font-semibold">
                        {T("No lo voy a hacer", "Não vou fazer")}
                      </button>
                    )}
                  </form>
                </details>
              ))}
            </div>
          </section>
          <section className="card p-5">
            <h2 className="font-semibold">{T("Acciones del plan", "Ações do plano")}</h2>
            {v.actions.length === 0 && <p className="mt-2 text-sm text-muted">{T("Nada pendiente.", "Nada pendente.")}</p>}
            <ul className="mt-2 divide-y divide-line">
              {v.actions.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className={a.status === "todo" ? "" : "text-muted line-through"}>{L(ACTION_LABELS[a.action as Action] ?? { es: a.action ?? "", pt: a.action ?? "" })}</span>
                  <span className="text-xs text-muted">· {T("hasta", "até")} {fmtDate(a.dueAt, { dateStyle: "short" })}</span>
                  {a.status === "todo" && (
                    <form action={taskAction.bind(null, slug, a.id)} className="ml-auto">
                      <button className="btn-ghost px-3 py-1 text-xs font-semibold">{T("Hecho", "Feito")}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              {T("Combos, ofertas y campañas se configuran en", "Combos, ofertas e campanhas ficam em")} <Link href={`/painel/${slug}/marketing`} className="underline">Marketing</Link>, <Link href={`/painel/${slug}/crescimento`} className="underline">{T("Crecimiento", "Crescimento")}</Link> {T("y", "e")} <Link href={`/painel/${slug}/divulgacao`} className="underline">{T("Divulgación", "Divulgação")}</Link>.
            </p>
          </section>
        </>
      )}

      {tab === "agenda" && (
        <section className="card space-y-3 p-5 text-sm">
          <h2 className="font-semibold">{T("Llevá el plan a tu agenda", "Leve o plano para a sua agenda")}</h2>
          {cal.ics && (
            <div className="space-y-2">
              <p>{T("Suscribite una vez y la agenda se actualiza sola (Google Calendar, iPhone, Outlook):", "Assine uma vez e a agenda se atualiza sozinha (Google Agenda, iPhone, Outlook):")}</p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(cal.webcal ?? "")}`} target="_blank" rel="noreferrer" className="btn-brand px-3 py-1.5 text-xs">Google Agenda</a>
                <a href={cal.webcal ?? "#"} className="btn-ghost px-3 py-1.5 text-xs font-semibold">iPhone / Outlook</a>
              </div>
              <p className="break-all text-xs text-muted">{cal.ics}</p>
              <p className="text-xs text-muted">{T("Este link es privado: no lo compartas.", "Este link é privado: não compartilhe.")}</p>
            </div>
          )}
          <h3 className="pt-2 font-semibold">{T("O agregá uno por uno", "Ou adicione um por um")}</h3>
          <ul className="divide-y divide-line">
            {cal.events
              .filter((e) => e.start.getTime() > Date.now() - 86_400_000)
              .slice(0, 20)
              .map((e) => (
                <li key={e.uid} className="flex flex-wrap items-center gap-2 py-2">
                  <span>{fmtDate(e.start, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="text-muted">· {e.title}</span>
                  <a href={e.gcal} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold underline">
                    {T("+ Google Agenda", "+ Google Agenda")}
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
