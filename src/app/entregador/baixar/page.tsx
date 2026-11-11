import { headers } from "next/headers";
import { Icon } from "@/components/ui/Icon";
import { CourierLangSwitch } from "@/components/courier/CourierLangSwitch";
import { COURIER_APP, isAndroidUA, isCourierNativeUA } from "@/core/courier-native";
import { requestCourierT } from "@/lib/courier-lang";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { T } = await requestCourierT();
  return { title: T("Descargar la app", "Baixar o app", "Download the app") };
}

/** APK do app Android do entregador: COURIER_APK_URL ou o último build publicado no GitHub (Releases). */
function apkUrl() {
  return process.env.COURIER_APK_URL?.trim() || COURIER_APP.apkUrl;
}

export default async function CourierDownload() {
  const ua = (await headers()).get("user-agent");
  const native = isCourierNativeUA(ua);
  const android = isAndroidUA(ua);
  const { lang, T } = await requestCourierT();
  const b = (s: string) => <b className="text-[var(--s-ink)]">{s}</b>;
  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="mb-6 flex justify-center"><CourierLangSwitch lang={lang} back="/entregador/baixar" /></div>
      <div className="text-center">
        <img src="/entregador/icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-3xl" />
        <h1 className="mt-5 text-2xl font-black">{T("App del repartidor para Android", "App do entregador para Android", "Courier app for Android")}</h1>
      </div>

      {native ? (
        <p className="mt-6 rounded-2xl bg-[var(--s-good-bg)] p-4 text-center text-sm text-[var(--s-good-fg)]">{T("Ya estás en la app.", "Você já está no app.", "You're already in the app.")}</p>
      ) : (
        <a href={apkUrl()} className="btn-brand mt-6 w-full justify-center py-3 text-base">
          <Icon name="download" size={18} /> {T("Descargar la app (APK)", "Baixar o app (APK)", "Download the app (APK)")}
        </a>
      )}

      <section className="mt-6 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
        <h2 className="font-bold">{T("¿Por qué la app?", "Por que o app?", "Why the app?")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--s-muted)]">
          <li>{T("Envía tu ubicación con la app cerrada y la pantalla bloqueada.", "Envia sua localização com o app fechado e a tela bloqueada.", "Sends your location with the app closed and the screen locked.")}</li>
          <li>{T("Te avisa de entregas nuevas en pantalla completa, aunque estés en otra app.", "Avisa de entregas novas em tela cheia, mesmo se você estiver em outro app.", "Alerts you to new deliveries full screen, even if you're in another app.")}</li>
        </ul>
      </section>

      <section className="mt-4 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5 text-sm">
        <h2 className="font-bold">{T("Cómo instalar", "Como instalar", "How to install")}</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[var(--s-muted)]">
          <li>{T("Tocá ", "Toque em ", "Tap ")}{b(T("Descargar la app", "Baixar o app", "Download the app"))}{T(" y abrí el archivo ", " e abra o arquivo ", " and open the file ")}{b("entregas.apk")}.</li>
          <li>{T("Si Android lo pide, permití ", "Se o Android pedir, permita ", "If Android asks, allow ")}{b(T("instalar apps de esta fuente", "instalar apps desta fonte", "installing apps from this source"))}{T(" (Chrome/Archivos) y tocá Instalar.", " (Chrome/Arquivos) e toque em Instalar.", " (Chrome/Files) and tap Install.")}</li>
          <li>
            {T("Abrí el ", "Abra o ", "Open the ")}{b(T("enlace de acceso", "link de acesso", "access link"))}
            {T(" que la tienda te mandó por WhatsApp: se abre directo en la app. Si se abre en el navegador, tocá ", " que a loja mandou no WhatsApp: ele abre direto no app. Se abrir no navegador, toque em ", " the store sent you on WhatsApp: it opens right in the app. If it opens in the browser, tap ")}
            {b(T("Abrir en la app", "Abrir no app", "Open in the app"))}
            {T(" o copiá el enlace y pegalo en la pantalla de ingreso de la app.", " ou copie o link e cole na tela de entrada do app.", " or copy the link and paste it on the app's sign-in screen.")}
          </li>
          <li>{T("Ponete ", "Fique ", "Go ")}{b("online")}{T(" y permití ubicación y notificaciones.", " e permita a localização e as notificações.", " and allow location and notifications.")}</li>
        </ol>
      </section>

      {!native && !android && (
        <p className="mt-4 rounded-2xl bg-[#F2C14E]/15 p-3 text-sm">
          {T(
            "iPhone: usá la versión web — abrí el enlace de acceso en Safari → Compartir → Agregar a inicio.",
            "iPhone: use a versão web — abra o link de acesso no Safari → Compartilhar → Adicionar à Tela de Início.",
            "iPhone: use the web version — open the access link in Safari → Share → Add to Home Screen.",
          )}
        </p>
      )}
    </main>
  );
}
