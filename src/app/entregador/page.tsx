import { CourierShell } from "@/components/courier/CourierShell";
import { CourierTracker } from "@/components/courier/CourierTracker";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { Icon } from "@/components/ui/Icon";
import { formatPhone } from "@/core/region";
import { formatMoney } from "@/core/money";
import type { Currency } from "@/core/types";
import { courierEarnings, myActiveDeliveries, openDeliveries } from "@/services/courier-app";
import { courierEarning } from "@/core/couriers";
import { claimAction, declineAction, deliverAction, pickupAction, toggleOnlineAction } from "./actions";
import { courierCtx } from "./ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entregas" };

export default async function CourierHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; bemvindo?: string }> }) {
  const sp = await searchParams;
  const { courier: c, tenant, T, fm, fmtTime, shell, native, android } = await courierCtx();
  const [mine, open, earn] = await Promise.all([myActiveDeliveries(c), c.online ? openDeliveries(c) : Promise.resolve([]), courierEarnings(c, tenant)]);
  const sig = mine.map((o) => `${o.id}:${o.status}`).join(",");
  const STATUS: Record<string, string> = {
    RECEIVED: T("Recibido", "Recebido"),
    PREPARING: T("En preparación", "Em preparo"),
    READY: T("Listo para retirar", "Pronto para retirar"),
    OUT_FOR_DELIVERY: T("En camino", "A caminho"),
  };

  return (
    <CourierShell {...shell} tab="home">
      {sp.bemvindo && (
        <p className="mb-4 rounded-2xl bg-[var(--s-good-bg)] p-4 text-sm text-[var(--s-good-fg)]">
          <b>{T(`¡Hola, ${c.name.split(" ")[0]}!`, `Olá, ${c.name.split(" ")[0]}!`)}</b>{" "}
          {native
            ? T("Todo listo. Ponete online y permití la ubicación y las notificaciones: la app sigue enviando tu ubicación aunque la cierres.", "Tudo pronto. Fique online e permita a localização e as notificações: o app continua enviando sua localização mesmo fechado.")
            : android
              ? T("Instalá la app Android para enviar la ubicación con la pantalla apagada y recibir avisos.", "Instale o app Android para enviar a localização com a tela desligada e receber avisos.")
              : T("Instalá esta app en tu celular (menú del navegador → Agregar a pantalla de inicio) para abrirla como una app.", "Instale este app no celular (menu do navegador → Adicionar à tela inicial) para abrir como um aplicativo.")}
          {!native && android && (
            <span className="mt-3 flex flex-wrap gap-2">
              <a href="/entregador/baixar" className="btn-brand py-2 text-sm"><Icon name="download" size={16} /> {T("Descargar la app", "Baixar o app")}</a>
              <a href="/entregador/abrir-app" className="btn-ghost py-2 text-sm">{T("Ya la tengo: abrir en la app", "Já tenho: abrir no app")}</a>
            </span>
          )}
        </p>
      )}
      {!sp.bemvindo && !native && android && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-3 text-sm">
          <span className="min-w-0 flex-1">{T("Con la app Android la ubicación sigue enviándose con la pantalla apagada.", "Com o app Android a localização continua sendo enviada com a tela desligada.")}</span>
          <a href="/entregador/abrir-app" className="btn-ghost py-1.5 text-xs">{T("Abrir en la app", "Abrir no app")}</a>
          <a href="/entregador/baixar" className="btn-brand py-1.5 text-xs">{T("Descargar", "Baixar")}</a>
        </p>
      )}
      {sp.ok && <p className="mb-4 rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      {sp.err && <p className="mb-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-500">{sp.err}</p>}

      {/* online / offline */}
      <section className={`rounded-3xl p-5 ${c.online ? "bg-[#12351f] text-[#E8F7EE]" : "bg-[var(--s-card)] border border-[var(--s-line)]"}`}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{c.online ? T("Estás online", "Você está online") : T("Estás offline", "Você está offline")}</p>
            <p className={`text-sm ${c.online ? "text-[#B5E5C6]" : "text-[var(--s-muted)]"}`}>
              {c.online ? T("La tienda te ve en el mapa y podés tomar entregas.", "A loja vê você no mapa e você pode pegar entregas.") : T("Ponete online para recibir entregas y compartir tu ubicación.", "Fique online para receber entregas e compartilhar sua localização.")}
            </p>
          </div>
          <form action={toggleOnlineAction}>
            <input type="hidden" name="online" value={c.online ? "0" : "1"} />
            <SubmitButton pending="" className={`grid h-16 w-16 place-items-center rounded-full text-xs font-black uppercase shadow-lg ${c.online ? "bg-white/15 text-white" : "bg-[#3CC46B] text-[#0E0E10]"}`}>
              {c.online ? T("Salir", "Sair") : T("Entrar", "Ficar on")}
            </SubmitButton>
          </form>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className={`rounded-2xl p-2.5 ${c.online ? "bg-white/10" : "bg-[var(--s-soft)]"}`}><p className="text-xl font-black tabular-nums">{earn.today.count}</p><p className="text-[11px] opacity-80">{T("entregas hoy", "entregas hoje")}</p></div>
          <div className={`rounded-2xl p-2.5 ${c.online ? "bg-white/10" : "bg-[var(--s-soft)]"}`}><p className="truncate text-xl font-black tabular-nums">{fm(earn.today.total)}</p><p className="text-[11px] opacity-80">{T("ganado hoy", "ganho hoje")}</p></div>
          <div className={`rounded-2xl p-2.5 ${c.online ? "bg-white/10" : "bg-[var(--s-soft)]"}`}><p className="truncate text-xl font-black tabular-nums">{c.online && c.onlineSince ? fmtTime(c.onlineSince) : "—"}</p><p className="text-[11px] opacity-80">{T("online desde", "online desde")}</p></div>
        </div>
      </section>

      <div className="mt-3">
        <CourierTracker
          online={c.online}
          sig={sig}
          t={{
            waiting: T("Buscando GPS… permití la ubicación si el celular lo pide.", "Buscando GPS… permita a localização se o celular pedir."),
            ok: T("Ubicación en vivo", "Localização ao vivo"),
            ago: T("enviada hace {s}s", "enviada há {s}s"),
            denied: native ? T("Ubicación bloqueada: permitila para la app en la configuración del celular.", "Localização bloqueada: permita para o app nas configurações do celular.") : T("Ubicación bloqueada: habilitala para este sitio en la configuración del navegador.", "Localização bloqueada: libere para este site nas configurações do navegador."),
            unsupported: T("Este navegador no comparte ubicación.", "Este navegador não compartilha localização."),
            weak: T("Señal de GPS débil: salí al aire libre o activá el modo de alta precisión.", "Sinal de GPS fraco: vá para céu aberto ou ative a alta precisão."),
            screen: T("Dejá la app abierta durante la entrega", "Deixe o app aberto durante a entrega"),
            screenOn: T("Pantalla siempre encendida", "Tela sempre ligada"),
            background: T("Funciona con la app cerrada y la pantalla bloqueada (aviso fijo en las notificaciones).", "Funciona com o app fechado e a tela bloqueada (aviso fixo nas notificações)."),
            settings: T("Abrir configuración", "Abrir configurações"),
            battery: T("Que Android no pause el GPS", "Não deixar o Android pausar o GPS"),
            offlineNet: T("Sin internet: la ubicación se envía cuando vuelva la señal.", "Sem internet: a localização é enviada quando o sinal voltar."),
          }}
        />
      </div>

      {/* minhas entregas */}
      <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-[.14em] text-[var(--s-muted)]">{T("Mis entregas", "Minhas entregas")} · {mine.length}</h2>
      {mine.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[var(--s-line)] p-5 text-center text-sm text-[var(--s-muted)]">
          {c.online ? T("Ninguna entrega ahora. Te avisamos cuando la tienda te asigne una.", "Nenhuma entrega agora. Avisamos quando a loja passar uma para você.") : T("Ponete online para empezar.", "Fique online para começar.")}
        </p>
      )}
      <div className="space-y-3">
        {mine.map((o) => {
          const base = tenant.currency as Currency;
          const paid = o.paymentStatus === "PAID";
          const collect = paid ? null : formatMoney(o.payAmountMinor, o.payCurrency as Currency);
          const nav = o.lat != null && o.lng != null ? `${o.lat},${o.lng}` : o.address ? encodeURIComponent(o.address) : null;
          const going = o.status === "OUT_FOR_DELIVERY";
          return (
            <article key={o.id} className={`rounded-3xl border p-4 ${going ? "border-[#3CC46B] bg-[var(--s-card)]" : "border-[var(--s-line)] bg-[var(--s-card)]"}`}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-black tabular-nums">#{o.number}</p>
                  <p className="text-sm font-semibold">{o.customerName}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${going ? "bg-[#3CC46B]/20 text-[#2FAE5F]" : o.status === "READY" ? "bg-amber-400/20 text-amber-600" : "bg-[var(--s-soft)] text-[var(--s-muted)]"}`}>{STATUS[o.status] ?? o.status}</span>
              </div>
              {o.address && <p className="mt-2 flex gap-2 text-sm"><Icon name="pin" size={16} className="mt-0.5 shrink-0" /> {o.address}</p>}
              <p className="mt-1 text-xs text-[var(--s-muted)]">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
              {o.notes && <p className="mt-1 text-xs"><b>{T("Obs.", "Obs.")}:</b> {o.notes}</p>}
              <div className={`mt-3 rounded-2xl px-3 py-2 text-sm font-semibold ${paid ? "bg-[var(--s-good-bg)] text-[var(--s-good-fg)]" : "bg-amber-400/15 text-amber-700 dark:text-amber-400"}`}>
                {paid ? T("Ya pagado ✓", "Já pago ✓") : `${T("Cobrar", "Cobrar")} ${collect}${o.changeDuePyg ? ` · ${T("llevar vuelto", "levar troco")} ${formatMoney(o.changeDuePyg, base)}` : ""}`}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {nav && (
                  <>
                    <a className="btn-ghost py-2 text-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${nav}&travelmode=driving`}><Icon name="pin" size={16} /> Google Maps</a>
                    {o.lat != null && <a className="btn-ghost py-2 text-sm" target="_blank" rel="noopener noreferrer" href={`https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`}>Waze</a>}
                  </>
                )}
                {o.customerPhone && (
                  <>
                    <a className="btn-ghost py-2 text-sm" href={`tel:${o.customerPhone}`}><Icon name="phone" size={16} /> {T("Llamar", "Ligar")}</a>
                    <a className="btn-ghost py-2 text-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${o.customerPhone.replace(/\D/g, "")}`} title={formatPhone(o.customerPhone)}><Icon name="chat" size={16} /> WhatsApp</a>
                  </>
                )}
              </div>
              <div className="mt-3 border-t border-[var(--s-line)] pt-3">
                {!going ? (
                  <div className="space-y-2">
                    {o.autoAssigned && <p className="text-center text-xs text-[var(--s-muted)]">{T("Te la pasamos por estar cerca de la tienda.", "Passamos para você por estar perto da loja.")}</p>}
                    <form action={pickupAction.bind(null, o.id)}>
                      <SubmitButton pending="" className="btn-brand w-full justify-center py-3 text-base">{T("Salí con el pedido", "Saí com o pedido")}</SubmitButton>
                    </form>
                    {o.autoAssigned && (
                      <form action={declineAction.bind(null, o.id)}>
                        <SubmitButton pending="" className="w-full rounded-2xl border border-[var(--s-line)] py-2.5 text-sm font-semibold text-[var(--s-muted)]">{T("No puedo llevarla", "Não consigo levar")}</SubmitButton>
                      </form>
                    )}
                  </div>
                ) : (
                  <form action={deliverAction.bind(null, o.id)} className="space-y-2">
                    {!paid && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="collected" className="h-5 w-5" /> {T(`Recibí el pago (${collect})`, `Recebi o pagamento (${collect})`)}
                      </label>
                    )}
                    <SubmitButton pending="" className="btn-brand w-full justify-center py-3 text-base">{T("Entregado ✓", "Entreguei ✓")}</SubmitButton>
                  </form>
                )}
                <p className="mt-2 text-center text-xs text-[var(--s-muted)]">{T("Tu ganancia en esta entrega", "Seu ganho nesta entrega")}: <b className="text-[var(--s-ink)]">{fm(courierEarning(o.deliveryFeePyg, c.feePerDelivery))}</b></p>
              </div>
            </article>
          );
        })}
      </div>

      {/* entregas livres */}
      {c.online && (
        <>
          <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-[.14em] text-[var(--s-muted)]">{T("Entregas disponibles", "Entregas disponíveis")} · {open.length}</h2>
          {open.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--s-line)] p-4 text-center text-sm text-[var(--s-muted)]">{T("No hay pedidos esperando repartidor.", "Nenhum pedido esperando entregador.")}</p>
          ) : (
            <div className="space-y-2">
              {open.map((o) => (
                <form key={o.id} action={claimAction.bind(null, o.id)} className="flex items-center gap-3 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">#{o.number} <span className="text-xs font-semibold text-[var(--s-muted)]">· {STATUS[o.status]}</span></p>
                    <p className="truncate text-xs text-[var(--s-muted)]">{o.address ?? "—"}{o.distanceKm != null && ` · ${o.distanceKm.toFixed(1)} km`}</p>
                    <p className="text-xs">{T("Ganás", "Você ganha")} <b>{fm(courierEarning(o.deliveryFeePyg, c.feePerDelivery))}</b></p>
                  </div>
                  <SubmitButton pending="" className="btn-brand py-2 text-sm">{T("Tomar", "Pegar")}</SubmitButton>
                </form>
              ))}
            </div>
          )}
        </>
      )}
    </CourierShell>
  );
}
