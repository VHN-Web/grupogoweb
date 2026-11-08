import { asc, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { AffShell } from "@/components/affiliates/AffShell";
import { card } from "@/components/affiliates/ui";
import { CopyLink } from "@/components/storefront/CopyLink";
import { Icon } from "@/components/ui/Icon";
import { ART_FORMATS, ART_MODELS, KIT_GUIDE, KIT_SCRIPTS, fillKit } from "@/core/affiliate-kit";
import { requireActiveAffiliate } from "@/lib/affiliate-auth";
import { affiliateLink, fmtDateTime, recruitLink } from "@/services/affiliates";

export const metadata = { title: "Materiais e lives — GoWeb Afiliados", robots: { index: false } };

const KIND = { live: ["Live gravada", "megaphone", "#E0614A"], video: ["Vídeo", "sparkle", "#1F7FD8"], texto: ["Texto", "chat", "#3CC46B"], arquivo: ["Arquivo", "download", "#F2C14E"], link: ["Link", "external", "#22A8B8"] } as const;
const SECTIONS = [
  ["artes", "Artes com o seu QR"],
  ["guia", "Guia de divulgação"],
  ["textos", "Textos prontos"],
  ["videos", "Vídeos e arquivos"],
] as const;

export default async function Materials() {
  const a = await requireActiveAffiliate();
  const all = await db.query.affiliateMaterials.findMany({ orderBy: [desc(schema.affiliateMaterials.pinned), asc(schema.affiliateMaterials.sortOrder), desc(schema.affiliateMaterials.createdAt)] });
  const now = Date.now();
  const upcoming = all.filter((m) => m.kind === "live" && m.liveAt && m.liveAt.getTime() > now - 2 * 3600_000).sort((x, y) => x.liveAt!.getTime() - y.liveAt!.getTime());
  const texts = all.filter((m) => m.kind === "texto");
  const others = all.filter((m) => m.kind !== "texto" && !upcoming.includes(m));
  const vars = { link: affiliateLink(a.code), nome: a.name.split(" ")[0], convite: recruitLink(a.code) };
  const fill = (t: string) => fillKit(t, vars);

  return (
    <AffShell name={a.name} status={a.status}>
      <h1 className="text-2xl font-bold tracking-tight">Materiais e lives</h1>
      <p className="text-sm text-[var(--s-muted)]">Tudo para apresentar a GoWeb. As artes e os textos já saem com o seu link e o seu QR Code.</p>

      {upcoming.length > 0 && (
        <section className="mt-6 space-y-3">
          {upcoming.map((m) => {
            const live = m.liveAt!.getTime() <= now;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-4 rounded-3xl bg-[#0E0E10] p-5 text-[#F4F1EA]">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${live ? "animate-pulse bg-red-500" : "bg-red-500/20 text-red-400"}`}><Icon name="megaphone" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-red-400">{live ? "Ao vivo agora" : "Próxima live"} · {fmtDateTime(m.liveAt!)}</p>
                  <p className="text-lg font-bold">{m.title}</p>
                  {m.description && <p className="text-sm text-[#B9B3A7]">{m.description}</p>}
                </div>
                {m.url && <a href={m.url} target="_blank" rel="noopener" className="rounded-2xl bg-[#3CC46B] px-5 py-3 font-bold text-[#0E0E10]">{live ? "Assistir" : "Abrir link"}</a>}
              </div>
            );
          })}
        </section>
      )}

      <nav className="no-scrollbar mt-6 flex gap-2 overflow-x-auto" aria-label="Seções">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full bg-[var(--s-soft)] px-3.5 py-1.5 text-sm font-semibold hover:bg-[var(--s-line)]">{label}</a>
        ))}
      </nav>

      {/* ------------------------------------------------ artes */}
      <section id="artes" className="mt-8 scroll-mt-6">
        <h2 className="text-xl font-bold">Artes com o seu QR Code</h2>
        <p className="text-sm text-[var(--s-muted)]">Baixe e poste. Quem escanear cai direto na sua página de demonstração e a venda fica no seu nome.</p>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {ART_MODELS.map((m) => (
            <li key={m.id} className={`${card} flex flex-col overflow-hidden`}>
              <div className="bg-[var(--s-soft)] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/afiliados/arte?modelo=${m.id}&formato=post`} alt={`Arte "${m.title}" com o seu QR Code`} loading="lazy" width={1080} height={1350} className="mx-auto h-auto w-full max-w-[280px] rounded-xl shadow-lg" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="font-bold">{m.title}</p>
                <p className="text-sm text-[var(--s-muted)]">{m.desc}</p>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  {ART_FORMATS.map((f) => (
                    <a key={f.id} href={`/api/afiliados/arte?modelo=${m.id}&formato=${f.id}&download=1`} className="btn-ghost text-xs" download>
                      <Icon name="download" size={14} /> {f.title}
                    </a>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--s-muted)]">Flyer: imprima em A5 (meia folha A4) e deixe no balcão dos comércios que você visitar.</p>
      </section>

      {/* ------------------------------------------------ guia */}
      <section id="guia" className="mt-10 scroll-mt-6">
        <h2 className="text-xl font-bold">Guia de divulgação</h2>
        <p className="text-sm text-[var(--s-muted)]">O caminho que mais gera vendas, do primeiro contato à demonstração.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {KIT_GUIDE.map((g, i) => (
            <details key={g.title} className={`${card} group p-5`} open={i < 2}>
              <summary className="flex cursor-pointer list-none items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--s-good-bg)] text-[var(--s-good-fg)]"><Icon name={g.icon} size={18} /></span>
                <span className="flex-1 font-bold">{g.title}</span>
                <span className="text-[var(--s-muted)] transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <ul className="mt-4 space-y-2.5 text-sm">
                {g.points.map((p) => (
                  <li key={p} className="flex gap-2.5"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-[var(--s-good-fg)]" /><span>{p}</span></li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ textos */}
      <section id="textos" className="mt-10 scroll-mt-6">
        <h2 className="text-xl font-bold">Textos prontos</h2>
        <p className="text-sm text-[var(--s-muted)]">Troque o que está entre colchetes, como [nome], antes de enviar.</p>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {[...texts.map((t) => ({ id: t.id, title: t.title, when: t.description ?? "", body: t.body ?? "" })), ...KIT_SCRIPTS].map((s) => (
            <li key={s.id} className={`${card} flex flex-col p-5`}>
              <p className="font-bold">{s.title}</p>
              {s.when && <p className="text-xs text-[var(--s-muted)]">{s.when}</p>}
              <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-[var(--s-soft)] p-3 font-sans text-sm">{fill(s.body)}</pre>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <CopyLink text={fill(s.body)} label="Copiar texto" done="Copiado!" className="btn-ghost" />
                <a href={`https://wa.me/?text=${encodeURIComponent(fill(s.body))}`} target="_blank" rel="noopener" className="btn-ghost"><Icon name="chat" size={16} /> WhatsApp</a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------ vídeos e arquivos (publicados pela GoWeb) */}
      <section id="videos" className="mt-10 scroll-mt-6">
        <h2 className="text-xl font-bold">Vídeos, lives gravadas e arquivos</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {others.length === 0 && <li className={`${card} p-8 text-center text-[var(--s-muted)] md:col-span-2`}>As gravações das lives e os vídeos de treinamento aparecem aqui.</li>}
          {others.map((m) => {
            const [label, icon, color] = KIND[m.kind];
            return (
              <li key={m.id} className={`${card} lift flex flex-col p-5`}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color }}>
                  <Icon name={icon} size={16} /> {label}{m.pinned ? " · destaque" : ""}
                  {m.kind === "live" && m.liveAt ? <span className="font-normal normal-case text-[var(--s-muted)]">· {m.liveAt.toLocaleDateString("pt-BR")}</span> : null}
                </div>
                <p className="mt-2 text-lg font-bold">{m.title}</p>
                {m.description && <p className="mt-1 text-sm text-[var(--s-muted)]">{m.description}</p>}
                {m.body && <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-[var(--s-soft)] p-3 font-sans text-sm">{fill(m.body)}</pre>}
                {m.url && (
                  <div className="mt-auto pt-4">
                    <a href={m.url} target="_blank" rel="noopener" className="btn-ghost"><Icon name={m.kind === "arquivo" ? "download" : "external"} size={16} /> {m.kind === "arquivo" ? "Baixar" : "Abrir"}</a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </AffShell>
  );
}
