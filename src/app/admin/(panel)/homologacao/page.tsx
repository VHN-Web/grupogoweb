import { getPlatformAdmin, requirePlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { environments, githubWebhookUrl, history, homologConfig, listChanges, recentlyPublished, type Change } from "@/services/homolog";
import { approveAction, homologSaveAction, rejectAction, revertAction } from "../homolog-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Homologação" };

const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const BADGE: Record<string, string> = { ok: "bg-emerald-100 text-emerald-800", pending: "bg-amber-100 text-amber-900", failed: "bg-red-100 text-red-700", missing: "bg-black/5 text-muted" };
const LABEL: Record<string, string> = { ok: "ok", pending: "rodando", failed: "falhou", missing: "sem resultado" };
const ACTION: Record<string, string> = { approved: "Aprovado e publicado", rejected: "Ajustes pedidos", revert_opened: "Reversão aberta", merge_failed: "Falha ao publicar" };

export default async function HomologacaoPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requirePlatformAdmin();
  const owner = (await getPlatformAdmin())?.role === "owner";
  const cfg = await homologConfig();
  const ready = !!cfg.tokenSealed;
  let changes: Change[] = [];
  let published: Awaited<ReturnType<typeof recentlyPublished>> = [];
  let envs: Awaited<ReturnType<typeof environments>> = [];
  let ghErr = "";
  if (ready) {
    try {
      [changes, published, envs] = await Promise.all([listChanges(), recentlyPublished(), environments()]);
    } catch (e) {
      ghErr = e instanceof Error ? e.message : "Erro ao falar com o GitHub.";
    }
  }
  const events = await history();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Central de Homologação</h1>
        <p className="text-sm text-muted">Cada mudança chega como PR, roda os testes e ganha uma prévia isolada (banco de teste, sem mensagens nem cobranças reais). Só o que for aprovado aqui vai para a produção.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err ?? (ghErr || undefined)} />

      {ready && (
        <section className="space-y-3">
          <h2 className="font-semibold">Aguardando aprovação ({changes.length})</h2>
          {!changes.length && <p className="card p-4 text-sm text-muted">Nenhuma mudança aberta.</p>}
          {changes.map((c) => (
            <article key={c.number} className="card space-y-3 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-bold underline">#{c.number}</a>
                <b className="min-w-0 flex-1">{c.title}</b>
                <span className="text-xs text-muted">{c.author} · {c.branch} · {fmt(c.updatedAt)}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {c.checks.detail.map((d) => (
                  <span key={d.name} className={`rounded-full px-2 py-0.5 font-semibold ${BADGE[d.state]}`}>{d.name}: {LABEL[d.state]}</span>
                ))}
                {c.env && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold">ambiente /teste/{c.env}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.previewUrl ? <a href={c.previewUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs font-semibold">Abrir prévia ↗</a> : <span className="text-xs text-muted">Prévia ainda não publicada.</span>}
                {owner &&
                  (c.block ? (
                    <span className="text-xs font-semibold text-amber-800">{c.block}</span>
                  ) : (
                    <form action={approveAction.bind(null, c.number, c.sha)}><SubmitButton pending="Publicando…" className="btn-brand px-3 py-1.5 text-xs">Aprovar e publicar</SubmitButton></form>
                  ))}
              </div>
              {owner && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-red-700">Reprovar (pedir ajustes)</summary>
                  <form action={rejectAction.bind(null, c.number)} className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input name="reason" required minLength={5} maxLength={1000} className="input min-w-0 flex-1" placeholder="O que precisa mudar (o autor lê no GitHub)" />
                    <SubmitButton className="btn-ghost px-3 text-red-700">Reprovar</SubmitButton>
                  </form>
                </details>
              )}
            </article>
          ))}
        </section>
      )}

      {ready && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Publicados recentemente</h2>
          <p className="mt-1 text-xs text-muted">Reverter abre um PR que desfaz a mudança (só para o último publicado) e passa pela mesma aprovação. Em emergência, use também o rollback instantâneo da Vercel.</p>
          <ul className="mt-2 divide-y divide-line">
            {published.map((p, i) => (
              <li key={p.number} className="flex flex-wrap items-center gap-2 py-2">
                <a href={p.html_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">#{p.number}</a>
                <span className="min-w-0 flex-1">{p.title}</span>
                {owner && i === 0 && <form action={revertAction.bind(null, p.number)}><SubmitButton pending="Abrindo…" className="btn-ghost px-2 py-1 text-xs">Reverter</SubmitButton></form>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready && (
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Ambientes de teste por colaborador</h2>
          <p className="mt-1 text-xs text-muted">Cada colaborador trabalha no branch <code>teste/&lt;nome&gt;</code>; o endereço <code>/teste/&lt;nome&gt;</code> abre a prévia mais recente dele.</p>
          {envs.length ? (
            <ul className="mt-2 space-y-1">
              {envs.map((e) => (
                <li key={e.branch} className="flex flex-wrap items-center gap-2">
                  <a href={e.path} className="font-semibold underline">{e.path}</a>
                  <span className="text-xs text-muted">{e.branch} · {e.sha.slice(0, 7)}</span>
                  {!e.previewUrl && <span className="text-xs text-amber-800">sem prévia ainda</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">Nenhum branch teste/&lt;nome&gt; ainda. Crie um por colaborador no GitHub a partir do main.</p>
          )}
        </section>
      )}

      <section className="card p-4 text-sm">
        <h2 className="font-semibold">Histórico</h2>
        {events.length ? (
          <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1">Quando</th><th>PR</th><th>Decisão</th><th>Quem</th><th>Motivo</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-line align-top">
                  <td className="py-1.5">{fmt(e.createdAt)}</td>
                  <td>#{e.prNumber} {e.title}</td>
                  <td>{ACTION[e.action] ?? e.action}</td>
                  <td>{e.by}</td>
                  <td>{e.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : (
          <p className="mt-2 text-xs text-muted">Nenhuma decisão registrada ainda.</p>
        )}
      </section>

      <section className="card p-4 text-sm">
        <h2 className="font-semibold">Configuração</h2>
        <dl className="mt-2 grid gap-2 sm:grid-cols-[200px_1fr]">
          <dt className="font-semibold">Webhook do GitHub</dt><dd className="break-all font-mono text-xs">{githubWebhookUrl()}</dd>
          <dt className="font-semibold">Segredo do webhook</dt><dd className="break-all font-mono text-xs">{owner ? cfg.webhookSecret || "aparece depois de salvar" : "visível só para o administrador principal"}</dd>
          <dt className="font-semibold">Eventos</dt><dd className="text-xs">Pull requests e Check suites (content type: application/json)</dd>
        </dl>
        {owner ? (
          <form action={homologSaveAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Repositório<input name="repo" defaultValue={cfg.repo} className="input mt-1" /></label>
            <label className="text-xs font-semibold">Token do GitHub {cfg.tokenSealed ? "(salvo — preencha só para trocar)" : ""}<input name="token" type="password" autoComplete="off" className="input mt-1" /></label>
            <label className="text-xs font-semibold sm:col-span-2">Checks obrigatórios (um por linha)<textarea name="checks" rows={3} defaultValue={cfg.requiredChecks.join("\n")} className="input mt-1 font-mono" /></label>
            <p className="text-xs text-muted sm:col-span-2">Token fine-grained só deste repositório: Contents e Pull requests (leitura e escrita); Commit statuses, Checks e Deployments (leitura).</p>
            <div className="sm:col-span-2"><SubmitButton className="btn-brand">Salvar</SubmitButton></div>
          </form>
        ) : (
          <p className="mt-3 text-xs text-muted">Só o administrador principal configura e aprova.</p>
        )}
      </section>
    </div>
  );
}
