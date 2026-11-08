import { CourierShell } from "@/components/courier/CourierShell";
import { CourierPush } from "@/components/courier/CourierPush";
import { formatPhone } from "@/core/region";
import { courierLogout } from "../actions";
import { courierCtx } from "../ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conta" };

export default async function CourierAccount() {
  const { courier: c, tenant, T, shell } = await courierCtx();
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
          }}
        />
      </section>

      <section id="instalar" className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
        <h2 className="font-bold">{T("Instalar la app", "Instalar o app")}</h2>
        <ul className="mt-2 space-y-2 text-[var(--s-muted)]">
          <li><b className="text-[var(--s-ink)]">Android (Chrome):</b> {T("menú ⋮ → Instalar app / Agregar a pantalla de inicio.", "menu ⋮ → Instalar app / Adicionar à tela inicial.")}</li>
          <li><b className="text-[var(--s-ink)]">iPhone (Safari):</b> {T("Compartir → Agregar a inicio.", "Compartilhar → Adicionar à Tela de Início.")}</li>
        </ul>
        <h2 className="mt-4 font-bold">{T("Para que el GPS funcione bien", "Para o GPS funcionar bem")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--s-muted)]">
          <li>{T("Permití la ubicación \"precisa\" para este sitio.", "Permita a localização \"precisa\" para este site.")}</li>
          <li>{T("Dejá la app abierta en pantalla durante la entrega (la pantalla queda encendida sola). Con la app cerrada el celular deja de enviar la ubicación.", "Deixe o app aberto na tela durante a entrega (a tela fica ligada sozinha). Com o app fechado o celular para de enviar a localização.")}</li>
          <li>{T("Para navegar, usá Google Maps/Waze en pantalla dividida o volvé a la app al llegar.", "Para navegar, use Google Maps/Waze em tela dividida ou volte ao app ao chegar.")}</li>
        </ul>
      </section>

      <form action={courierLogout} className="mt-6">
        <button className="w-full rounded-2xl border border-[var(--s-line)] py-3 text-sm font-semibold text-red-500">{T("Salir de este celular", "Sair deste celular")}</button>
      </form>
    </CourierShell>
  );
}
