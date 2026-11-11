import Link from "next/link";
import { GeovanaAvatar } from "@/components/geovana/Geovana";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatPhone } from "@/core/region";
import { instagramAllowed } from "@/core/instagram";
import { AutoRefresh } from "@/components/AutoRefresh";
import { geovanaOf, recentChats } from "@/services/geovana";
import { igChatsFor } from "@/services/instagram";
import { igReplyAction, igResumeAction, waPauseAction } from "../instagram-actions";

export const dynamic = "force-dynamic";

type Msg = { id: string; role: string; text: string };
type Item = { key: string; net: "whatsapp" | "instagram"; id: string; label: string; at: Date; needsHuman: boolean; paused: boolean; windowOpen: boolean; link: string | null; messages: Msg[] };

/** Caixa de entrada unificada da loja: WhatsApp + Instagram numa lista só, mais recente primeiro. */
export default async function ConversasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string; canal?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, fmtDate } = panelI18n(t);
  if (t.tier !== "pro") {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="flex items-center gap-3 text-xl font-bold"><GeovanaAvatar size={40} />{T("Conversaciones", "Conversas")}</h1>
        <div className="card p-5 text-sm">
          <p>{T("WhatsApp e Instagram de la tienda en una sola bandeja, con la Geovana atendiendo.", "WhatsApp e Instagram da loja numa caixa só, com a Geovana atendendo.")}</p>
          <Link href={`/painel/${slug}/plano`} className="btn-brand mt-4 inline-block">{T("Disponible en GoInteligence", "Disponível no GoInteligence")}</Link>
        </div>
      </div>
    );
  }
  const cfg = geovanaOf(t);
  const igOn = instagramAllowed({ tier: t.tier, demo: t.demo, country: t.country }).ok;
  const [wa, ig] = await Promise.all([recentChats(t.id), igOn ? igChatsFor({ tenantId: t.id }) : Promise.resolve([])]);
  const now = new Date();
  let items: Item[] = [
    ...wa.map((c) => ({ key: `wa-${c.id}`, net: "whatsapp" as const, id: c.id, label: c.name ?? formatPhone(c.phone), at: c.lastAt, needsHuman: c.needsHuman, paused: !!c.pausedUntil && c.pausedUntil > now, windowOpen: true, link: `https://wa.me/${c.phone.replace(/\D/g, "")}`, messages: c.messages })),
    ...ig.map((c) => ({ key: `ig-${c.id}`, net: "instagram" as const, id: c.id, label: c.label, at: c.lastAt, needsHuman: c.needsHuman, paused: !!c.pausedUntil && c.pausedUntil > now, windowOpen: c.windowOpen, link: c.username ? `https://ig.me/m/${c.username}` : null, messages: c.messages })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (sp.canal === "whatsapp" || sp.canal === "instagram") items = items.filter((i) => i.net === sp.canal);
  if (sp.canal === "equipe") items = items.filter((i) => i.needsHuman);
  const waiting = items.filter((i) => i.needsHuman).length;
  const who = (r: string) => (r === "user" ? T("Cliente", "Cliente") : r === "ai" ? cfg.name : r === "staff" ? T("Equipo", "Equipe") : "Sistema");
  const tabs: [string, string][] = [["", T("Todas", "Todas")], ["equipe", T("Esperando al equipo", "Esperando a equipe")], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]];

  return (
    <div className="max-w-4xl space-y-5">
      <AutoRefresh ms={20000} />
      <div>
        <h1 className="flex items-center gap-3 text-xl font-bold"><GeovanaAvatar size={40} />{T("Conversaciones", "Conversas")}</h1>
        <p className="text-sm text-muted">{T("WhatsApp e Instagram en una sola bandeja. La Geovana responde; cuando alguien del equipo responde, ella hace una pausa en esa conversación.", "WhatsApp e Instagram numa caixa só. A Geovana responde; quando alguém da equipe responde, ela pausa naquela conversa.")}</p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
      <div className="flex flex-wrap gap-1 text-xs">
        {tabs.map(([k, label]) => (
          <Link key={k} href={k ? `?canal=${k}` : "?"} className={`rounded-lg border border-transparent px-3 py-1.5 font-semibold ${(sp.canal ?? "") === k ? "btn bg-ink text-white" : "btn-ghost"}`}>{label}</Link>
        ))}
        {!igOn || !ig.length ? <Link href={`/painel/${slug}/instagram`} className="ml-auto px-3 py-1.5 font-semibold underline">{T("Conectar Instagram", "Conectar Instagram")}</Link> : null}
      </div>
      {waiting > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>{waiting}</b> {T("conversación(es) esperando a alguien del equipo.", "conversa(s) esperando alguém da equipe.")}</p>}
      {!items.length ? (
        <p className="card p-5 text-sm text-muted">{T("Todavía no hay conversaciones.", "Ainda não há conversas.")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.key} className={`card p-4 text-sm ${c.needsHuman ? "border-amber-300" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.net === "instagram" ? "bg-pink-100 text-pink-800" : "bg-emerald-100 text-emerald-800"}`}>{c.net === "instagram" ? "Instagram" : "WhatsApp"}</span>
                <b className="min-w-0 flex-1 truncate">{c.label}</b>
                <span className="text-xs text-muted">{fmtDate(c.at)}</span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {c.messages.slice(-4).map((m) => (
                  <p key={m.id} className="line-clamp-2"><span className="font-semibold">{who(m.role)}:</span> {m.text}</p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {c.needsHuman && <span className="rounded-full bg-amber-200 px-2 py-1 font-semibold text-amber-900">{T("esperando al equipo", "esperando a equipe")}</span>}
                {c.paused && <span className="rounded-full bg-black/5 px-2 py-1 font-semibold">{T("IA en pausa", "IA pausada")}</span>}
                {c.link && <a className="btn-ghost px-2 py-1" target="_blank" rel="noopener noreferrer" href={c.link}>{c.net === "instagram" ? "Instagram ↗" : "WhatsApp ↗"}</a>}
                {c.net === "whatsapp" ? (
                  c.paused ? (
                    <form action={waPauseAction.bind(null, slug, c.id, 0)}><button className="btn-ghost px-2 py-1">{T("Volver a la IA", "Devolver para a IA")}</button></form>
                  ) : (
                    <form action={waPauseAction.bind(null, slug, c.id, 240)}><button className="btn-ghost px-2 py-1">{T("Atiendo yo (4 h)", "Eu atendo (4 h)")}</button></form>
                  )
                ) : (
                  (c.paused || c.needsHuman) && <form action={igResumeAction.bind(null, slug, "conversas", c.id)}><button className="btn-ghost px-2 py-1">{T("Volver a la IA", "Devolver para a IA")}</button></form>
                )}
              </div>
              {c.net === "instagram" &&
                (c.windowOpen ? (
                  <form action={igReplyAction.bind(null, slug, "conversas", c.id)} className="mt-3 flex gap-2">
                    <input name="text" required maxLength={1000} className="input min-w-0 flex-1" placeholder={T("Responder en Instagram…", "Responder no Instagram…")} />
                    <button className="btn-brand px-3">{T("Enviar", "Enviar")}</button>
                  </form>
                ) : (
                  <p className="mt-3 text-xs text-muted">{T("Pasaron 24 h del último mensaje: Instagram solo deja responder cuando el cliente vuelva a escribir.", "Passaram 24 h da última mensagem: o Instagram só deixa responder quando o cliente escrever de novo.")}</p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
