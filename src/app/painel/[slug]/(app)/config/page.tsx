import { requireTenantAdmin } from "@/lib/auth";
import { CURRENCIES, PAYMENT_METHODS, type Currency } from "@/core/types";
import { panelI18n } from "@/lib/panel-i18n";
import { COUNTRIES, REGIONS } from "@/core/region";
import { CURRENCY_SYMBOL, minorToInput } from "@/core/money";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { parseFiscalConfig, parsePaymentConfig } from "@/core/tenant-config";
import { listPaymentProviders } from "@/adapters/payments/registry";
import { listFiscalProviders } from "@/adapters/fiscal/providers";
import { changePassword, saveDelivery, saveFiscal, saveGeneral, savePayments, saveRates, saveRegion } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug);
  const pay = parsePaymentConfig(t.paymentConfig);
  const fiscal = parseFiscalConfig(t.fiscalConfig);
  const providers = listPaymentProviders();
  const { T, L, region, base } = panelI18n(t);
  const sym = CURRENCY_SYMBOL[base];
  const mi = (v: number | null | undefined) => minorToInput(v, base);
  const others = CURRENCIES.filter((c) => c !== base);
  const rateField: Record<Currency, "rateUsd" | "rateBrl" | "ratePyg"> = { USD: "rateUsd", BRL: "rateBrl", PYG: "ratePyg" };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">{T("Configuración", "Configurações")}</h1>

      <Section title={T("Datos del local", "Dados do estabelecimento")} desc={T("Logo, colores y banner están en Apariencia.", "Logo, cores e banner ficam em Aparência.")}>
        <form action={saveGeneral.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label={T("Nombre", "Nome")}><input name="name" className="input" defaultValue={t.name} /></Field>
          <Field label={T("Teléfono / WhatsApp", "Telefone / WhatsApp")}><PhoneInput name="phone" defaultValue={t.phone} defaultCountry={t.country} locale={region.locale} /></Field>
          <Field label={region.taxIdLabel}><input name="ruc" className="input" defaultValue={t.ruc ?? ""} /></Field>
          <Field label={T("Dirección", "Endereço")} wide><input name="address" className="input" defaultValue={t.address ?? ""} /></Field>
          <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="acceptsDineIn" defaultChecked={t.acceptsDineIn} /> {T("Pedidos en mesa (QR)", "Pedidos na mesa (QR)")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="acceptsPickup" defaultChecked={t.acceptsPickup} /> {T("Retiro en local", "Retirada no local")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="acceptsDelivery" defaultChecked={t.acceptsDelivery} /> Delivery</label>
          </div>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title={T("País y moneda", "País e moeda")} desc={T("Define idioma del menú, moneda base, formato del teléfono y documento fiscal.", "Define idioma do cardápio, moeda base, formato do telefone e documento fiscal.")}>
        <form action={saveRegion.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label={T("País", "País")}>
            <select name="country" defaultValue={t.country} className="input">
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{T(REGIONS[c].name.es, REGIONS[c].name.pt)} — {REGIONS[c].currency}</option>
              ))}
            </select>
          </Field>
          <p className="self-end text-xs text-muted">{T("Atención: cambiar la moneda no convierte los precios ya cargados.", "Atenção: trocar a moeda não converte os preços já cadastrados.")}</p>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title={T("Cotización del día", "Cotação do dia")} desc={T(`Cuánto vale cada moneda en ${sym}. Se usa para cobrar y calcular el vuelto.`, `Quanto vale cada moeda em ${sym}. Usado para cobrar e calcular o troco.`)}>
        <form action={saveRates.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          {others.map((c) => (
            <Field key={c} label={`1 ${CURRENCY_SYMBOL[c]} = ${sym}`}>
              <input name={rateField[c]} className="input" inputMode="decimal" defaultValue={t[rateField[c]]} />
            </Field>
          ))}
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title={T("Medios de pago", "Formas de pagamento")} desc={T("Elegí qué medios aceptás, en qué monedas y qué integración procesa cada uno.", "Escolha quais formas aceita, em quais moedas e qual integração processa cada uma.")}>
        <form action={savePayments.bind(null, slug)} className="space-y-3">
          {PAYMENT_METHODS.map((m) => {
            const o = pay.options.find((x) => x.method === m);
            const compatible = providers.filter((p) => p.methods.includes(m));
            return (
              <div key={m} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-32 items-center gap-2 font-semibold">
                    <input type="checkbox" name={`${m}_enabled`} defaultChecked={o?.enabled ?? false} /> {L.paymentMethod[m]}
                  </label>
                  <select name={`${m}_provider`} defaultValue={o?.provider} className="input w-auto flex-1 py-2 text-sm">
                    {compatible.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {p.label}{!p.available ? T(" — próximamente", " — em breve") : ""}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-3 text-sm">
                    {CURRENCIES.map((c) => (
                      <label key={c} className="flex items-center gap-1">
                        <input type="checkbox" name={`${m}_${c}`} defaultChecked={o?.currencies.includes(c)} /> {c}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={T("Clave Pix", "Chave Pix")}><input name="pixKey" className="input" defaultValue={pay.pixKey ?? ""} /></Field>
            <Field label="Titular Pix"><input name="pixHolder" className="input" defaultValue={pay.pixHolder ?? ""} /></Field>
            <Field label={T("Datos para transferencia", "Dados para transferência")} wide>
              <textarea name="bankInfo" className="input" defaultValue={pay.bankInfo ?? ""} placeholder={T("Banco, cuenta, titular, CI/RUC", "Banco, agência, conta, titular, CPF/CNPJ")} />
            </Field>
          </div>
          <p className="text-xs text-muted">{T("Las credenciales de gateways (Bancard, Pagopar) se cargarán aquí cuando la integración esté activa.", "As credenciais de gateways serão configuradas aqui quando a integração estiver ativa.")}</p>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title="Delivery" desc={T(`Tarifa = base + (km × precio por km), redondeada a ${base === "PYG" ? "Gs. 500" : `${sym} 0,50`}. La distancia se calcula con la ubicación del cliente.`, `Taxa = base + (km × preço por km), arredondada para ${base === "PYG" ? "Gs. 500" : `${sym} 0,50`}. A distância é calculada pela localização do cliente.`)}>
        <form action={saveDelivery.bind(null, slug)} className="grid gap-3 sm:grid-cols-3">
          <Field label={T("Latitud del local", "Latitude do local")}><input name="lat" className="input" defaultValue={t.lat ?? ""} placeholder="-25.5097" /></Field>
          <Field label={T("Longitud del local", "Longitude do local")}><input name="lng" className="input" defaultValue={t.lng ?? ""} placeholder="-54.6111" /></Field>
          <Field label={T("Radio máximo (km)", "Raio máximo (km)")}><input name="deliveryMaxKm" className="input" defaultValue={t.deliveryMaxKm} /></Field>
          <Field label={`${T("Tarifa base", "Taxa base")} (${sym})`}><input name="deliveryBaseFeePyg" className="input" inputMode="decimal" defaultValue={mi(t.deliveryBaseFeePyg)} /></Field>
          <Field label={`${T("Por km", "Por km")} (${sym})`}><input name="deliveryPerKmPyg" className="input" inputMode="decimal" defaultValue={mi(t.deliveryPerKmPyg)} /></Field>
          <Field label={`${T("Gratis desde", "Grátis a partir de")} (${sym})`}><input name="deliveryFreeOverPyg" className="input" inputMode="decimal" defaultValue={mi(t.deliveryFreeOverPyg)} placeholder={T("vacío = nunca", "vazio = nunca")} /></Field>
          <p className="text-xs text-muted sm:col-span-3">{T("Tip: en Google Maps, tocá tu local y copiá las coordenadas.", "Dica: no Google Maps, toque no seu local e copie as coordenadas.")}</p>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title={T("Facturación", "Notas fiscais")} desc={T("Manual (talonario) hoy. SIFEN (factura electrónica) queda listo para activar.", "Registro manual hoje. Emissão eletrônica (NF-e/NFC-e) virá como integração.")}>
        <form action={saveFiscal.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label={T("Modo", "Modo")}>
            <select name="provider" defaultValue={fiscal.provider} className="input">
              {listFiscalProviders().map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Timbrado"><input name="timbrado" className="input" defaultValue={fiscal.timbrado ?? ""} /></Field>
          <Field label={T("Establecimiento", "Estabelecimento")}><input name="establishment" className="input" defaultValue={fiscal.establishment} /></Field>
          <Field label={T("Punto de expedición", "Série")}><input name="expeditionPoint" className="input" defaultValue={fiscal.expeditionPoint} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="autoIssue" defaultChecked={fiscal.autoIssue} /> {T("Registrar factura automáticamente al cobrar un pedido", "Registrar nota automaticamente ao receber um pedido")}
          </label>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title={T("Seguridad", "Segurança")}>
        <form action={changePassword.bind(null, slug)} className="flex flex-wrap gap-2">
          <input name="password" type="password" minLength={8} className="input max-w-xs" placeholder={T("Nueva contraseña (mín. 8)", "Nova senha (mín. 8)")} required />
          <button className="btn-primary">{T("Cambiar contraseña", "Alterar senha")}</button>
        </form>
      </Section>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Save({ label = "Guardar" }: { label?: string }) {
  return (
    <div className="sm:col-span-full">
      <button className="btn-brand">{label}</button>
    </div>
  );
}
