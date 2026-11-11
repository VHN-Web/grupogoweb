import { CourierShell } from "@/components/courier/CourierShell";
import { CourierPush } from "@/components/courier/CourierPush";
import { CourierLogoutForm } from "@/components/courier/CourierNative";
import { formatPhone } from "@/core/region";
import { courierLogout } from "../actions";
import { courierCtx } from "../ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conta" };

export default async function CourierAccount() {
  const { courier: c, tenant, T, shell, native, android } = await courierCtx();
  return (
    <CourierShell {...shell} tab="conta">
      <h1 className="text-xl font-bold">{T("Mi cuenta", "Minha conta")}</h1>
      <section className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
        <p className="text-lg font-bold">{c.name}</p>
        <p className="text-[var(--s-muted)]">{formatPhone(c.phone)}{c.vehicle && ` · ${c.vehicle}`}</p>
        <p className="mt-2">{T("Tienda", "Loja")}: <b>{tenant.name}</b></p>
        {tenant.whatsapp && <a className="btn-ghost mt-3 py-2 text-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${tenant.whatsapp.replace(/\D/g, "")}`}>{T("Hablar con la tienda", "Falar com a loja")}</a>}
      </section>

      <section className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5">
        <h2 className="font-bold">{T("Notificaciones", "Notificações")}</h2>
        <p className="mb-3 mt-1 text-sm text-[var(--s-muted)]">{T("Te avisamos cuando la tienda te asigne una entrega o haya un pedido esperando repartidor.", "Avisamos quando a loja passar uma entrega para você ou houver pedido esperando entregador.")}</p>
        <CourierPush
          t={{
            enable: T("Activar notificaciones", "Ligar notificações"),
            on: T("Notificaciones activas", "Notificações ligadas"),
            off: T("Desactivar", "Desligar"),
            ios: T("En iPhone las notificaciones funcionan solo con la app instalada: Safari → Compartir → Agregar a inicio. Después abrila por el ícono.", "No iPhone as notificações só funcionam com o app instalado: Safari → Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone."),
            unsupported: T("Este navegador no acepta notificaciones.", "Este navegador não aceita notificações."),
            denied: T("Notificaciones bloqueadas: habilitalas en la configuración del navegador.", "Notificações bloqueadas: libere nas configurações do navegador."),
            fail: T("No se pudieron activar en este celular.", "Não deu para ligar neste celular."),
            settings: T("Abrir configuración", "Abrir configurações"),
            onlineOnly: T("Por ahora los avisos llegan mientras estés online.", "Por enquanto os avisos chegam enquanto você estiver online."),
          }}
        />
      </section>

      {native ? (
        <section id="instalar" className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
          <h2 className="font-bold">{T("Para que el GPS funcione bien", "Para o GPS funcionar bem")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--s-muted)]">
            <li>{T("Mientras estés online la app envía tu ubicación aunque la cierres o bloquees la pantalla. Un aviso fijo en las notificaciones lo indica; desde ahí también podés ponerte offline.", "Enquanto você estiver online o app envia sua localização mesmo fechado ou com a tela bloqueada. Um aviso fixo nas notificações mostra isso; por ele você também pode ficar offline.")}</li>
            <li>{T("Permití la ubicación \"precisa\" y, si el celular pregunta, que la app no tenga restricciones de batería.", "Permita a localização \"precisa\" e, se o celular perguntar, deixe o app sem restrição de bateria.")}</li>
            <li>{T("Podés usar Google Maps o Waze normalmente: la ubicación sigue enviándose.", "Pode usar Google Maps ou Waze normalmente: a localização continua sendo enviada.")}</li>
            <li>{T("Nueva entrega abre a pantalla completa y suena por 30 s. Si fue asignada automáticamente y no respondés, pasa al siguiente repartidor.", "Entrega nova abre em tela cheia e toca por 30 s. Se foi passada automaticamente e você não responder, ela vai para o próximo entregador.")}</li>
            <li>{T("Xiaomi/Redmi/POCO: en Configuración → Apps → Entregas → Otros permisos, activá \"Mostrar ventanas emergentes en segundo plano\".", "Xiaomi/Redmi/POCO: em Configurações → Apps → Entregas → Outras permissões, ative \"Exibir janelas pop-up ao executar em segundo plano\".")}</li>
          </ul>
        </section>
      ) : (
        <section id="instalar" className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
          <h2 className="font-bold">{T("Instalar la app", "Instalar o app")}</h2>
          <ul className="mt-2 space-y-2 text-[var(--s-muted)]">
            <li><b className="text-[var(--s-ink)]">Android:</b> {T("app propia, que envía la ubicación con la pantalla apagada.", "app próprio, que envia a localização com a tela desligada.")} <a href="/entregador/baixar" className="font-semibold text-[var(--s-ink)] underline">{T("Descargar", "Baixar")}</a>{android && <> · <a href="/entregador/abrir-app" className="font-semibold text-[var(--s-ink)] underline">{T("Abrir en la app", "Abrir no app")}</a></>}</li>
            <li><b className="text-[var(--s-ink)]">iPhone (Safari):</b> {T("Compartir → Agregar a inicio.", "Compartilhar → Adicionar à Tela de Início.")}</li>
          </ul>
          <h2 className="mt-4 font-bold">{T("Para que el GPS funcione bien", "Para o GPS funcionar bem")}</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--s-muted)]">
            <li>{T("Permití la ubicación \"precisa\" para este sitio.", "Permita a localização \"precisa\" para este site.")}</li>
            <li>{T("Dejá la app abierta en pantalla durante la entrega (la pantalla queda encendida sola). Con la app cerrada el celular deja de enviar la ubicación.", "Deixe o app aberto na tela durante a entrega (a tela fica ligada sozinha). Com o app fechado o celular para de enviar a localização.")}</li>
            <li>{T("Para navegar, usá Google Maps/Waze en pantalla dividida o volvé a la app al llegar.", "Para navegar, use Google Maps/Waze em tela dividida ou volte ao app ao chegar.")}</li>
          </ul>
        </section>
      )}

      <CourierLogoutForm action={courierLogout} label={T("Salir de este celular", "Sair deste celular")} />
    </CourierShell>
  );
}
