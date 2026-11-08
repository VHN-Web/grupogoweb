import { asc, desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { AffShell } from "@/components/affiliates/AffShell";
import { card } from "@/components/affiliates/ui";
import { CopyLink } from "@/components/storefront/CopyLink";
import { Icon } from "@/components/ui/Icon";
import { requireActiveAffiliate } from "@/lib/affiliate-auth";
import { affiliateLink, fmtDateTime } from "@/services/affiliates";

export const metadata = { title: "Materiais e lives — GoWeb Afiliados", robots: { index: false } };

const KIND = { live: ["Live", "megaphone", "#E0614A"], video: ["Vídeo", "sparkle", "#1F7FD8"], texto: ["Texto pronto", "chat", "#3CC46B"], arquivo: ["Arquivo", "download", "#F2C14E"], link: ["Link", "external", "#22A8B8"] } as const;

// Textos iniciais enquanto a GoWeb não publica materiais próprios
const STARTER = [
  { id: "s1", kind: "texto" as const, title: "Primeira mensagem para o comerciante", description: "Para mandar no WhatsApp de restaurantes, lanchonetes e lojas.", body: "Oi! Tudo bem? Sou {nome}. Trabalho com a GoWeb, um sistema de cardápio digital com pedidos no WhatsApp, delivery, mesas com QR e caixa — tudo com a marca do seu negócio e sem comissão por pedido.\n\nPosso agendar uma demonstração rápida e gratuita (uns 20 minutos)? Dá para escolher o horário aqui: {link}", url: null, liveAt: null, pinned: true, sortOrder: 0, createdAt: new Date(0) },
  { id: "s2", kind: "texto" as const, title: "Lembrete depois de 2 dias", description: "Para quem não respondeu.", body: "Oi! Passando para lembrar da demonstração da GoWeb. Muita gente que testou parou de anotar pedido no papel e começou a vender pelo link no Instagram. Se quiser ver funcionando, é só escolher um horário: {link}", url: null, liveAt: null, pinned: false, sortOrder: 1, createdAt: new Date(0) },
  { id: "s3", kind: "texto" as const, title: "Post para Instagram / status", description: "Legenda curta com o seu link.", body: "Tem restaurante, lanchonete ou loja? Com a GoWeb o seu cliente pede pelo celular, você recebe organizado e não paga comissão por pedido. Demonstração grátis: {link}", url: null, liveAt: null, pinned: false, sortOrder: 2, createdAt: new Date(0) },
];

export default async function Materials() {
  const a = await requireActiveAffiliate();
  const saved = await db.query.affiliateMaterials.findMany({ orderBy: [desc(schema.affiliateMaterials.pinned), asc(schema.affiliateMaterials.sortOrder), desc(schema.affiliateMaterials.createdAt)] });
  const all = saved.length ? saved : STARTER;
  const now = Date.now();
  const upcoming = all.filter((m) => m.kind === "live" && m.liveAt && m.liveAt.getTime() > now - 2 * 3600_000).sort((x, y) => x.liveAt!.getTime() - y.liveAt!.getTime());
  const rest = all.filter((m) => !upcoming.includes(m));
  const link = affiliateLink(a.code);
  const fill = (t: string) => t.replaceAll("{link}", link).replaceAll("{nome}", a.name.split(" ")[0]);
  return (
    <AffShell name={a.name} status={a.status}>
      <h1 className="text-2xl font-bold tracking-tight">Materiais e lives</h1>
      <p className="text-sm text-[var(--s-muted)]">Tudo o que você precisa para apresentar a GoWeb. Os textos já vêm com o seu link.</p>

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

      <ul className="mt-6 grid gap-4 md:grid-cols-2">
        {rest.length === 0 && <li className={`${card} p-8 text-center text-[var(--s-muted)] md:col-span-2`}>Os materiais aparecem aqui em breve.</li>}
        {rest.map((m) => {
          const [label, icon, color] = KIND[m.kind];
          return (
            <li key={m.id} className={`${card} lift flex flex-col p-5`}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color }}>
                <Icon name={icon} size={16} /> {label}{m.pinned ? " · destaque" : ""}
                {m.kind === "live" && m.liveAt ? <span className="font-normal normal-case text-[var(--s-muted)]">· gravada em {m.liveAt.toLocaleDateString("pt-BR")}</span> : null}
              </div>
              <p className="mt-2 text-lg font-bold">{m.title}</p>
              {m.description && <p className="mt-1 text-sm text-[var(--s-muted)]">{m.description}</p>}
              {m.body && <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-[var(--s-soft)] p-3 font-sans text-sm">{fill(m.body)}</pre>}
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {m.body && <CopyLink text={fill(m.body)} label="Copiar texto" done="Copiado!" className="btn-ghost" />}
                {m.url && <a href={m.url} target="_blank" rel="noopener" className="btn-ghost"><Icon name={m.kind === "arquivo" ? "download" : "external"} size={16} /> {m.kind === "arquivo" ? "Baixar" : "Abrir"}</a>}
              </div>
            </li>
          );
        })}
      </ul>
    </AffShell>
  );
}
