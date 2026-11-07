import { clientIp, rateLimit } from "@/lib/security";
// Contratação self-service: o visitante escolhe o plano na página de vendas,
// preenche os dados e cai direto na fatura da implantação (paga em R$, Gs. ou US$).
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { AuthShell } from "@/components/brand/AuthShell";
import { NameInput } from "@/components/forms/NameInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { detectLocale, getRegion, isValidE164, isValidName, tr, type Locale } from "@/core/region";
import { THEMES, THEME_IDS } from "@/core/themes";
import { formatMinor } from "@/core/money";
import { planName } from "@/core/plans";
import { BillingError, createCustomer, getSettings } from "@/services/billing";
import { CORE_INFO, MODULES, MODULE_INFO, parseModulePrices, sanitizeModules } from "@/core/modules";
import { ModulePicker } from "@/components/forms/ModulePicker";

export const dynamic = "force-dynamic";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function contratar(f: FormData) {
  "use server";
  const lang = str(f, "lang") === "pt" ? "pt" : "es";
  const T = tr(lang);
  const planId = str(f, "planId");
  const custom = planId === "personalizado";
  const back = (msg: string) => redirect(`/contratar?plano=${encodeURIComponent(planId)}&lang=${lang}&err=${encodeURIComponent(msg)}`);

  if (str(f, "website")) back("…"); // honeypot anti-robô
  if (!(await rateLimit(`contratar:${await clientIp()}`, 5, 60 * 60))) back(T("Demasiados intentos. Esperá una hora o escribinos por WhatsApp.", "Muitas tentativas. Aguarde uma hora ou fale conosco pelo WhatsApp."));
  const country = lang === "pt" ? "BR" : getRegion(str(f, "country")).country;
  const contactName = str(f, "contactName");
  const whatsapp = str(f, "whatsapp");
  if (!str(f, "businessName")) back(T("Completá el nombre del negocio.", "Preencha o nome do negócio."));
  if (!isValidName(contactName)) back(T("Tu nombre debe tener solo letras.", "Seu nome deve ter apenas letras."));
  if (!str(f, "email").includes("@")) back(T("E-mail inválido.", "E-mail inválido."));
  if (!isValidE164(whatsapp)) back(T("WhatsApp inválido para el país elegido.", "WhatsApp inválido para o país escolhido."));

  let customerId = "";
  try {
    const c = await createCustomer({
      businessName: str(f, "businessName"),
      contactName,
      email: str(f, "email"),
      whatsapp,
      whatsappOptIn: true,
      ruc: str(f, "ruc") || null,
      desiredSlug: null,
      planId,
      modules: custom ? sanitizeModules(f.getAll("modules").map(String)) : null,
      preferredCurrency: getRegion(country).currency,
      wantsDomain: false,
      domainName: null,
      notes: T("Contratación por el sitio", "Contratação pelo site"),
      theme: str(f, "theme") || null,
      country,
    });
    customerId = c.id;
  } catch (e) {
    back(e instanceof BillingError ? e.message : T("No pudimos registrar. Intentá de nuevo.", "Não conseguimos registrar. Tente de novo."));
  }
  const inv = await db.query.invoices.findFirst({
    where: eq(schema.invoices.customerId, customerId),
    orderBy: desc(schema.invoices.createdAt),
    columns: { id: true },
  });
  redirect(inv ? `/fatura/${inv.id}` : "/");
}

export default async function Contratar({ searchParams }: { searchParams: Promise<{ plano?: string; lang?: string; err?: string }> }) {
  const sp = await searchParams;
  const locale: Locale = sp.lang === "pt" || sp.lang === "es" ? sp.lang : detectLocale(await headers());
  const T = tr(locale);
  const pt = locale === "pt";
  const plans = await db.query.plans.findMany({ where: and(eq(schema.plans.active, true), eq(schema.plans.isCustom, false)), orderBy: asc(schema.plans.sortOrder) });
  const mp = parseModulePrices((await getSettings()).modulePrices);
  const custom = sp.plano === "personalizado" && mp.enabled;
  const found = plans.find((p) => p.id === sp.plano) ?? plans[0];
  if (!found && !custom) redirect("/");
  const cur = pt ? ("BRL" as const) : ("PYG" as const);
  const country = pt ? "BR" : "PY";
  // Plano personalizado: "a partir de" (núcleo) — o total final é calculado no servidor ao contratar
  const plan = custom
    ? { id: "personalizado", name: T("Personalizado", "Personalizado"), interval: "MONTHLY" as const, priceBrlMinor: mp.core.BRL, pricePyg: mp.core.PYG, setupBrlMinor: mp.setup.BRL, setupPyg: mp.setup.PYG }
    : found!;
  const price = formatMinor(pt ? plan.priceBrlMinor : plan.pricePyg, cur);
  const setup = pt ? plan.setupBrlMinor : plan.setupPyg;

  return (
    <AuthShell eyebrow={T("Contratar GoWeb", "Contratar a GoWeb")} title={planName(plan.name, locale)}>
      <p className="-mt-5 mb-6 text-sm text-[#B9B3A7]">
        {custom && T("desde ", "a partir de ")}{price} / {plan.interval === "YEARLY" ? T("año", "ano") : T("mes", "mês")}
        {setup > 0 && <> · {T("implementación", "implantação")} {formatMinor(setup, pt ? "BRL" : "PYG")}</>}
        {plans.length > 1 && (
          <>
            {" "}·{" "}
            <Link href={`/${pt ? "?lang=pt" : ""}#planes`} className="underline">{T("cambiar plan", "trocar plano")}</Link>
          </>
        )}
      </p>
      {sp.err && <p className="mb-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-300">{sp.err}</p>}
      <form action={contratar} className="space-y-3">
        <input type="hidden" name="planId" value={plan.id} />
        <input type="hidden" name="lang" value={locale} />
        <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

        {custom && (
          <>
            <p className="label">{T("Elegí lo que tu negocio necesita", "Escolha o que o seu negócio precisa")}</p>
            <ModulePicker
              core={mp.core[cur]}
              coreLabel={pt ? CORE_INFO.pt : CORE_INFO.es}
              coreDesc={pt ? CORE_INFO.descPt : CORE_INFO.descEs}
              items={MODULES.map((m) => ({ key: m, label: pt ? MODULE_INFO[m].pt : MODULE_INFO[m].es, desc: pt ? MODULE_INFO[m].descPt : MODULE_INFO[m].descEs, price: mp.modules[m][cur], pro: MODULE_INFO[m].pro }))}
              currency={cur}
              perMonth={T("mes", "mês")}
              setupText={T(`Implementación única: ${formatMinor(mp.setup[cur], cur)} · podés sumar módulos después`, `Implantação única: ${formatMinor(mp.setup[cur], cur)} · dá para adicionar módulos depois`)}
            />
          </>
        )}

        {/* País definido pela região do visitante: Brasil (pt) ou Paraguai (es) */}
        <input type="hidden" name="country" value={country} />

        <label className="label" htmlFor="businessName">{T("Nombre del negocio", "Nome do negócio")}</label>
        <input id="businessName" name="businessName" className="input" required maxLength={80} placeholder={T("Ej: Barbería Navaja", "Ex: Barbearia Navalha")} />

        <label className="label" htmlFor="theme">{T("Tipo de negocio", "Tipo de negócio")}</label>
        <select id="theme" name="theme" className="input" defaultValue="classic">
          {THEME_IDS.map((id) => (
            <option key={id} value={id}>{pt ? `${THEMES[id].label} — ${THEMES[id].segment}` : `${THEMES[id].labelEs} — ${THEMES[id].segmentEs}`}</option>
          ))}
        </select>

        <label className="label" htmlFor="contactName">{T("Tu nombre", "Seu nome")}</label>
        <NameInput id="contactName" name="contactName" required />

        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" />

        <label className="label" htmlFor="whatsapp">WhatsApp</label>
        <PhoneInput id="whatsapp" name="whatsapp" defaultCountry={country} locale={locale} required />

        <label className="label" htmlFor="ruc">{T("RUC (opcional)", "CNPJ ou CPF (opcional)")}</label>
        <input id="ruc" name="ruc" className="input" inputMode="numeric" maxLength={20} />

        <button className="btn-primary w-full py-3">{T("Continuar al pago", "Continuar para o pagamento")}</button>
        <p className="text-xs text-[#B9B3A7]">
          {T(
            "Después del pago de la implementación preparamos tu sistema y te avisamos por e-mail y WhatsApp.",
            "Depois do pagamento da implantação preparamos o seu sistema e avisamos por e-mail e WhatsApp.",
          )}
        </p>
      </form>
    </AuthShell>
  );
}
