// Página que o visitante vê ao abrir o link do afiliado: apresenta a GoWeb e agenda a demonstração.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { NameInput } from "@/components/forms/NameInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { RevealOnScroll } from "@/components/motion/RevealOnScroll";
import { shortName } from "@/core/affiliates";
import { H, wrap } from "@/components/site/tokens";
import { AffiliateError, activeAffiliateByCode, createLead, fmtDateTime, notifyAffiliate } from "@/services/affiliates";
import { sendEmail } from "@/adapters/notify";
import { db } from "@/db";
import { clientIp, rateLimit } from "@/lib/security";

export const metadata = { title: "GoWeb — agende a sua demonstração gratuita", description: "Cardápio digital, pedidos pelo WhatsApp, delivery e caixa em um só sistema. Agende uma demonstração gratuita." };

const SEGMENTS = ["Restaurante", "Lanchonete / hamburgueria", "Pizzaria", "Bar", "Açaí / sorveteria", "Padaria / café", "Barbearia / salão", "Loja", "Outro"];
const SLOTS = [
  ["09:00", "Manhã (9h)"],
  ["11:00", "Fim da manhã (11h)"],
  ["14:00", "Tarde (14h)"],
  ["16:00", "Fim da tarde (16h)"],
  ["19:00", "Noite (19h)"],
];

export default async function AffiliateLanding({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { code } = await params;
  const { ok, err } = await searchParams;
  const a = await activeAffiliateByCode(code);
  if (!a) notFound();
  const who = shortName(a.name);
  const today = new Date().toISOString().slice(0, 10);

  async function book(f: FormData) {
    "use server";
    const aff = await activeAffiliateByCode(code);
    if (!aff) redirect("/?lang=pt");
    const back = (m: string) => redirect(`/a/${aff.code}/demo?err=${encodeURIComponent(m)}#agendar`);
    if (String(f.get("website") ?? "")) back("…");
    if (!(await rateLimit(`aff-lead:${await clientIp()}`, 6, 3600))) back("Muitas tentativas. Tente de novo mais tarde.");
    const day = String(f.get("day") ?? "");
    const slot = String(f.get("slot") ?? "");
    let scheduledAt: Date | null = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(slot)) {
      scheduledAt = new Date(`${day}T${slot}:00-03:00`);
      if (scheduledAt.getTime() < Date.now()) back("Escolha uma data a partir de hoje.");
    }
    try {
      const l = await createLead(
        aff.id,
        {
          businessName: String(f.get("businessName") ?? ""),
          contactName: String(f.get("contactName") ?? ""),
          whatsapp: String(f.get("whatsapp") ?? ""),
          email: String(f.get("email") ?? "") || null,
          city: String(f.get("city") ?? "") || null,
          segment: String(f.get("segment") ?? "") || null,
          note: String(f.get("note") ?? "") || null,
          scheduledAt,
        },
        "link",
      );
      const when = l.scheduledAt ? `Demonstração pedida para ${fmtDateTime(l.scheduledAt)}.` : "Sem horário escolhido — combinar pelo WhatsApp.";
      await notifyAffiliate(aff, "GoWeb Afiliados: nova indicação pelo seu link", `${l.contactName} (${l.businessName}) pediu uma demonstração. ${when}`);
      const s = await db.query.platformSettings.findFirst();
      if (s?.supportEmail) await sendEmail(s.supportEmail, `Nova demonstração (afiliado ${aff.code})`, `${l.businessName} — ${l.contactName} — ${l.whatsapp}\n${when}\nVeja em Admin → Afiliados → Agenda.`).catch(() => null);
    } catch (e) {
      if (e instanceof AffiliateError) back(e.message);
      throw e;
    }
    redirect(`/a/${aff.code}/demo?ok=1#agendar`);
  }

  const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]";
  return (
    <main className="site min-h-dvh">
      <RevealOnScroll />
      <header className={`${wrap} flex items-center justify-between py-5`}>
        <GoWebLogo height={28} dark={false} className="dark:hidden" />
        <GoWebLogo height={28} className="hidden dark:block" />
        <div className="flex items-center gap-3">
          <ThemeToggle locale="pt" variant="compact" tone="light" />
          <Link href="/planos?lang=pt" className="hidden text-sm font-semibold hover:underline sm:block">Ver planos</Link>
        </div>
      </header>

      <section className={`${wrap} grid items-center gap-10 pb-16 pt-6 lg:grid-cols-[1.1fr_1fr]`}>
        <div className="anim-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full bg-[var(--s-good-bg)] px-3 py-1 text-xs font-bold text-[var(--s-good-fg)]">
            <Icon name="star" size={14} /> Indicação de {who}
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl" style={{ fontFamily: H }}>
            O seu negócio vendendo pelo celular, sem pagar comissão por pedido.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[var(--s-muted)]">
            Cardápio digital com QR, pedidos no WhatsApp, delivery, mesas e caixa em um só sistema — com o seu nome e a sua marca. Veja tudo funcionando numa demonstração gratuita de 20 minutos.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#agendar" className="btn-shine rounded-2xl bg-[#3CC46B] px-6 py-3.5 font-bold text-[#0E0E10]">Agendar demonstração</a>
            <Link href="/planos?lang=pt" className="rounded-2xl border border-[var(--s-line)] px-6 py-3.5 font-bold">Ver planos e preços</Link>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2" data-reveal>
          {[
            ["cart", "Pedidos sem taxa", "O cliente pede pelo cardápio e o pedido chega organizado."],
            ["qr", "QR nas mesas", "Cliente vê fotos, preços e pede sem esperar o garçom."],
            ["bike", "Delivery com taxa por distância", "Motoboys, rota no WhatsApp e acerto no fim do dia."],
            ["cash", "Caixa e estoque", "Fechamento do dia sem planilha nem caderno."],
          ].map(([i, t, d]) => (
            <div key={t} className={`${card} lift p-5`}>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--s-good-bg)] text-[var(--s-good-fg)]"><Icon name={i} /></span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="mt-1 text-sm text-[var(--s-muted)]">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="agendar" className="bg-[#0E0E10] py-16 text-[#F4F1EA]">
        <div className={`${wrap} grid gap-10 lg:grid-cols-[1fr_1.2fr]`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#3CC46B]">Demonstração gratuita</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight" style={{ fontFamily: H }}>Escolha o melhor horário</h2>
            <ul className="mt-6 space-y-3 text-[#B9B3A7]">
              {["Por videochamada ou WhatsApp, cerca de 20 minutos", "Mostramos o sistema com um cardápio parecido com o seu", "Sem compromisso — você decide depois"].map((t) => (
                <li key={t} className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-[#3CC46B]" /> {t}</li>
              ))}
            </ul>
          </div>
          {ok ? (
            <div className="anim-fade-up rounded-3xl bg-[#18181b] p-8">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#3CC46B] text-[#0E0E10]"><Icon name="check" /></span>
              <h3 className="mt-4 text-2xl font-bold">Pedido recebido!</h3>
              <p className="mt-2 text-[#B9B3A7]">Vamos confirmar o horário pelo WhatsApp. Enquanto isso, dê uma olhada nos planos.</p>
              <Link href="/planos?lang=pt" className="mt-6 inline-block rounded-2xl bg-[#3CC46B] px-5 py-3 font-bold text-[#0E0E10]">Ver planos</Link>
            </div>
          ) : (
            <form action={book} className="atlas-auth grid min-w-0 grid-cols-1 gap-3 rounded-3xl bg-[#141416] p-5 sm:grid-cols-2 sm:p-8 [&>*]:min-w-0">
              {err && <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200 sm:col-span-2">{err}</p>}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
              <div className="sm:col-span-2">
                <label className="label" htmlFor="businessName">Nome do negócio</label>
                <input id="businessName" name="businessName" className="input" required maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="contactName">Seu nome</label>
                <NameInput id="contactName" name="contactName" required />
              </div>
              <div>
                <label className="label" htmlFor="whatsapp">WhatsApp</label>
                <PhoneInput id="whatsapp" name="whatsapp" defaultCountry="BR" locale="pt" required />
              </div>
              <div>
                <label className="label" htmlFor="city">Cidade</label>
                <input id="city" name="city" className="input" maxLength={60} />
              </div>
              <div>
                <label className="label" htmlFor="segment">Tipo de negócio</label>
                <select id="segment" name="segment" className="input">
                  {SEGMENTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="day">Dia</label>
                <input id="day" name="day" type="date" min={today} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="slot">Horário (Brasília)</label>
                <select id="slot" name="slot" className="input">
                  {SLOTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="note">Algo que devemos saber? (opcional)</label>
                <textarea id="note" name="note" rows={2} className="input" maxLength={500} />
              </div>
              <button className="btn-brand btn-shine mt-2 rounded-2xl py-3.5 font-bold sm:col-span-2">Quero a demonstração</button>
              <p className="text-xs text-[#8a857b] sm:col-span-2">Usamos o seu contato só para falar sobre a demonstração.</p>
            </form>
          )}
        </div>
      </section>
      <footer className={`${wrap} flex flex-wrap items-center justify-between gap-3 py-8 text-sm text-[var(--s-muted)]`}>
        <span>GoWeb · Clique, Conecte, Venda.</span>
        <Link href="/afiliados" className="hover:underline">Seja um afiliado GoWeb</Link>
      </footer>
    </main>
  );
}
