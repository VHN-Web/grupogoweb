import { getCourier } from "@/lib/courier-auth";
import { redirect } from "next/navigation";
import { NativeSignedOut } from "@/components/courier/CourierNative";
import { CourierLangSwitch } from "@/components/courier/CourierLangSwitch";
import { SubmitButton } from "@/components/crm/SubmitButton";
import { requestCourierT } from "@/lib/courier-lang";
import { enterWithLinkAction } from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { T } = await requestCourierT();
  return { title: T("Ingresar", "Entrar", "Sign in") };
}

export default async function CourierEnter({ searchParams }: { searchParams: Promise<{ erro?: string; saiu?: string }> }) {
  const sp = await searchParams;
  if (!sp.erro && (await getCourier())) redirect("/entregador");
  const { lang, T } = await requestCourierT();
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 py-10 text-center">
      <NativeSignedOut />
      <div>
        <div className="mb-6 flex justify-center"><CourierLangSwitch lang={lang} back="/entregador/entrar" /></div>
        <img src="/entregador/icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-3xl" />
        <h1 className="mt-5 text-2xl font-black">{T("App del repartidor", "App do entregador", "Courier app")}</h1>
        {sp.erro === "link" && <p className="mt-4 rounded-2xl bg-red-500/10 p-3 text-sm text-red-500">{T("Enlace inválido o reemplazado. Pedí uno nuevo a la tienda.", "Link inválido ou substituído. Peça um novo à loja.", "Invalid or replaced link. Ask the store for a new one.")}</p>}
        {sp.erro === "limite" && <p className="mt-4 rounded-2xl bg-red-500/10 p-3 text-sm text-red-500">{T("Demasiados intentos. Esperá unos minutos.", "Muitas tentativas. Aguarde alguns minutos.", "Too many attempts. Please wait a few minutes.")}</p>}
        {sp.saiu && <p className="mt-4 rounded-2xl bg-[var(--s-good-bg)] p-3 text-sm text-[var(--s-good-fg)]">{T("Saliste de este celular.", "Você saiu deste celular.", "You signed out of this phone.")}</p>}
        <p className="mt-4 text-sm text-[var(--s-muted)]">
          {T("Para ingresar, abrí el ", "Para entrar, abra o ", "To sign in, open the ")}
          <b className="text-[var(--s-ink)]">{T("enlace de acceso", "link de acesso", "access link")}</b>
          {T(
            " que la tienda te mandó por WhatsApp (panel de la tienda → Repartidores → Enviar acceso a la app).",
            " que a loja enviou pelo WhatsApp (painel da loja → Motoboys → Enviar acesso ao app).",
            " the store sent you on WhatsApp (store dashboard → Couriers → Send app access).",
          )}
        </p>

        <form action={enterWithLinkAction} className="mt-6 rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-4 text-left">
          <label htmlFor="link" className="text-sm font-bold">{T("O pegá el enlace acá", "Ou cole o link aqui", "Or paste the link here")}</label>
          <textarea id="link" name="link" required rows={3} autoComplete="off" spellCheck={false} placeholder="https://…/entregador/acesso/…" className="mt-2 w-full rounded-2xl border border-[var(--s-line)] bg-transparent p-3 text-sm" />
          <SubmitButton pending="…" className="btn-brand mt-3 w-full justify-center">{T("Ingresar", "Entrar", "Sign in")}</SubmitButton>
        </form>
      </div>
    </main>
  );
}
