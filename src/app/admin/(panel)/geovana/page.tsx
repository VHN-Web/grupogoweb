import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { Simulator } from "@/components/geovana/Simulator";
import { FLYERS } from "@/core/goweb-bot";
import { whatsappPlatform } from "@/services/geovana";
import { evoConnect } from "@/adapters/whatsapp/evolution";
import { evoServer } from "@/services/geovana";
import { gwBotConfig, gwChatMessages, gwChatsList, gwStatus } from "@/services/goweb-bot";
import { gwConnectAction, gwDisconnectAction, gwReplyAction, gwResumeAction, gwSaveAction, gwSimulateAction } from "../gw-bot-actions";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function GwBotPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; qr?: string; chat?: string; sim?: string }> }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const [cfg, st, plat, chats] = await Promise.all([gwBotConfig(), gwStatus(), whatsappPlatform(), gwChatsList()]);
  const qr = sp.qr && cfg.instance && !st.connected ? await evoServer().then((s) => evoConnect(s, cfg.instance)).catch(() => null) : null;
  const sel = sp.chat ? chats.find((c) => c.id === sp.chat) : null;
  const msgs = sel ? await gwChatMessages(sel.id) : [];
  const sim = sp.sim === "store" || sp.sim === "affiliate" ? sp.sim : "lead";
  const waiting = chats.filter((c) => c.needsHuman).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {(qr || sel) && <AutoRefresh ms={qr ? 8000 : 15000} />}
      <Flash ok={sp.ok} err={sp.err} />
      <div>
        <h1 className="text-xl font-bold">Geovana da GoWeb</h1>
        <p className="text-sm text-muted">
          A IA no WhatsApp da própria GoWeb: explica planos e preços, manda os links, marca conversa com um sócio, cria o lead no CRM com a origem do panfleto, abre chamado para lojas clientes, atende afiliados, avisa quando um lead esquenta e faz o retorno automático.
        </p>
      </div>

      <section className="card space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 font-semibold">1. WhatsApp da GoWeb</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.connected ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{st.connected ? "Conectado" : "Não conectado"}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.enabled ? "bg-emerald-100 text-emerald-800" : "bg-black/5"}`}>{cfg.enabled ? "IA respondendo" : "IA desligada"}</span>
        </div>
        {!plat.evolutionUrl ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Ligue primeiro o servidor Evolution em <Link className="underline" href="/admin/config#geovana">Configurações → Geovana</Link>.</p>
        ) : st.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-muted">Mensagens que chegam no número da GoWeb passam pela Geovana. Se um sócio responder pelo celular, ela pausa naquela conversa por {cfg.pauseMinutes} min.</p>
            <form action={gwDisconnectAction}><SubmitButton className="btn-ghost text-xs text-red-600" pending="Desconectando…">Desconectar</SubmitButton></form>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted">No celular da GoWeb: WhatsApp → Aparelhos conectados → Conectar um aparelho → escaneie o QR.</p>
            {qr?.base64 ? (
              <div className="flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.base64.startsWith("data:") ? qr.base64 : `data:image/png;base64,${qr.base64}`} alt="QR Code" className="keep-light h-56 w-56 rounded-xl bg-white p-2" />
                <p className="max-w-xs text-xs text-muted">O QR muda a cada poucos segundos; esta página se atualiza sozinha.{qr.pairingCode ? <> Ou use o código <b className="font-mono">{qr.pairingCode}</b>.</> : null}</p>
              </div>
            ) : (
              <form action={gwConnectAction}><SubmitButton className="btn-brand" pending="Gerando QR…">Gerar QR Code</SubmitButton></form>
            )}
          </div>
        )}
      </section>

      <form action={gwSaveAction} className="card grid gap-3 p-5 text-sm sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">2. Como ela atende</h2>
        <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> <b>Geovana respondendo</b> no WhatsApp da GoWeb</label>
        <label className="grid gap-1 sm:col-span-2">Informações extras para ela (promoção de lançamento, prazos, observações)
          <textarea name="extra" rows={4} className="input" defaultValue={cfg.extra} placeholder="Ex.: Lançamento 12/11: implantação em até 5 dias úteis. Atendemos todo o Brasil." />
        </label>
        <label className="grid gap-1">Horário em que um sócio conversa (para agendar)<input name="hours" className="input" defaultValue={cfg.hours} /></label>
        <label className="grid gap-1">Se um sócio responder, a IA pausa por (min)<input name="pauseMinutes" type="number" min={5} max={1440} className="input" defaultValue={cfg.pauseMinutes} /></label>
        <label className="grid gap-1 sm:col-span-2">WhatsApp dos sócios para avisos (lead novo, lead quente, conversa marcada, pediu um sócio) — separe por vírgula
          <input name="partnerPhones" className="input" defaultValue={cfg.partnerPhones.join(", ")} placeholder="81 99999-0000, 81 98888-0000" />
          <span className="text-xs text-muted">Os avisos também chegam como notificação no app do CRM.</span>
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" name="autoFollowUp" defaultChecked={cfg.autoFollowUp} /> Retorno automático para leads que pararam de responder</label>
        <label className="grid gap-1">Depois de quantas horas (ex.: 24, 72)<input name="followUpHours" className="input" defaultValue={cfg.followUpHours.join(", ")} /></label>
        <fieldset className="grid gap-2 rounded-xl border border-line p-3 sm:col-span-2">
          <legend className="px-1 text-xs font-semibold">Lembretes automáticos para as lojas (WhatsApp da GoWeb, 9h–19h, sem repetir)</legend>
          <label className="flex items-center gap-2"><input type="checkbox" name="setupNudges" defaultChecked={cfg.setupNudges} /> Passo a passo: lembra o lojista do próximo passo da configuração (a cada 2 dias, até a loja ficar pronta)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="idleNudges" defaultChecked={cfg.idleNudges} /> Loja parada: 7+ dias sem pedido → dicas ao lojista e aviso aos sócios (1x por semana)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="billingNudges" defaultChecked={cfg.billingNudges} /> Cobrança gentil: fatura 3 dias antes, no dia, 1 e 3 dias depois, com o link de pagamento</label>
        </fieldset>
        <p className="text-xs text-muted sm:col-span-2">Retornos só entre 9h e 20h, nunca para quem pediu para parar (“parar”, “sair”), e param quando o lead fecha ou é perdido no CRM.</p>
        <div className="sm:col-span-2"><SubmitButton className="btn-primary" pending="Salvando…">Salvar</SubmitButton></div>
      </form>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-3 p-5 text-sm">
          <h2 className="font-semibold">3. Teste</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(["lead", "store", "affiliate"] as const).map((k) => (
              <Link key={k} href={`?sim=${k}`} className={`rounded-lg px-2.5 py-1 font-semibold ${sim === k ? "bg-ink text-white" : "btn-ghost"}`}>{k === "lead" ? "Como dono de comércio" : k === "store" ? "Como lojista cliente" : "Como afiliado"}</Link>
            ))}
          </div>
          <Simulator key={sim} name="Geovana · GoWeb" run={gwSimulateAction.bind(null, sim)} placeholder={sim === "lead" ? "Oi, vi o panfleto (cód. P-nao). Quanto custa?" : sim === "store" ? "Meu cardápio não abre no celular" : "Como pego minhas artes?"} />
          <p className="text-xs text-muted">O teste não envia nada nem mexe no CRM; mostra no fim o que o sistema faria (lead, agenda, chamado).</p>
        </div>

        <div className="card p-5 text-sm">
          <h2 className="mb-3 font-semibold">4. Conversas {waiting > 0 && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{waiting} esperando um sócio</span>}</h2>
          {chats.length === 0 ? (
            <p className="text-muted">Ainda não há conversas.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`?chat=${c.id}`} className={`flex items-center gap-2 py-2 ${sel?.id === c.id ? "font-semibold" : ""}`}>
                    <span className="min-w-0 flex-1 truncate">{c.name || c.phone}</span>
                    {c.tenantId && <span className="rounded bg-blue-100 px-1.5 text-[11px]">lojista</span>}
                    {c.affiliateId && <span className="rounded bg-amber-100 px-1.5 text-[11px]">afiliado</span>}
                    {c.flyer && <span className="rounded bg-black/5 px-1.5 text-[11px]" title={FLYERS[c.flyer]}>{c.flyer}</span>}
                    {c.heat >= 60 && <span className="rounded bg-red-100 px-1.5 text-[11px]">quente</span>}
                    {c.needsHuman && <span className="rounded bg-red-600 px-1.5 text-[11px] text-white">sócio</span>}
                    <span className="text-xs text-muted">{fmt(c.lastUserAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {sel && (
        <section className="card space-y-3 p-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 font-semibold">{sel.name || sel.phone} <span className="font-normal text-muted">· {sel.phone}</span></h2>
            {sel.leadId && <Link className="btn-ghost text-xs" href={`/crm/leads/${sel.leadId}`}>Ver lead no CRM</Link>}
            {(sel.needsHuman || (sel.pausedUntil && sel.pausedUntil > new Date())) && (
              <form action={gwResumeAction.bind(null, sel.id)}><button className="btn-ghost text-xs">Devolver para a Geovana</button></form>
            )}
          </div>
          <div className="keep-light max-h-96 space-y-2 overflow-y-auto rounded-xl bg-[#ECE5DD] p-3 text-black">
            {msgs.map((m) => (
              <p key={m.id} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 shadow-sm ${m.role === "user" ? "bg-white" : m.role === "system" ? "mx-auto bg-amber-100 text-xs" : "ml-auto bg-[#DCF8C6]"}`}>
                {m.role === "staff" && <b className="block text-xs text-black/60">Sócio</b>}
                {m.text}
                <span className="mt-1 block text-right text-[10px] text-black/40">{fmt(m.createdAt)}</span>
              </p>
            ))}
          </div>
          <form action={gwReplyAction.bind(null, sel.id)} className="flex gap-2">
            <input name="text" className="input flex-1" placeholder="Responder como sócio (a IA pausa nessa conversa)" autoComplete="off" />
            <SubmitButton className="btn-primary" pending="Enviando…">Enviar</SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
