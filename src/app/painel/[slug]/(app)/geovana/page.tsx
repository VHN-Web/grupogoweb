import Link from "next/link";
import { GeovanaAvatar, GeovanaHero } from "@/components/geovana/Geovana";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { GEOVANA_PRESETS, faqToText } from "@/core/geovana";
import { formatPhone } from "@/core/region";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Simulator } from "@/components/geovana/Simulator";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { channelStatus, cloudHookUrl, evolutionHookUrl, evolutionQr, geovanaOf, recentChats, whatsappPlatform } from "@/services/geovana";
import { storeGuardSummary } from "@/services/wa-guard";
import { applyPresetAction, connectCloudAction, connectEvolutionAction, disconnectAction, pauseChatAction, saveGeovanaAction, simulateAction } from "../geovana-actions";

export const dynamic = "force-dynamic";

export default async function GeovanaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string; qr?: string; canal?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, fmtDate } = panelI18n(t);
  const cfg = geovanaOf(t);

  if (t.tier !== "pro") {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">Geovana · {T("IA en tu WhatsApp", "IA no seu WhatsApp")}</h1>
        <div className="mx-auto w-full max-w-[340px] rounded-[28px] bg-gradient-to-br from-[#1F7FD8] to-[#3CC46B] p-3">
          <GeovanaHero locale={t.country === "PY" ? "es" : "pt"} country={t.country} />
        </div>
        <div className="card p-5 text-sm">
          <p>{T("La Geovana atiende a tus clientes en el WhatsApp de la tienda las 24 horas: responde dudas, arma pedidos, informa el estado y avisa cuando sale para entrega.", "A Geovana atende seus clientes no WhatsApp da loja 24 horas: tira dúvidas, monta pedidos, informa o status e avisa quando sai para entrega.")}</p>
          <Link href={`/painel/${slug}/plano`} className="btn-brand mt-4 inline-block">{T("Disponible en GoInteligence", "Disponível no GoInteligence")}</Link>
        </div>
      </div>
    );
  }

  const [st, plat, chats, guard] = await Promise.all([channelStatus(t), whatsappPlatform(), recentChats(t.id), storeGuardSummary(t.id)]);
  const qr = sp.qr && cfg.channel === "evolution" && !st.connected ? await evolutionQr(t).catch(() => null) : null;
  const tab = sp.canal === "oficial" || (cfg.channel === "cloud" && sp.canal !== "qr") ? "cloud" : "evolution";
  const waiting = chats.filter((c) => c.needsHuman).length;

  return (
    <div className="max-w-5xl space-y-6">
      {qr && <AutoRefresh ms={8000} />}
      {guard.stopped && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {T("Envíos de la Geovana en pausa por protección del número", "Envios da Geovana pausados para proteger o número")}: {guard.reason}. {T("Los mensajes quedan en fila y salen cuando se normalice.", "As mensagens ficam na fila e saem quando normalizar.")}
        </p>
      )}
      {cfg.channel !== "none" && (
        <p className="text-xs text-muted">
          {T("Hoy", "Hoje")}: {guard.sent} {T("mensajes enviados", "mensagens enviadas")} ({T("límite", "limite")} {guard.perDay}/24 h){guard.pending ? ` · ${guard.pending} ${T("en fila", "na fila")}` : ""} · IA {guard.tokenPct}% {T("del límite diario", "do limite diário")}. {T("Los clientes que escriban \"parar\" dejan de recibir avisos.", "Clientes que escreverem \"parar\" deixam de receber avisos.")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <GeovanaAvatar size={52} online={st.connected && cfg.enabled} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{cfg.name} · {T("IA en tu WhatsApp", "IA no seu WhatsApp")}</h1>
          <p className="text-sm text-muted">{T("Atiende sola, con la información y las reglas que vos definís. Cuando hace falta, llama a alguien del equipo.", "Atende sozinha, com as informações e regras que você definir. Quando precisa, chama alguém da equipe.")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${st.connected && cfg.enabled ? "bg-emerald-100 text-emerald-800" : st.connected ? "bg-amber-100 text-amber-900" : "bg-black/5 text-muted"}`}>
          {st.connected ? (cfg.enabled ? T("Atendiendo", "Atendendo") : T("Conectada, IA apagada", "Conectada, IA desligada")) : T("WhatsApp no conectado", "WhatsApp não conectado")}
        </span>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
      {waiting > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>{waiting}</b> {T("conversación(es) esperando a alguien del equipo — abajo.", "conversa(s) esperando alguém da equipe — veja abaixo.")}</p>}

      {/* conexão */}
      <section className="card p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{T("1. Conectar el WhatsApp de la tienda", "1. Conectar o WhatsApp da loja")}</h2>
          {st.channel !== "none" && (
            <form action={disconnectAction.bind(null, slug)}><button className="text-xs font-semibold text-red-600">{T("Desconectar", "Desconectar")}</button></form>
          )}
        </div>
        {st.connected ? (
          <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">✓ {st.channel === "cloud" ? `${T("API oficial", "API oficial")} · ${st.detail}` : T("Conectado por QR Code", "Conectado pelo QR Code")}</p>
        ) : (
          <>
            <div className="mt-3 flex gap-1 text-xs">
              <Link href="?canal=qr" className={`rounded-lg border border-transparent px-3 py-1.5 font-semibold ${tab === "evolution" ? "bg-ink text-white" : "btn-ghost"}`}>{T("QR Code (rápido)", "QR Code (rápido)")}</Link>
              <Link href="?canal=oficial" className={`rounded-lg border border-transparent px-3 py-1.5 font-semibold ${tab === "cloud" ? "bg-ink text-white" : "btn-ghost"}`}>{T("API oficial de WhatsApp", "API oficial do WhatsApp")}</Link>
            </div>
            {tab === "evolution" ? (
              <div className="mt-3 space-y-3">
                <p className="text-muted">{T("Usa el mismo número de la tienda: abrí WhatsApp → Dispositivos vinculados → Vincular y escaneá el QR. Recomendado: WhatsApp Business.", "Usa o mesmo número da loja: abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie o QR. Recomendado: WhatsApp Business.")}</p>
                {!plat.evolutionUrl && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{T("La conexión por QR se está activando en GoWeb. Mientras, usá la API oficial.", "A conexão por QR está sendo ativada pela GoWeb. Enquanto isso, use a API oficial.")}</p>}
                {qr?.base64 ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <img src={qr.base64.startsWith("data:") ? qr.base64 : `data:image/png;base64,${qr.base64}`} alt="QR Code" className="keep-light h-56 w-56 rounded-xl bg-white p-2" />
                    <div className="text-muted">
                      <p>{T("El QR se renueva cada pocos segundos; esta página se actualiza sola.", "O QR muda a cada poucos segundos; esta página se atualiza sozinha.")}</p>
                      {qr.pairingCode && <p className="mt-2">{T("O usá el código", "Ou use o código")}: <b className="font-mono text-ink">{qr.pairingCode}</b></p>}
                    </div>
                  </div>
                ) : (
                  <form action={connectEvolutionAction.bind(null, slug)}>
                    <SubmitButton className="btn-brand" pending="…" disabled={!plat.evolutionUrl}>{cfg.instance ? T("Mostrar QR de nuevo", "Mostrar o QR de novo") : T("Generar QR Code", "Gerar QR Code")}</SubmitButton>
                  </form>
                )}
                <p className="text-xs text-muted">{T("Conexión no oficial (WhatsApp Web): no envíe mensajes masivos para evitar bloqueos del número.", "Conexão não oficial (WhatsApp Web): não envie mensagens em massa para evitar bloqueio do número.")}</p>
              </div>
            ) : (
              <form action={connectCloudAction.bind(null, slug)} className="mt-3 grid gap-3 sm:grid-cols-2">
                <p className="text-muted sm:col-span-2">{T("En Meta for Developers: creá una app de tipo Business, agregá WhatsApp y copiá los datos.", "No Meta for Developers: crie um app do tipo Business, adicione o WhatsApp e copie os dados.")}</p>
                <label>Phone Number ID<input name="phoneId" className="input mt-1" inputMode="numeric" defaultValue={cfg.cloudPhoneId} required /></label>
                <label>{T("Token permanente", "Token permanente")}<input name="token" type="password" autoComplete="off" className="input mt-1" required /></label>
                <label>App Secret<input name="appSecret" type="password" autoComplete="off" className="input mt-1" required /></label>
                <SubmitButton className="btn-brand self-end" pending="…">{T("Validar y conectar", "Validar e conectar")}</SubmitButton>
              </form>
            )}
          </>
        )}
        {cfg.channel === "cloud" && cfg.hookToken && (
          <div className="mt-3 rounded-xl bg-black/[.03] p-3 text-xs">
            <p>{T("En Meta → WhatsApp → Configuración → Webhook, pegá:", "Na Meta → WhatsApp → Configuração → Webhook, cole:")}</p>
            <p className="mt-1">URL: <code className="break-all">{cloudHookUrl(cfg.hookToken)}</code></p>
            <p>Verify token: <code>{cfg.cloudVerifyToken}</code> · {T("campo", "campo")} <b>messages</b></p>
          </div>
        )}
        {cfg.channel === "evolution" && cfg.hookToken && <p className="mt-2 text-xs text-muted">Webhook: <code className="break-all">{evolutionHookUrl(cfg.hookToken)}</code></p>}
      </section>

      {/* predefinições */}
      <section className="card p-5 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{T("2. Cómo atiende", "2. Como ela atende")}</h2>
          {t.country === "BR" && <form action={applyPresetAction.bind(null, slug)} className="flex gap-2">
            <select name="preset" className="input !w-auto py-1.5 text-xs">
              {GEOVANA_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button className="btn-ghost py-1.5 text-xs">{T("Usar modelo sugerido", "Usar modelo sugerido")}</button>
          </form>}
        </div>
        <form action={saveGeovanaAction.bind(null, slug)} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-2 sm:col-span-2 rounded-xl bg-[var(--section-soft,#eef8f1)] p-3">
            <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="mt-1" />
            <span><b>{T("Geovana respondiendo", "Geovana respondendo")}</b><span className="block text-xs text-muted">{T("Desactivado: los mensajes se guardan, pero nadie responde automáticamente.", "Desligada: as mensagens ficam registradas, mas ninguém responde automaticamente.")}</span></span>
          </label>
          <label>{T("Nombre de la asistente", "Nome da atendente")}<input name="name" className="input mt-1" defaultValue={cfg.name} maxLength={30} /></label>
          <label>{T("Tono", "Tom de voz")}
            <select name="tone" className="input mt-1" defaultValue={cfg.tone}>
              <option value="amigavel">{T("Amigable", "Amigável")}</option>
              <option value="profissional">{T("Profesional", "Profissional")}</option>
              <option value="descontraido">{T("Descontracturado", "Descontraído")}</option>
            </select>
          </label>
          <label className="sm:col-span-2">{T("Saludo (usá {nome} y {loja})", "Saudação (use {nome} e {loja})")}<input name="greeting" className="input mt-1" defaultValue={cfg.greeting} maxLength={500} /></label>
          <label className="sm:col-span-2">{T("Sobre la tienda (qué vende, diferenciales)", "Sobre a loja (o que vende, diferenciais)")}<textarea name="about" className="input mt-1 min-h-20" defaultValue={cfg.about} maxLength={1500} /></label>
          <label>{T("Horario de atención", "Horário de atendimento")}<input name="hours" className="input mt-1" defaultValue={cfg.hours} placeholder={T("Mar a Dom, 18 a 23 h", "Ter a Dom, 18h às 23h")} /></label>
          <label>{T("Promociones vigentes", "Promoções da semana")}<input name="promos" className="input mt-1" defaultValue={cfg.promos} placeholder={T("2x1 los martes", "Terça: 2 por 1 no X-Burger")} /></label>
          <label className="sm:col-span-2">{T("Reglas (lo que NUNCA debe hacer)", "Regras (o que ela NUNCA deve fazer)")}<textarea name="rules" className="input mt-1 min-h-20" defaultValue={cfg.rules} maxLength={1500} /></label>
          <label className="sm:col-span-2">{T("Preguntas frecuentes — una por línea: Pregunta | Respuesta", "Perguntas frequentes — uma por linha: Pergunta | Resposta")}<textarea name="faq" className="input mt-1 min-h-28 font-mono text-xs" defaultValue={faqToText(cfg.faq)} /></label>
          <label>{T("Palabras que llaman a una persona", "Palavras que chamam uma pessoa")}<input name="handoffWords" className="input mt-1" defaultValue={cfg.handoffWords.join(", ")} /></label>
          <label>{T("Si el equipo responde, la IA pausa por (min)", "Se a equipe responder, a IA pausa por (min)")}<input name="pauseMinutes" type="number" min={5} max={1440} className="input mt-1" defaultValue={cfg.pauseMinutes} /></label>
          <div className="grid gap-2 sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="takeOrders" defaultChecked={cfg.takeOrders} /> {T("Arma el pedido en la charla y manda el link con el carrito listo", "Monta o pedido na conversa e manda o link com o carrinho pronto")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="orderNotices" defaultChecked={cfg.orderNotices} /> {T("Avisos automáticos del pedido (en preparación, salió con el mapa, entregado)", "Avisos automáticos do pedido (em preparo, saiu com o mapa do motoboy, entregue)")}</label>
            <label className="grid gap-1 sm:max-w-md">
              {T("¿Cuándo responde?", "Quando ela responde?")}
              <select name="when" className="input" defaultValue={cfg.when}>
                <option value="open">{T("Solo con la tienda abierta (recomendado)", "Só com a loja aberta (recomendado)")}</option>
                <option value="always">{T("Siempre, día y noche", "Sempre, dia e noite")}</option>
                <option value="closed">{T("Solo con la tienda cerrada", "Só com a loja fechada")}</option>
              </select>
              <span className="text-xs text-muted">{T("Abierta/cerrada = el botón \"Tienda abierta\" del panel.", "Aberta/fechada = o botão \"Loja aberta\" do painel.")}</span>
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" name="closedMessage" defaultChecked={cfg.closedMessage} /> {T("Fuera del horario, avisar que está cerrado (1 vez cada 6 h por cliente)", "Fora do horário, avisar que está fechado (1 vez a cada 6 h por cliente)")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="emojis" defaultChecked={cfg.emojis} /> {T("Usar emojis", "Usar emojis")}</label>
          </div>
          <details className="sm:col-span-2">
            <summary className="cursor-pointer text-xs font-semibold text-muted">{T("Clave propia de IA (opcional)", "Chave própria de IA (opcional)")}</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input name="ownKey" type="password" autoComplete="off" className="input" placeholder={cfg.ownKeySealed ? T("guardada — pegá otra para cambiar", "salva — cole outra para trocar") : "Gemini API key"} />
              {cfg.ownKeySealed && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="clearOwnKey" /> {T("Usar la de GoWeb", "Voltar a usar a da GoWeb")}</label>}
            </div>
          </details>
          <SubmitButton className="btn-primary sm:col-span-2" pending="…">{T("Guardar", "Salvar")}</SubmitButton>
        </form>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">{T("3. Probá antes de activar", "3. Teste antes de ligar")}</h2>
          <p className="mb-3 mt-1 text-xs text-muted">{T("Usa lo que guardaste arriba. No envía nada por WhatsApp.", "Usa o que está salvo acima. Não envia nada pelo WhatsApp.")}</p>
          <Simulator name={cfg.name} run={simulateAction.bind(null, slug)} placeholder={T("Escribí como cliente…", "Escreva como cliente…")} />
        </section>
        <section className="card p-5 text-sm">
          <h2 className="font-semibold">{T("Conversaciones", "Conversas")}</h2>
          {chats.length === 0 ? (
            <p className="mt-2 text-muted">{T("Todavía no hay mensajes.", "Ainda não há mensagens.")}</p>
          ) : (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {chats.map((c) => {
                const paused = c.pausedUntil && c.pausedUntil > new Date();
                return (
                  <li key={c.id} className={`rounded-xl border p-3 ${c.needsHuman ? "border-amber-300 bg-amber-50" : "border-line"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="flex-1">{c.name ?? formatPhone(c.phone)}</b>
                      <span className="text-xs text-muted">{fmtDate(c.lastAt)}</span>
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs">
                      {c.messages.slice(-3).map((m) => (
                        <p key={m.id} className="truncate"><span className="font-semibold">{m.role === "user" ? "Cliente" : m.role === "ai" ? cfg.name : m.role === "staff" ? T("Equipo", "Equipe") : "Sistema"}:</span> {m.text}</p>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <a className="btn-ghost px-2 py-1" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}>WhatsApp ↗</a>
                      {paused ? (
                        <form action={pauseChatAction.bind(null, slug, c.id, 0)}><button className="btn-ghost px-2 py-1">{T("Volver a la IA", "Devolver para a IA")}</button></form>
                      ) : (
                        <form action={pauseChatAction.bind(null, slug, c.id, 240)}><button className="btn-ghost px-2 py-1">{T("Atiendo yo (4 h)", "Eu atendo (4 h)")}</button></form>
                      )}
                      {c.needsHuman && <span className="rounded-full bg-amber-200 px-2 py-1 font-semibold text-amber-900">{T("esperando al equipo", "esperando a equipe")}</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
