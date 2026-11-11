import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { AutoRefresh } from "@/components/AutoRefresh";
import { formatPhone } from "@/core/region";
import { gwChatMessages, gwChatsList } from "@/services/goweb-bot";
import { igChatsFor } from "@/services/instagram";
import { igGowebReplyAction, igGowebResumeAction, waGowebReplyAction, waGowebResumeAction } from "../../ig-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversas · Geovana" };

type Item = { key: string; net: "whatsapp" | "instagram"; id: string; label: string; tag: string | null; at: Date; needsHuman: boolean; paused: boolean; canReply: boolean; link: string | null; messages: { id: string; role: string; text: string }[] };
const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Caixa unificada da GoWeb: WhatsApp e Instagram da própria GoWeb, mais recente primeiro. */
export default async function AdminConversas({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; canal?: string }> }) {
  const sp = await searchParams;
  await requirePlatformAdmin();
  const now = new Date();
  const [wa, ig] = await Promise.all([gwChatsList(30), igChatsFor("goweb", 30)]);
  const waMsgs = await Promise.all(wa.map((c) => gwChatMessages(c.id)));
  let items: Item[] = [
    ...wa.map((c, i) => ({
      key: `wa-${c.id}`,
      net: "whatsapp" as const,
      id: c.id,
      label: c.name ?? formatPhone(c.phone),
      tag: c.tenantId ? "lojista" : c.affiliateId ? "afiliado" : c.leadId ? "lead" : null,
      at: [c.lastUserAt, c.lastBotAt, c.createdAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0],
      needsHuman: c.needsHuman,
      paused: !!c.pausedUntil && c.pausedUntil > now,
      canReply: true,
      link: `https://wa.me/${c.phone.replace(/\D/g, "")}`,
      messages: waMsgs[i].slice(-4),
    })),
    ...ig.map((c) => ({ key: `ig-${c.id}`, net: "instagram" as const, id: c.id, label: c.label, tag: c.leadId ? "lead" : null, at: c.lastAt, needsHuman: c.needsHuman, paused: !!c.pausedUntil && c.pausedUntil > now, canReply: c.windowOpen, link: c.username ? `https://ig.me/m/${c.username}` : null, messages: c.messages.slice(-4) })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  if (sp.canal === "whatsapp" || sp.canal === "instagram") items = items.filter((i) => i.net === sp.canal);
  if (sp.canal === "socio") items = items.filter((i) => i.needsHuman);
  const tabs: [string, string][] = [["", "Todas"], ["socio", "Esperando um sócio"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]];
  const who = (r: string) => (r === "user" ? "Contato" : r === "ai" ? "Geovana" : r === "staff" ? "Sócio" : "Sistema");

  return (
    <div className="max-w-4xl space-y-5">
      <AutoRefresh ms={20000} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Conversas da GoWeb</h1>
          <p className="text-sm text-muted">WhatsApp e Instagram numa caixa só. Responder daqui pausa a IA naquela conversa.</p>
        </div>
        <Link href="/admin/geovana" className="btn-ghost px-3 py-1.5 text-xs font-semibold">WhatsApp</Link>
        <Link href="/admin/geovana/instagram" className="btn-ghost px-3 py-1.5 text-xs font-semibold">Instagram</Link>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap gap-1 text-xs">
        {tabs.map(([k, l]) => (
          <Link key={k} href={k ? `?canal=${k}` : "?"} className={`rounded-lg border border-transparent px-3 py-1.5 font-semibold ${(sp.canal ?? "") === k ? "btn bg-ink text-white" : "btn-ghost"}`}>{l}</Link>
        ))}
      </div>
      {!items.length ? (
        <p className="card p-5 text-sm text-muted">Nenhuma conversa ainda.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.key} className={`card p-4 text-sm ${c.needsHuman ? "border-amber-300" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.net === "instagram" ? "bg-pink-100 text-pink-800" : "bg-emerald-100 text-emerald-800"}`}>{c.net === "instagram" ? "Instagram" : "WhatsApp"}</span>
                <b className="min-w-0 flex-1 truncate">{c.label}</b>
                {c.tag && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold">{c.tag}</span>}
                <span className="text-xs text-muted">{fmt(c.at)}</span>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                {c.messages.map((m) => (
                  <p key={m.id} className="line-clamp-2"><span className="font-semibold">{who(m.role)}:</span> {m.text}</p>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {c.needsHuman && <span className="rounded-full bg-amber-200 px-2 py-1 font-semibold text-amber-900">esperando um sócio</span>}
                {c.paused && <span className="rounded-full bg-black/5 px-2 py-1 font-semibold">IA pausada</span>}
                {c.link && <a className="btn-ghost px-2 py-1" target="_blank" rel="noopener noreferrer" href={c.link}>Abrir ↗</a>}
                {(c.paused || c.needsHuman) && (
                  <form action={(c.net === "instagram" ? igGowebResumeAction : waGowebResumeAction).bind(null, c.id)}><button className="btn-ghost px-2 py-1">Devolver para a IA</button></form>
                )}
              </div>
              {c.canReply ? (
                <form action={(c.net === "instagram" ? igGowebReplyAction : waGowebReplyAction).bind(null, c.id)} className="mt-3 flex gap-2">
                  <input name="text" required maxLength={c.net === "instagram" ? 1000 : 2000} className="input min-w-0 flex-1" placeholder={`Responder no ${c.net === "instagram" ? "Instagram" : "WhatsApp"}…`} />
                  <button className="btn-brand px-3">Enviar</button>
                </form>
              ) : (
                <p className="mt-3 text-xs text-muted">Passaram 24 h da última mensagem: o Instagram só deixa responder quando a pessoa escrever de novo.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
