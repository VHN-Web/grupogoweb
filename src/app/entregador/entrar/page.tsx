import { getCourier } from "@/lib/courier-auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default async function CourierEnter({ searchParams }: { searchParams: Promise<{ erro?: string; saiu?: string }> }) {
  const sp = await searchParams;
  if (!sp.erro && (await getCourier())) redirect("/entregador");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 py-10 text-center">
      <div>
        <img src="/entregador/icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-3xl" />
        <h1 className="mt-5 text-2xl font-black">App do entregador · App del repartidor</h1>
        {sp.erro === "link" && <p className="mt-4 rounded-2xl bg-red-500/10 p-3 text-sm text-red-500">Link inválido ou substituído. Peça um novo à loja. · Enlace inválido o reemplazado. Pedí uno nuevo a la tienda.</p>}
        {sp.erro === "limite" && <p className="mt-4 rounded-2xl bg-red-500/10 p-3 text-sm text-red-500">Muitas tentativas. Aguarde alguns minutos. · Demasiados intentos. Esperá unos minutos.</p>}
        {sp.saiu && <p className="mt-4 rounded-2xl bg-[var(--s-good-bg)] p-3 text-sm text-[var(--s-good-fg)]">Você saiu deste celular. · Saliste de este celular.</p>}
        <p className="mt-4 text-sm text-[var(--s-muted)]">
          Para entrar, abra o <b className="text-[var(--s-ink)]">link de acesso</b> que a loja enviou pelo WhatsApp (painel da loja → Motoboys → Enviar acesso ao app).
        </p>
        <p className="mt-3 text-sm text-[var(--s-muted)]">
          Para ingresar, abrí el <b className="text-[var(--s-ink)]">enlace de acceso</b> que la tienda te mandó por WhatsApp (panel de la tienda → Repartidores → Enviar acceso a la app).
        </p>
      </div>
    </main>
  );
}
