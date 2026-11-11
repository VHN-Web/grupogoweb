import Link from "next/link";
import { requirePlatformAdmin, getPlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { DEFAULT_WA_GUARD } from "@/core/wa-guard";
import { drainSoon, guardOverview } from "@/services/wa-guard";
import { clearQueueAction, drainNowAction, emergencyAction, pauseChannelAction, resumeChannelAction, saveGuardAction } from "../../guard-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proteção da Geovana" };

const fmtN = (v: number) => v.toLocaleString("pt-BR");
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 3 : 2 })}`;
const fmtWhen = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

function Meter({ pct }: { pct: number }) {
  const c = pct >= 100 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-[#3CC46B]";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-black/10"><div className={`h-full ${c}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <span className="w-10 text-right text-xs tabular-nums">{pct}%</span>
    </div>
  );
}

type Field = { name: string; label: string; hint: string; value: number; step?: string };

function Fields({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
      <legend className="mb-1 font-semibold sm:col-span-3">{title}</legend>
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1 text-xs">
          <span className="font-semibold text-ink">{f.label}</span>
          <input name={f.name} type="number" min={0} step={f.step ?? "1"} defaultValue={f.value} className="input" />
          <span className="text-muted">{f.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default async function ProtecaoPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const me = await getPlatformAdmin();
  const owner = me?.role === "owner";
  await drainSoon(); // abrir o painel também faz a fila andar
  const o = await guardOverview();
  const { cfg, totals } = o;
  const D = DEFAULT_WA_GUARD;
  const now = Date.now();
  const emergency = !!o.global.emergency;
  const pausedAll = o.global.paused && !emergency;

  // alertas de consumo e de saúde
  const alerts: { tone: "red" | "amber"; text: string }[] = [];
  if (emergency) alerts.push({ tone: "red", text: `Emergência ligada por ${o.global.by ?? "um sócio"}: nada é enviado e a IA não responde.` });
  if (pausedAll) alerts.push({ tone: "amber", text: "Envios pausados em todos os números (mensagens esperando na fila)." });
  if (totals.dayPct >= 100 || totals.monthPct >= 100) alerts.push({ tone: "red", text: "Orçamento da IA esgotado: as conversas estão indo para a equipe com uma resposta padrão." });
  else if (totals.dayPct >= cfg.ai.economyAt * 100 || totals.monthPct >= cfg.ai.economyAt * 100) alerts.push({ tone: "amber", text: `Consumo de IA elevado (${Math.max(totals.dayPct, totals.monthPct)}% do orçamento): modo economia ligado (histórico menor, respostas mais curtas, sem retorno automático).` });
  for (const c of o.channels) {
    if (c.state.manual) alerts.push({ tone: "red", text: `${c.name}: parado — ${c.state.reason}. Confira o número antes de retomar.` });
    else if (c.open && !c.state.paused) alerts.push({ tone: "amber", text: `${c.name}: proteção ativa até ${fmtWhen(c.state.openUntil)} — ${c.state.reason}.` });
    if (c.usage >= 80) alerts.push({ tone: "amber", text: `${c.name}: ${c.usage}% do limite de mensagens.` });
    if (c.tokenUsage >= 80) alerts.push({ tone: "amber", text: `${c.name}: IA em ${c.tokenUsage}% do orçamento diário.` });
  }

  const tiles = [
    { label: "Enviadas (24 h)", value: fmtN(totals.sent) },
    { label: "Recebidas (24 h)", value: fmtN(totals.received) },
    { label: "Na fila", value: fmtN(totals.pending) },
    { label: "Com falha (24 h)", value: fmtN(totals.failed) },
    { label: "Seguradas (24 h)", value: fmtN(totals.blocked) },
    { label: "Tokens hoje", value: `${fmtN(totals.tokensDay)} · ${totals.dayPct}%` },
    { label: "Tokens no mês", value: `${fmtN(totals.tokensMonth)} · ${totals.monthPct}%` },
    { label: "Custo estimado", value: `${usd(totals.costDay)} hoje · ${usd(totals.costMonth)} mês` },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-64 flex-1">
          <Link href="/admin/geovana" className="text-sm text-muted underline">← Geovana da GoWeb</Link>
          <h1 className="mt-1 text-xl font-bold">Proteção da Geovana</h1>
          <p className="text-sm text-muted">Limites de mensagens e de IA para o WhatsApp da GoWeb (vendas, suporte, cobrança) e para o WhatsApp de cada loja cliente. Protege o número contra bloqueio e o custo da IA.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={drainNowAction}><SubmitButton className="btn-ghost text-sm" pending="Enviando…">Enviar fila agora</SubmitButton></form>
          {!emergency && <form action={pauseChannelAction.bind(null, "*", !o.global.paused)}><SubmitButton className="btn-ghost text-sm" pending="…">{o.global.paused ? "Retomar todos os envios" : "Pausar todos os envios"}</SubmitButton></form>}
          <form action={emergencyAction.bind(null, !emergency)}>
            <SubmitButton className={`rounded-xl px-4 py-2 text-sm font-bold ${emergency ? "bg-[#3CC46B] text-[#0E0E10]" : "bg-red-600 text-white"}`} pending="…">
              {emergency ? "Desligar emergência" : "Emergência: parar tudo"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="space-y-2">
          {alerts.map((a, i) => (
            <p key={i} className={`rounded-xl px-4 py-2.5 text-sm ${a.tone === "red" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>{a.text}</p>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{t.value}</p>
          </div>
        ))}
      </section>

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="p-3">Número</th>
              <th className="p-3">Situação</th>
              <th className="p-3 text-right">Enviadas</th>
              <th className="p-3 text-right">Recebidas</th>
              <th className="p-3 text-right">Fila</th>
              <th className="p-3 text-right">Falhas</th>
              <th className="p-3 text-right">Seguradas</th>
              <th className="p-3">Uso dos limites</th>
              <th className="p-3">IA hoje</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {o.channels.map((c) => {
              const badge = c.state.manual ? ["Parado", "bg-red-100 text-red-800"] : c.state.paused ? ["Pausado", "bg-black/10"] : c.open ? ["Protegendo", "bg-amber-100 text-amber-900"] : ["Normal", "bg-emerald-100 text-emerald-800"];
              return (
                <tr key={c.channel}>
                  <td className="p-3">
                    <p className="font-semibold">{c.name}</p>
                    {c.slug && <Link className="text-xs text-muted underline" href={`/painel/${c.slug}/geovana`}>painel da loja</Link>}
                  </td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge[1]}`}>{badge[0]}</span>
                    {(c.state.manual || c.open) && c.state.reason && <p className="mt-1 max-w-48 text-xs text-muted">{c.state.reason}</p>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{fmtN(c.sent)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtN(c.received)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtN(c.pending)}{c.deadQueue ? <span className="text-red-600"> · {c.deadQueue} falhou</span> : null}</td>
                  <td className="p-3 text-right tabular-nums">{fmtN(c.failed)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtN(c.blocked)}</td>
                  <td className="p-3"><Meter pct={c.usage} /></td>
                  <td className="p-3">
                    <Meter pct={c.tokenUsage} />
                    <p className="text-xs text-muted">{fmtN(c.tokens)} tokens · {usd(c.cost)}</p>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      {(c.state.manual || (c.open && !c.state.paused)) && <form action={resumeChannelAction.bind(null, c.channel)}><SubmitButton className="btn-ghost text-xs" pending="…">Retomar após conferir</SubmitButton></form>}
                      <form action={pauseChannelAction.bind(null, c.channel, !c.state.paused)}><SubmitButton className="btn-ghost text-xs" pending="…">{c.state.paused ? "Retomar" : "Pausar"}</SubmitButton></form>
                      {(c.pending > 0 || c.deadQueue > 0) && <form action={clearQueueAction.bind(null, c.channel)}><SubmitButton className="btn-ghost text-xs text-red-600" pending="…">Limpar fila</SubmitButton></form>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">O que a proteção segurou (24 h)</h2>
          {o.reasons.length === 0 ? <p className="mt-2 text-muted">Nada segurado.</p> : (
            <ul className="mt-2 space-y-1">
              {o.reasons.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="min-w-0 flex-1 truncate">{r.reason ?? "—"}</span><span className="text-xs text-muted">{r.type === "fail" ? "falha" : r.type === "queued" ? "na fila" : "barrada"}</span><span className="w-10 text-right tabular-nums">{r.n}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">Mensagens que desistimos de enviar (7 dias)</h2>
          {o.recentFails.length === 0 ? <p className="mt-2 text-muted">Nenhuma.</p> : (
            <ul className="mt-2 space-y-2">
              {o.recentFails.map((f) => (
                <li key={f.id}><p className="truncate">{f.to} · {f.text.slice(0, 80)}</p><p className="text-xs text-muted">{f.attempts} tentativas · {f.lastError}</p></li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">A fila anda quando chegam mensagens, ao abrir esta página e no cron do CRM (8h, 12h e 17h). Para andar a cada poucos minutos, aponte um agendador gratuito (ex.: cron-job.org) para <code className="font-mono">/api/cron/wa-queue</code> com o cabeçalho <code className="font-mono">Authorization: Bearer CRON_SECRET</code>.</p>
        </section>
      </div>

      {owner ? (
        <form action={saveGuardAction} className="card grid gap-5 p-5 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="font-semibold">Limites</h2>
            <p className="text-muted">Padrões conservadores, bem abaixo do que a Meta permite (a API oficial começa em 250 contatos/dia para mensagens iniciadas pela empresa; a conexão por QR não tem limite oficial e por isso fica mais baixa). Suba aos poucos e acompanhe as falhas.</p>
          </div>
          {(["goweb", "store"] as const).map((p) => (
            <Fields
              key={p}
              title={p === "goweb" ? "WhatsApp da GoWeb (vendas, suporte, cobrança)" : "WhatsApp de cada loja"}
              fields={[
                { name: `${p}.perMinute`, label: "Por minuto", hint: `Padrão ${D[p].perMinute}: ritmo de atendimento humano`, value: cfg[p].perMinute },
                { name: `${p}.perHour`, label: "Por hora", hint: `Padrão ${D[p].perHour}`, value: cfg[p].perHour },
                { name: `${p}.perDay`, label: "Por dia (24 h)", hint: `Padrão ${D[p].perDay}`, value: cfg[p].perDay },
                { name: `${p}.minGapSec`, label: "Intervalo mínimo (s)", hint: `Padrão ${D[p].minGapSec} s entre mensagens`, value: cfg[p].minGapSec, step: "0.5" },
                { name: `${p}.perContactMinute`, label: "Mesmo contato / minuto", hint: "Corta loops (erro 131056 da Meta)", value: cfg[p].perContactMinute },
                { name: `${p}.perContactHour`, label: "Mesmo contato / hora", hint: `Padrão ${D[p].perContactHour}`, value: cfg[p].perContactHour },
                { name: `${p}.perContactDay`, label: "Mesmo contato / dia", hint: `Padrão ${D[p].perContactDay}`, value: cfg[p].perContactDay },
                { name: `${p}.proactivePerContactDay`, label: p === "goweb" ? "Lembretes por contato / dia" : "Avisos por contato / dia", hint: p === "goweb" ? "Iniciadas pela GoWeb: 1 por dia" : "Avisos de pedido (recebido → entregue)", value: cfg[p].proactivePerContactDay },
                { name: `${p}.proactivePerContactWeek`, label: "Iniciadas por contato / semana", hint: `Padrão ${D[p].proactivePerContactWeek}`, value: cfg[p].proactivePerContactWeek },
                { name: `${p}.newContactsPerDay`, label: "Contatos novos / dia", hint: "Contatos que a empresa aborda por dia (o que a Meta limita)", value: cfg[p].newContactsPerDay },
              ]}
            />
          ))}
          <Fields
            title="Geral (todos os números somados) e reenvio"
            fields={[
              { name: "global.perMinute", label: "Geral por minuto", hint: "Teto da infraestrutura", value: cfg.global.perMinute },
              { name: "global.perHour", label: "Geral por hora", hint: `Padrão ${D.global.perHour}`, value: cfg.global.perHour },
              { name: "global.perDay", label: "Geral por dia", hint: `Padrão ${D.global.perDay}`, value: cfg.global.perDay },
              { name: "retry.maxAttempts", label: "Tentativas de reenvio", hint: "Depois disso, desiste e mostra aqui", value: cfg.retry.maxAttempts },
              { name: "retry.baseSec", label: "1ª espera (s)", hint: "Dobra a cada tentativa", value: cfg.retry.baseSec },
              { name: "retry.maxSec", label: "Espera máxima (s)", hint: `Padrão ${D.retry.maxSec}`, value: cfg.retry.maxSec },
            ]}
          />
          <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
            <legend className="mb-1 font-semibold sm:col-span-3">Horário das mensagens iniciadas pela empresa (lembretes, cobrança, retornos)</legend>
            <label className="grid gap-1 text-xs"><span className="font-semibold">Das</span><input name="window.from" type="time" defaultValue={cfg.window.from} className="input" /></label>
            <label className="grid gap-1 text-xs"><span className="font-semibold">Até</span><input name="window.to" type="time" defaultValue={cfg.window.to} className="input" /></label>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d, i) => (
                <label key={d} className="flex items-center gap-1"><input type="checkbox" name={`window.day${i}`} defaultChecked={cfg.window.days.includes(i)} /> {d}</label>
              ))}
            </div>
            <p className="text-xs text-muted sm:col-span-3">Respostas a quem escreveu, avisos de pedido e respostas de chamado saem a qualquer hora. Fora do horário, o resto espera na fila.</p>
          </fieldset>
          <Fields
            title="Proteção automática (circuit breaker) e loops"
            fields={[
              { name: "breaker.failStreak", label: "Falhas seguidas para pausar", hint: "Erros passageiros (rede, servidor)", value: cfg.breaker.failStreak },
              { name: "breaker.openMin", label: "1ª pausa (min)", hint: "Dobra se voltar a falhar", value: cfg.breaker.openMin },
              { name: "breaker.maxOpenMin", label: "Pausa máxima (min)", hint: `Padrão ${D.breaker.maxOpenMin}`, value: cfg.breaker.maxOpenMin },
              { name: "breaker.blockedBurst10m", label: "Volume anormal (barradas em 10 min)", hint: "Acima disso, pausa o número", value: cfg.breaker.blockedBurst10m },
              { name: "loop.inboundPerMinute", label: "Mensagens do contato / min", hint: "Acima disso = robô/loop: IA para", value: cfg.loop.inboundPerMinute },
              { name: "loop.floodPauseMin", label: "Pausa da conversa (min)", hint: "Quando detecta loop", value: cfg.loop.floodPauseMin },
              { name: "loop.botStreakMax", label: "Iniciadas sem resposta", hint: "Não insiste com quem não responde", value: cfg.loop.botStreakMax },
            ]}
          />
          <Fields
            title="IA (Gemini)"
            fields={[
              { name: "ai.perMinute", label: "Chamadas por minuto", hint: "15 = nível gratuito do Flash-Lite; suba se a chave for paga", value: cfg.ai.perMinute },
              { name: "ai.dailyTokens", label: "Tokens por dia (geral)", hint: "~7 mil por resposta", value: cfg.ai.dailyTokens },
              { name: "ai.monthlyTokens", label: "Tokens por mês (geral)", hint: `Padrão ${fmtN(D.ai.monthlyTokens)}`, value: cfg.ai.monthlyTokens },
              { name: "ai.gowebDailyTokens", label: "Tokens/dia — GoWeb", hint: "≈ 100 respostas", value: cfg.ai.gowebDailyTokens },
              { name: "ai.storeDailyTokens", label: "Tokens/dia — cada loja", hint: "≈ 70 respostas", value: cfg.ai.storeDailyTokens },
              { name: "ai.storeMonthlyTokens", label: "Tokens/mês — cada loja", hint: `Padrão ${fmtN(D.ai.storeMonthlyTokens)}`, value: cfg.ai.storeMonthlyTokens },
              { name: "ai.storeMonthlyReplies", label: "Franquia — respostas de IA/mês por loja", hint: `WhatsApp + Instagram. Padrão ${fmtN(D.ai.storeMonthlyReplies)}`, value: cfg.ai.storeMonthlyReplies },
              { name: "ai.chatDailyTokens", label: "Tokens/dia — uma conversa", hint: "Passou disso, vai para a equipe", value: cfg.ai.chatDailyTokens },
              { name: "ai.maxOutputTokens.goweb", label: "Tamanho da resposta — GoWeb", hint: "Tokens de saída", value: cfg.ai.maxOutputTokens.goweb },
              { name: "ai.maxOutputTokens.store", label: "Tamanho da resposta — loja", hint: "Tokens de saída", value: cfg.ai.maxOutputTokens.store },
              { name: "ai.historyTurns.goweb", label: "Histórico — GoWeb", hint: "Mensagens enviadas à IA", value: cfg.ai.historyTurns.goweb },
              { name: "ai.historyTurns.store", label: "Histórico — loja", hint: "Mensagens enviadas à IA", value: cfg.ai.historyTurns.store },
              { name: "ai.turnChars", label: "Caracteres por mensagem", hint: "Corta mensagens longas no histórico", value: cfg.ai.turnChars },
              { name: "ai.economyPct", label: "Modo economia a partir de (%)", hint: "Histórico e resposta menores", value: Math.round(cfg.ai.economyAt * 100) },
              { name: "ai.priceInPerM", label: "Preço entrada (US$/1M)", hint: "Gemini 3.5 Flash-Lite: 0,30", value: cfg.ai.priceInPerM, step: "0.01" },
              { name: "ai.priceOutPerM", label: "Preço saída (US$/1M)", hint: "Gemini 3.5 Flash-Lite: 2,50", value: cfg.ai.priceOutPerM, step: "0.01" },
            ]}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SubmitButton className="btn-brand" pending="Salvando…">Salvar limites</SubmitButton>
            <button name="reset" value="1" className="btn-ghost text-sm">Voltar ao padrão recomendado</button>
          </div>
        </form>
      ) : (
        <p className="card p-5 text-sm text-muted">Só o administrador principal altera os limites. Pausar, retomar e a emergência funcionam para todos os sócios.</p>
      )}
    </div>
  );
}
