import { sortPlansByPrice } from "@/core/plans";
import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { Icon } from "@/components/ui/Icon";
import { H, wrap } from "@/components/site/tokens";
import { AffShell, Flash } from "@/components/affiliates/AffShell";
import { Countdown } from "@/components/affiliates/Countdown";
import { ShareLink } from "@/components/affiliates/ShareLink";
import { Bar, Confetti, Medal, Ring, Stat, TierBadge, card, tierStyle } from "@/components/affiliates/ui";
import { commission, pctLabel } from "@/core/affiliates";
import { formatMinor } from "@/core/money";
import { getAffiliate } from "@/lib/affiliate-auth";
import { qrSvg } from "@/lib/qr";
import { affiliateConfig, affiliateDashboard, affiliateLink, fmtDateTime, nextCohort } from "@/services/affiliates";

export const metadata = { title: "GoWeb Afiliados", description: "Indique a GoWeb para negócios da sua cidade e ganhe comissão sobre cada implantação paga." };

const brl = (m: number) => formatMinor(m, "BRL");

export default async function AffiliatesHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; bemvindo?: string }> }) {
  const sp = await searchParams;
  const a = await getAffiliate();
  if (!a) return <ProgramLanding />;
  if (a.status === "SUSPENDED")
    return (
      <AffShell name={a.name} status={a.status}>
        <div className={`${card} p-8`}>
          <h1 className="text-2xl font-bold">Cadastro suspenso</h1>
          <p className="mt-2 text-[var(--s-muted)]">O seu acesso ao programa está suspenso. Fale com o suporte da GoWeb para saber mais.</p>
        </div>
      </AffShell>
    );
  if (a.status === "PENDING") return <WaitingRoom a={a} welcome={!!sp.bemvindo} />;

  const d = await affiliateDashboard(a.id);
  const ts = tierStyle(d.tier.index);
  const link = affiliateLink(a.code);
  const qr = await qrSvg(link);
  const today = d.commissions.find((k) => k.status !== "CANCELLED" && Date.now() - k.createdAt.getTime() < 86400000);
  const f = d.funnel;
  const top = Math.max(1, f.clicks, f.leads);
  const funnel = [
    { label: "Cliques no link", v: f.clicks, c: "#1F7FD8", icon: "link" },
    { label: "Indicações", v: f.leads, c: "#22A8B8", icon: "customers" },
    { label: "Em agenda", v: f.scheduled, c: "#F2C14E", icon: "calendar" },
    { label: "Não agendaram", v: f.notScheduled, c: "#8a857b", icon: "clock" },
    { label: "Contrataram", v: f.signed, c: "#7FD6F5", icon: "receipt" },
    { label: "Fecharam (pagas)", v: f.won, c: "#3CC46B", icon: "check" },
  ];
  const nextLive = await db.query.affiliateMaterials.findFirst({ where: and(eq(schema.affiliateMaterials.kind, "live"), gte(schema.affiliateMaterials.liveAt, new Date(Date.now() - 2 * 3600_000))), orderBy: asc(schema.affiliateMaterials.liveAt) });

  return (
    <AffShell name={a.name} status={a.status}>
      <Flash ok={sp.ok} err={sp.err} />
      {/* Nível + XP */}
      <section className="aff-shine relative overflow-hidden rounded-[28px] border border-transparent bg-[#0E0E10] dark:border-[var(--s-line)] p-6 text-[#F4F1EA] sm:p-8" style={{ backgroundImage: `radial-gradient(circle at 85% 0%, ${ts.soft}, transparent 55%)` }}>
        {today && <Confetti />}
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <TierBadge index={d.tier.index} name={d.tier.tier.name} size={84} />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: ts.color }}>Nível {d.tier.tier.name}</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight" style={{ fontFamily: H }}>{pctLabel(d.tier.tier.pctBp)} por venda</h1>
              <p className="mt-1 text-sm text-[#B9B3A7]">{d.xp.toLocaleString("pt-BR")} XP · {d.stats.salesTotal} {d.stats.salesTotal === 1 ? "venda paga" : "vendas pagas"}{d.myPos ? ` · ${d.myPos}º no ranking do mês` : ""}</p>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            <Ring pct={d.tier.progress} color={d.tier.next ? tierStyle(d.tier.index + 1).color : ts.color}>
              <div className="text-center">
                <b className="text-2xl tabular-nums">{d.tier.next ? d.tier.toNext : "★"}</b>
                <p className="text-[10px] uppercase tracking-wider text-[#B9B3A7]">{d.tier.next ? (d.tier.toNext === 1 ? "venda" : "vendas") : "topo"}</p>
              </div>
            </Ring>
            <p className="max-w-[180px] text-sm text-[#B9B3A7]">
              {d.tier.next ? (
                <>
                  Faltam <b className="text-white">{d.tier.toNext}</b> para o nível <b style={{ color: tierStyle(d.tier.index + 1).color }}>{d.tier.next.name}</b> ({pctLabel(d.tier.next.pctBp)}).
                </>
              ) : (
                <>Você está no nível máximo. Continue no topo do ranking!</>
              )}
            </p>
          </div>
        </div>
        {today && (
          <p className="aff-pop relative mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#3CC46B] px-4 py-2 font-bold text-[#0E0E10]">
            <Icon name="sparkle" size={18} /> +{brl(today.amountMinor)} de comissão hoje!
          </p>
        )}
      </section>

      {/* Dinheiro */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" data-reveal>
        <Stat icon="cash" label="A receber" value={brl(d.money.pending)} hint="Pago por Pix" accent="#F2C14E" />
        <Stat icon="check" label="Já recebido" value={brl(d.money.paid)} accent="#3CC46B" />
        <Stat icon="growth" label="Neste mês" value={brl(d.money.month)} accent="#1F7FD8" />
        <Stat icon="team" label="Da sua rede" value={brl(d.money.network)} hint={`${pctLabel(d.cfg.referrerPctBp)} das vendas de quem você trouxe`} accent="#22A8B8" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* Funil */}
        <section className={`${card} p-6`} data-reveal>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Seu funil</h2>
            <Link href="/afiliados/indicacoes" className="text-sm font-semibold text-[var(--s-good-fg)] hover:underline">Ver indicações →</Link>
          </div>
          <ul className="mt-5 space-y-4">
            {funnel.map((x) => (
              <li key={x.label}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold"><span style={{ color: x.c }}><Icon name={x.icon} size={16} /></span>{x.label}</span>
                  <b className="tabular-nums">{x.v}</b>
                </div>
                <Bar pct={x.v / top} color={x.c} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[var(--s-muted)]">Cliques únicos por dia. Nos últimos 30 dias: {f.clicks30} {f.clicks30 === 1 ? "clique" : "cliques"}.</p>
        </section>

        {/* Link */}
        <section className="rounded-3xl border border-transparent bg-[#0E0E10] p-6 text-[#F4F1EA] dark:border-[var(--s-line)]" data-reveal>
          <h2 className="text-lg font-bold">Seu link</h2>
          <p className="mt-1 text-sm text-[#B9B3A7]">Quem abrir fica ligado a você por {d.cfg.cookieDays} dias.</p>
          <div className="mt-4">
            <ShareLink url={link} message="Conhece a GoWeb? Cardápio digital, pedidos no WhatsApp, delivery e caixa num sistema só, com a marca do seu negócio. Agende uma demonstração grátis:" />
          </div>
          <div className="mt-5 flex items-center gap-4">
            <div className="h-28 w-28 shrink-0 rounded-2xl bg-white p-2 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR code do seu link" />
            <p className="text-sm text-[#B9B3A7]">Mostre o QR no celular ou imprima para levar nas visitas aos comércios.</p>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Missões */}
        <section className={`${card} p-6`} data-reveal>
          <h2 className="text-lg font-bold">Missões da semana</h2>
          <ul className="mt-4 space-y-4">
            {d.missions.map((m) => (
              <li key={m.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    {m.done ? <span className="grid h-5 w-5 place-items-center rounded-full bg-[#3CC46B] text-[#0E0E10]"><Icon name="check" size={12} /></span> : <span className="h-5 w-5 rounded-full border-2 border-[var(--s-line)]" />}
                    {m.title}
                  </span>
                  <span className="tabular-nums text-[var(--s-muted)]">{Math.min(m.value, m.goal)}/{m.goal}</span>
                </div>
                <Bar pct={m.pct} color={m.done ? "#3CC46B" : "#1F7FD8"} h={8} />
              </li>
            ))}
          </ul>
        </section>

        {/* Conquistas */}
        <section className={`${card} p-6`} data-reveal>
          <h2 className="text-lg font-bold">Conquistas</h2>
          <ul className="mt-4 grid grid-cols-3 gap-3">
            {d.badges.map((b) => (
              <li key={b.id} className={`text-center ${b.done ? "" : "aff-locked"}`} title={b.desc}>
                <span className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${b.done ? "aff-float bg-[var(--s-good-bg)] text-[var(--s-good-fg)]" : "bg-[var(--s-soft)]"}`}>
                  <Icon name={b.id === "recruiter" ? "team" : b.id === "first-click" ? "link" : b.id === "streak" ? "sparkle" : "star"} size={22} />
                </span>
                <p className="mt-1.5 text-xs font-bold leading-tight">{b.title}</p>
                <p className="sr-only">{b.done ? "conquistada" : "bloqueada"}: {b.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Ranking */}
        <section className={`${card} p-6`} data-reveal>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Ranking do mês</h2>
            <Link href="/afiliados/ranking" className="text-sm font-semibold text-[var(--s-good-fg)] hover:underline">Ver tudo →</Link>
          </div>
          {d.ranking.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--s-muted)]">Ninguém vendeu ainda este mês. A primeira venda já te coloca em 1º!</p>
          ) : (
            <ol className="mt-4 space-y-2">
              {d.ranking.slice(0, 5).map((r) => (
                <li key={r.affiliateId} className={`flex items-center gap-3 rounded-2xl px-2 py-1.5 ${r.affiliateId === a.id ? "bg-[var(--s-good-bg)]" : ""}`}>
                  <Medal pos={r.pos} />
                  <span className="flex-1 truncate font-semibold">{r.affiliateId === a.id ? "Você" : r.name}</span>
                  <span className="text-sm tabular-nums text-[var(--s-muted)]">{r.sales} {r.sales === 1 ? "venda" : "vendas"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {nextLive && (
        <section className="mt-6 flex flex-wrap items-center gap-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5" data-reveal>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500/15 text-red-500"><Icon name="megaphone" /></span>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-red-500">Próxima live</p>
            <p className="font-bold">{nextLive.title}</p>
            <p className="text-sm text-[var(--s-muted)]">{nextLive.liveAt ? fmtDateTime(nextLive.liveAt) : ""}</p>
          </div>
          {nextLive.url && <a href={nextLive.url} target="_blank" rel="noopener" className="btn-brand">Entrar na live</a>}
        </section>
      )}
    </AffShell>
  );
}

// ---------------------------------------------------------------- fila da live
async function WaitingRoom({ a, welcome }: { a: NonNullable<Awaited<ReturnType<typeof getAffiliate>>>; welcome: boolean }) {
  const cfg = await affiliateConfig();
  // turma marcada que já passou (perdeu a live) → mostra a próxima
  const cohort = a.cohort && a.cohort.startsAt.getTime() > Date.now() - 3 * 3600_000 ? a.cohort : await nextCohort();
  const steps = [
    { t: "Cadastro feito", done: true },
    { t: "Chave Pix cadastrada", done: !!a.pixKey },
    { t: "Participar da live de boas-vindas", done: false },
    { t: "Link liberado — comece a indicar", done: false },
  ];
  return (
    <AffShell name={a.name} status={a.status}>
      <section className="relative overflow-hidden rounded-[28px] bg-[#0E0E10] p-6 text-[#F4F1EA] sm:p-10">
        {welcome && <Confetti />}
        <div aria-hidden="true" className="anim-blob absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[#1F7FD8] opacity-20 blur-3xl" />
        <p className="relative text-xs font-bold uppercase tracking-[0.2em] text-[#3CC46B]">{welcome ? "Bem-vindo ao time!" : "Quase lá"}</p>
        <h1 className="relative mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: H }}>Você está na fila da live de boas-vindas</h1>
        <p className="relative mt-3 max-w-2xl text-[#B9B3A7]">
          A cada 15 dias fazemos uma live para explicar o sistema, como abordar os comércios e como funcionam as comissões. Depois da live o seu link de afiliado é liberado.
        </p>
        <div className="relative mt-7">
          {cohort ? (
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm text-[#B9B3A7]">{cohort.title}</p>
                <p className="text-xl font-bold">{fmtDateTime(cohort.startsAt)}</p>
              </div>
              <Countdown to={cohort.startsAt.toISOString()} />
              {cohort.liveUrl ? (
                <a href={cohort.liveUrl} target="_blank" rel="noopener" className="btn-shine rounded-2xl bg-[#3CC46B] px-5 py-3 font-bold text-[#0E0E10]">Entrar na live</a>
              ) : (
                <p className="text-sm text-[#B9B3A7]">O link da live aparece aqui e chega no seu WhatsApp antes do horário.</p>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm">A data da próxima live será anunciada em breve. Avisamos você pelo WhatsApp e pelo e-mail.</p>
          )}
        </div>
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h2 className="text-lg font-bold">Seus próximos passos</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((s, i) => (
              <li key={s.t} className="flex items-center gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${s.done ? "bg-[#3CC46B] text-[#0E0E10]" : "bg-[var(--s-soft)]"}`}>{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className={s.done ? "font-semibold" : ""}>{s.t}</span>
              </li>
            ))}
          </ol>
          <Link href="/afiliados/perfil" className="btn-ghost mt-5">Conferir meus dados e Pix</Link>
        </section>
        <section className={`${card} p-6`}>
          <h2 className="text-lg font-bold">Quanto você pode ganhar</h2>
          <TierLadder cfg={cfg} />
        </section>
      </div>
    </AffShell>
  );
}

function TierLadder({ cfg }: { cfg: Awaited<ReturnType<typeof affiliateConfig>> }) {
  return (
    <ul className="mt-4 space-y-2">
      {cfg.tiers.map((t, i) => (
        <li key={t.name} className="flex items-center gap-3 rounded-2xl border border-[var(--s-line)] p-3">
          <TierBadge index={i} name={t.name} size={40} />
          <div className="flex-1">
            <p className="font-bold" style={{ color: tierStyle(i).color }}>{t.name}</p>
            <p className="text-xs text-[var(--s-muted)]">{cfg.tiers[i + 1] ? `${t.minSales} a ${cfg.tiers[i + 1].minSales - 1} vendas` : `${t.minSales}+ vendas`}</p>
          </div>
          <b className="text-xl tabular-nums">{pctLabel(t.pctBp)}</b>
        </li>
      ))}
      <li className="pt-2 text-sm text-[var(--s-muted)]">
        + {pctLabel(cfg.annualPctBp)} da 1ª anuidade no plano anual · + {pctLabel(cfg.referrerPctBp)} das vendas dos afiliados que você trouxer.
      </li>
    </ul>
  );
}

// ---------------------------------------------------------------- página pública do programa
async function ProgramLanding() {
  const cfg = await affiliateConfig();
  const plans = await db.query.plans.findMany({ where: and(eq(schema.plans.active, true), eq(schema.plans.isCustom, false)), orderBy: asc(schema.plans.sortOrder) }).then((ps) => sortPlansByPrice(ps, "BRL"));
  const ex = plans.filter((p) => p.setupBrlMinor > 0).sort((a, b) => a.setupBrlMinor - b.setupBrlMinor)[0];
  const low = cfg.tiers[0].pctBp;
  const high = cfg.tiers[cfg.tiers.length - 1].pctBp;
  const card2 = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]";
  return (
    <main className="site min-h-dvh">
      <RevealOnScroll />
      <header className="bg-[#0E0E10] text-[#F4F1EA]">
        <div className={`${wrap} flex items-center gap-3 py-5`}>
          <Link href="/?lang=pt" aria-label="GoWeb, início"><GoWebLogo height={32} /></Link>
          <span className="rounded-full bg-[#3CC46B]/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#3CC46B]">Afiliados</span>
          <div className="flex-1" />
          <ThemeToggle locale="pt" variant="compact" />
          <Link href="/afiliados/login" className="rounded-xl border border-[#45454B] px-4 py-2.5 text-sm font-semibold">Entrar</Link>
        </div>
        <div className={`${wrap} grid items-center gap-10 pb-20 pt-10 lg:grid-cols-[1.2fr_1fr]`}>
          <div className="stagger">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#3CC46B]">Programa de afiliados · Brasil</p>
            <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl" style={{ fontFamily: H }}>
              Indique a GoWeb e ganhe até {pctLabel(high)} de cada implantação.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[#B9B3A7]">Apresente o sistema para restaurantes, lanchonetes e comércios da sua cidade. A gente faz a demonstração e a implantação; você recebe por Pix assim que o cliente paga.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/afiliados/cadastro" className="btn-shine rounded-2xl bg-[#3CC46B] px-6 py-3.5 font-bold text-[#0E0E10]">Quero ser afiliado</Link>
              <Link href="/afiliados/termos" className="rounded-2xl border border-[#45454B] px-6 py-3.5 font-bold">Ler as regras</Link>
            </div>
            <p className="mt-4 text-sm text-[#8a857b]">Sem taxa, sem meta e sem multa. Só ganha quando vende.</p>
          </div>
          <div className="relative">
            <div className="aff-float rounded-[28px] border border-white/10 bg-[#141416] p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <TierBadge index={2} name="Ouro" size={56} />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#F2C14E]">Nível Ouro</p>
                  <p className="text-xl font-bold">{pctLabel(cfg.tiers[2]?.pctBp ?? high)} por venda</p>
                </div>
              </div>
              <div className="mt-5"><Bar pct={0.62} color="#7FD6F5" /></div>
              <p className="mt-2 text-xs text-[#B9B3A7]">Faltam 6 vendas para Diamante</p>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[["248", "cliques"], ["31", "indicações"], ["17", "vendas"]].map(([v, l]) => (
                  <div key={l} className="rounded-2xl bg-white/5 p-3"><b className="text-xl">{v}</b><p className="text-[11px] text-[#B9B3A7]">{l}</p></div>
                ))}
              </div>
              <p className="aff-pop mt-5 inline-flex items-center gap-2 rounded-2xl bg-[#3CC46B] px-3 py-1.5 text-sm font-bold text-[#0E0E10]"><Icon name="sparkle" size={16} /> Comissão recebida por Pix</p>
              <p className="mt-3 text-[11px] text-[#8a857b]">Exemplo ilustrativo do portal.</p>
            </div>
          </div>
        </div>
      </header>

      <section className={`${wrap} py-16`}>
        <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: H }} data-reveal>Como funciona</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ["team", "Cadastre-se", "Grátis, com CPF e chave Pix."],
            ["megaphone", "Live de boas-vindas", "A cada 15 dias. Depois dela o seu link é liberado."],
            ["link", "Indique", "Mande o link ou cadastre o contato no portal. A gente agenda e faz a demonstração."],
            ["cash", "Receba", `${pctLabel(low)} a ${pctLabel(high)} da implantação, por Pix, quando o cliente pagar.`],
          ].map(([i, t, d], n) => (
            <li key={t} className={`${card2} lift p-5`} data-reveal>
              <span className="text-xs font-black text-[var(--s-muted)]">0{n + 1}</span>
              <span className="mt-2 grid h-11 w-11 place-items-center rounded-2xl bg-[var(--s-good-bg)] text-[var(--s-good-fg)]"><Icon name={i} /></span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="mt-1 text-sm text-[var(--s-muted)]">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-[var(--s-soft)] py-16">
        <div className={`${wrap} grid gap-10 lg:grid-cols-2`}>
          <div data-reveal>
            <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: H }}>Quanto mais vende, mais ganha</h2>
            <p className="mt-3 text-[var(--s-muted)]">O nível sobe sozinho conforme as suas vendas pagas. A venda que te faz subir já recebe a nova porcentagem.</p>
            {ex && (
              <div className={`${card2} mt-6 p-5`}>
                <p className="text-sm text-[var(--s-muted)]">Exemplo: implantação de {formatMinor(ex.setupBrlMinor, "BRL")}</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatMinor(commission(ex.setupBrlMinor, low), "BRL")} a {formatMinor(commission(ex.setupBrlMinor, high), "BRL")} <span className="text-base font-semibold text-[var(--s-muted)]">por venda</span>
                </p>
              </div>
            )}
          </div>
          <div className={`${card2} p-6`} data-reveal>
            <TierLadder cfg={cfg} />
          </div>
        </div>
      </section>

      <section className={`${wrap} grid gap-4 py-16 md:grid-cols-3`}>
        {[
          ["star", "Ranking e prêmios", "Ranking mensal com os afiliados que mais venderam. Prêmios anunciados nas lives."],
          ["growth", "Painel completo", "Veja cliques, indicações, agenda, quem fechou e quanto você tem a receber."],
          ["download", "Materiais prontos", "Vídeos, textos para WhatsApp, artes e lives de treinamento."],
        ].map(([i, t, d]) => (
          <div key={t} className={`${card2} p-6`} data-reveal>
            <span className="text-[var(--s-good-fg)]"><Icon name={i} size={24} /></span>
            <p className="mt-3 text-lg font-bold">{t}</p>
            <p className="mt-1 text-[var(--s-muted)]">{d}</p>
          </div>
        ))}
      </section>

      <section className="bg-[#0E0E10] py-16 text-center text-[#F4F1EA]">
        <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: H }}>Pronto para começar?</h2>
        <p className="mt-2 text-[#B9B3A7]">Programa exclusivo para o Brasil.</p>
        <Link href="/afiliados/cadastro" className="btn-shine mt-6 inline-block rounded-2xl bg-[#3CC46B] px-7 py-3.5 font-bold text-[#0E0E10]">Criar minha conta</Link>
      </section>
    </main>
  );
}
