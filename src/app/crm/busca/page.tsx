import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Icon } from "@/components/ui/Icon";
import { ScoreBadge } from "@/components/crm/LeadBadges";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { crmConfig, fmtBr, requireCrm } from "@/services/crm";
import { huntNowAction, saveGeminiAction, saveHuntAction } from "../actions";

export const metadata = { title: "Busca de leads" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function Hunt({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireCrm();
  const sp = await searchParams;
  const [cfg, runs, latest] = await Promise.all([
    crmConfig(),
    db.query.crmHuntRuns.findMany({ orderBy: desc(schema.crmHuntRuns.startedAt), limit: 15 }),
    db.query.crmLeads.findMany({ where: eq(schema.crmLeads.source, "hunter"), orderBy: desc(schema.crmLeads.createdAt), limit: 12 }),
  ]);
  const hasKey = !!cfg.geminiKeySealed || !!process.env.GEMINI_API_KEY;
  const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";
  const combos = cfg.cities.length * cfg.categories.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Busca automática de leads</h1>
        <p className="text-sm text-[var(--s-muted)]">3 vezes por dia (8h, 12h e 17h) o Gemini procura negócios reais nas cidades e categorias abaixo, calcula o score e avisa no app.</p>
      </div>
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{sp.err}</p>}

      <section className={`${card} ${hasKey ? "" : "border-2 border-[#F2C14E]"}`}>
        <div className="flex items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-2xl ${hasKey ? "bg-[var(--s-good-bg)] text-[var(--s-good-fg)]" : "bg-[#F2C14E]/20 text-[#B8860B]"}`}><Icon name={hasKey ? "check" : "access"} /></span>
          <div className="flex-1">
            <h2 className="font-bold">Chave do Gemini {hasKey ? "conectada" : "— falta cadastrar"}</h2>
            <p className="text-sm text-[var(--s-muted)]">{hasKey ? `Modelo: ${cfg.model}. A chave fica guardada criptografada.` : "Sem a chave a busca automática e o “Escrever com IA” ficam desligados."}</p>
          </div>
        </div>
        <details className="mt-4" open={!hasKey}>
          <summary className="cursor-pointer text-sm font-semibold text-[var(--s-good-fg)]">Como pegar a chave (2 minutos, grátis)</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Abra <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="font-semibold underline">aistudio.google.com/apikey</a> e entre com a mesma conta Google que você usa no Gemini.</li>
            <li>Toque em <b>“Create API key”</b> (Criar chave de API). Se pedir um projeto, escolha o que aparecer ou crie um novo.</li>
            <li>Copie a chave inteira (começa com <code className="rounded bg-[var(--s-soft)] px-1">AIza</code>) e cole aqui embaixo.</li>
            <li>Não precisa cadastrar cartão: o plano gratuito do Gemini é suficiente para as 3 buscas diárias. Se um dia passar do limite grátis, a busca só tenta de novo no horário seguinte.</li>
          </ol>
        </details>
        <form action={saveGeminiAction} className="mt-4 flex flex-wrap gap-2">
          <input name="key" type="password" autoComplete="off" placeholder={hasKey ? "Colar uma chave nova para trocar" : "Cole a chave aqui (AIza…)"} className="input min-w-[240px] flex-1" />
          <SubmitButton className="btn-brand" pending="Testando…">Salvar e testar</SubmitButton>
        </form>
        {cfg.geminiKeySealed && (
          <form action={saveGeminiAction} className="mt-2">
            <input type="hidden" name="remove" value="1" />
            <button className="text-xs text-[var(--s-muted)] underline">Remover chave</button>
          </form>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="font-bold">Buscar agora</h2>
          <p className="text-sm text-[var(--s-muted)]">Leva de 20 a 60 segundos. Escolha uma combinação ou deixe em branco para seguir a fila automática.</p>
          <form action={huntNowAction} className="mt-4 grid gap-2 sm:grid-cols-2">
            <select name="city" className="input" aria-label="Cidade" defaultValue="">
              <option value="">Próxima cidade da fila</option>
              {cfg.cities.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select name="category" className="input" aria-label="Categoria" defaultValue="">
              <option value="">Próxima categoria da fila</option>
              {cfg.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <SubmitButton className="btn-brand sm:col-span-2" pending="Buscando com o Gemini… (até 1 min)" disabled={!hasKey}>
              <Icon name="search" size={16} /> Buscar leads agora
            </SubmitButton>
          </form>
        </section>

        <section className={card}>
          <h2 className="font-bold">Onde procurar</h2>
          <p className="text-sm text-[var(--s-muted)]">{combos} combinações · cada busca automática faz 2 delas e segue para as próximas.</p>
          <form action={saveHuntAction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="cities">Cidades (uma por linha)</label><textarea id="cities" name="cities" rows={6} defaultValue={cfg.cities.join("\n")} className="input text-sm" /></div>
            <div><label className="label" htmlFor="cats">Categorias (uma por linha)</label><textarea id="cats" name="categories" rows={6} defaultValue={cfg.categories.join("\n")} className="input text-sm" /></div>
            <div><label className="label" htmlFor="perRun">Leads por busca</label><input id="perRun" name="perRun" type="number" min={1} max={20} defaultValue={cfg.perRun} className="input" /></div>
            <div><label className="label" htmlFor="model">Modelo do Gemini</label><input id="model" name="model" defaultValue={cfg.model} className="input" /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="huntEnabled" defaultChecked={cfg.huntEnabled} /> Busca automática 3x por dia ligada</label>
            <button className="btn-primary sm:col-span-2">Salvar</button>
          </form>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Últimos leads encontrados</h2>
            <Link href="/crm/leads?fonte=hunter" className="text-sm font-semibold text-[var(--s-good-fg)]">Ver todos →</Link>
          </div>
          <ul className="mt-3 divide-y divide-[var(--s-line)]">
            {latest.map((l) => (
              <li key={l.id}>
                <Link href={`/crm/leads/${l.id}`} className="flex items-center gap-3 py-2.5">
                  <ScoreBadge score={l.score} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{l.name}</span>
                  <span className="shrink-0 text-xs text-[var(--s-muted)]">{l.city}</span>
                </Link>
              </li>
            ))}
            {latest.length === 0 && <li className="py-4 text-sm text-[var(--s-muted)]">Ainda nenhum — a primeira busca roda no próximo horário depois que a chave for cadastrada.</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-bold">Histórico das buscas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-xl bg-[var(--s-soft)] px-3 py-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.error ? "bg-red-500" : r.finishedAt ? "bg-[#3CC46B]" : "bg-[#F2C14E]"}`} />
                <span className="min-w-0 flex-1">
                  <b>{r.query}</b> <span className="text-xs text-[var(--s-muted)]">· {fmtBr(r.startedAt)} · {r.trigger === "cron" ? "automática" : "manual"}</span>
                  <span className="block text-xs text-[var(--s-muted)]">{r.error ? r.error : r.finishedAt ? `${r.found} encontrados · ${r.added} novos` : "rodando…"}</span>
                </span>
              </li>
            ))}
            {runs.length === 0 && <li className="text-[var(--s-muted)]">Nenhuma busca ainda.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
