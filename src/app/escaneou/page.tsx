import Link from "next/link";
import type { Metadata } from "next";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { isPreLaunch, LAUNCH_AT } from "@/core/launch";
import { LaunchClock } from "@/components/site/LaunchClock";
import { joinWaitlist } from "@/app/launch-actions";
import { getSettings } from "@/services/billing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Você escaneou! · GoWeb", robots: { index: false } };

// Destino dos QR Codes dos panfletos (?v= identifica o panfleto). A "pegadinha" vira argumento de venda.
const V: Record<string, { big: string; small: string }> = {
  nao: { big: "A gente pediu pra não escanear… e você escaneou.", small: "Viu como um QR Code bem colocado faz qualquer um agir? Imagine os seus clientes escaneando o SEU cardápio." },
  aposto: { big: "Ganhamos a aposta.", small: "Você escaneou em segundos. É assim que o seu cliente vai pedir no seu site: aponta a câmera e pronto." },
  surpresa: { big: "A surpresa é essa: seu negócio pode vender assim.", small: "Cardápio ou catálogo no celular do cliente, pedido no seu painel e pagamento direto na sua conta." },
  dinheiro: { big: "Quanto do seu pedido fica com o aplicativo?", small: "Com a GoWeb você tem seu próprio site de vendas, com mensalidade fixa e sem comissão por pedido." },
  panfleto: { big: "Seu negócio vendendo online.", small: "Site próprio, pedidos no painel, Pix e cartão, motoboy no mapa e atendimento com IA no WhatsApp." },
};

export default async function Scanned({ searchParams }: { searchParams: Promise<{ v?: string; lista?: string }> }) {
  const sp = await searchParams;
  const key = sp.v && V[sp.v] ? sp.v : "panfleto";
  const c = V[key];
  const pre = isPreLaunch();
  const settings = await getSettings();
  // o código (cód. P-xxx) diz à Geovana de qual panfleto a pessoa veio → origem do lead no CRM
  const wa = settings.supportWhatsapp ? `https://wa.me/${settings.supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Oi! Escaneei o panfleto da GoWeb e quero saber mais. (cód. P-${key})`)}` : null;
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#0E0E10] px-5 py-8 font-sans text-[#F4F1EA]" lang="pt-BR">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&display=swap" precedence="default" />
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#3CC46B]/25 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-[#1F7FD8]/25 blur-[120px]" />
      <div className="relative mx-auto max-w-md">
        <GoWebLogo height={30} />
        <p className="mt-10 text-5xl">😏</p>
        <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }} className="mt-3 text-4xl font-extrabold leading-tight">{c.big}</h1>
        <p className="mt-4 text-lg text-[#B9B3A7]">{c.small}</p>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 py-4 text-center font-bold text-[#0E0E10]">
            Falar agora no WhatsApp
          </a>
        )}
        {pre ? (
          <>
            <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#3CC46B]">Lançamento oficial · 12/11/2026</p>
            <div className="mt-3"><LaunchClock to={LAUNCH_AT.toISOString()} labels={["dias", "horas", "min", "seg"]} /></div>
            <section id="lista" className="mt-8 scroll-mt-6 rounded-3xl bg-[#F4F1EA] p-5 text-[#0E0E10]">
              {sp.lista === "ok" ? (
                <p className="font-semibold text-[#1d7a41]">Pronto! Vamos te chamar no WhatsApp no dia do lançamento. 🚀</p>
              ) : (
                <form action={joinWaitlist} className="grid gap-3">
                  <p className="font-bold">Quer ser avisado no lançamento?</p>
                  <input type="hidden" name="lang" value="pt" />
                  <input type="hidden" name="v" value={key} />
                  <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
                  <input name="business" required placeholder="Nome do negócio" className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" maxLength={80} />
                  <input name="phone" required inputMode="tel" placeholder="WhatsApp com DDD" className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" maxLength={20} />
                  <input name="name" placeholder="Seu nome (opcional)" className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm" maxLength={80} />
                  <button className="rounded-2xl bg-[#0E0E10] px-5 py-3.5 text-sm font-bold text-[#F4F1EA]">Quero ser avisado</button>
                  {sp.lista === "erro" && <p className="text-sm text-red-600">Confira o nome do negócio e o WhatsApp.</p>}
                </form>
              )}
            </section>
          </>
        ) : (
          <Link href="/planos?lang=pt" className="mt-8 inline-block rounded-2xl bg-[#3CC46B] px-6 py-4 font-bold text-[#0E0E10]">Ver planos e demonstrações</Link>
        )}
        <p className="mt-10 text-center text-xs text-[#8a857b]">GoWeb · Clique, Conecte, Venda.</p>
      </div>
    </main>
  );
}
