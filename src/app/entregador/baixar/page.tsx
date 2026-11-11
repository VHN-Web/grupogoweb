import { headers } from "next/headers";
import { Icon } from "@/components/ui/Icon";
import { isAndroidUA, isCourierNativeUA } from "@/core/courier-native";

export const dynamic = "force-dynamic";
export const metadata = { title: "Baixar o app · Descargar la app" };

/** APK do app Android do entregador: COURIER_APK_URL ou o arquivo em public/entregador/entregas.apk. */
function apkUrl() {
  return process.env.COURIER_APK_URL?.trim() || "/entregador/entregas.apk";
}

export default async function CourierDownload() {
  const ua = (await headers()).get("user-agent");
  const native = isCourierNativeUA(ua);
  const android = isAndroidUA(ua);
  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="text-center">
        <img src="/entregador/icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-3xl" />
        <h1 className="mt-5 text-2xl font-black">App do entregador para Android</h1>
        <p className="text-sm text-[var(--s-muted)]">App del repartidor para Android</p>
      </div>

      {native ? (
        <p className="mt-6 rounded-2xl bg-[var(--s-good-bg)] p-4 text-center text-sm text-[var(--s-good-fg)]">Você já está no app. · Ya estás en la app.</p>
      ) : (
        <a href={apkUrl()} download="entregas.apk" className="btn-brand mt-6 w-full justify-center py-3 text-base">
          <Icon name="download" size={18} /> Baixar o app (APK) · Descargar
        </a>
      )}

      <section className="mt-6 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
        <h2 className="font-bold">Por que o app? · ¿Por qué la app?</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--s-muted)]">
          <li>Envia sua localização com o app fechado e a tela bloqueada. · Envía tu ubicación con la app cerrada y la pantalla bloqueada.</li>
          <li>Avisa de entregas novas mesmo fora do app. · Te avisa de entregas nuevas aunque no estés en la app.</li>
        </ul>
      </section>

      <section className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
        <h2 className="font-bold">Como instalar · Cómo instalar</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[var(--s-muted)]">
          <li>Toque em <b className="text-[var(--s-ink)]">Baixar o app</b> e abra o arquivo <b className="text-[var(--s-ink)]">entregas.apk</b>. · Tocá en Descargar y abrí el archivo.</li>
          <li>Se o Android pedir, permita <b className="text-[var(--s-ink)]">instalar apps desta fonte</b> (Chrome/Arquivos) e toque em Instalar. · Si lo pide, permití instalar apps de esta fuente.</li>
          <li>Abra o <b className="text-[var(--s-ink)]">link de acesso</b> que a loja mandou no WhatsApp: ele abre direto no app. Se abrir no navegador, toque em <b className="text-[var(--s-ink)]">Abrir no app</b> ou copie o link e cole na tela de entrada do app. · Abrí el enlace de acceso; si se abre en el navegador, tocá “Abrir en la app” o pegalo en la app.</li>
          <li>Fique <b className="text-[var(--s-ink)]">online</b> e permita a localização e as notificações. · Ponete online y permití ubicación y notificaciones.</li>
        </ol>
      </section>

      {!native && !android && (
        <p className="mt-4 rounded-2xl bg-[#F2C14E]/15 p-3 text-sm">
          iPhone: use a versão web — abra o link de acesso no Safari → Compartilhar → Adicionar à Tela de Início. · iPhone: usá la versión web (Safari → Compartir → Agregar a inicio).
        </p>
      )}
    </main>
  );
}
