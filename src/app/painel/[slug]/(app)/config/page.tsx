import { requireTenantAdmin } from "@/lib/auth";
import { CURRENCIES, LABELS, PAYMENT_METHODS } from "@/core/types";
import { parseFiscalConfig, parsePaymentConfig } from "@/core/tenant-config";
import { listPaymentProviders } from "@/adapters/payments/registry";
import { listFiscalProviders } from "@/adapters/fiscal/providers";
import { changePassword, saveDelivery, saveFiscal, saveGeneral, savePayments, saveRates } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConfigPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug);
  const pay = parsePaymentConfig(t.paymentConfig);
  const fiscal = parseFiscalConfig(t.fiscalConfig);
  const providers = listPaymentProviders();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">Configuración</h1>

      <Section title="Datos del local" desc="Logo, colores y banner están en Apariencia.">
        <form action={saveGeneral.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><input name="name" className="input" defaultValue={t.name} /></Field>
          <Field label="Teléfono / WhatsApp"><input name="phone" className="input" defaultValue={t.phone ?? ""} /></Field>
          <Field label="RUC"><input name="ruc" className="input" defaultValue={t.ruc ?? ""} /></Field>
          <Field label="Dirección" wide><input name="address" className="input" defaultValue={t.address ?? ""} /></Field>
          <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="acceptsDineIn" defaultChecked={t.acceptsDineIn} /> Pedidos en mesa (QR)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="acceptsPickup" defaultChecked={t.acceptsPickup} /> Retiro en local</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="acceptsDelivery" defaultChecked={t.acceptsDelivery} /> Delivery</label>
          </div>
          <Save />
        </form>
      </Section>

      <Section title="Cotización del día" desc="Cuántos guaraníes vale cada moneda. Se usa para cobrar y calcular el vuelto.">
        <form action={saveRates.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label="1 US$ = Gs."><input name="rateUsd" className="input" inputMode="decimal" defaultValue={t.rateUsd} /></Field>
          <Field label="1 R$ = Gs."><input name="rateBrl" className="input" inputMode="decimal" defaultValue={t.rateBrl} /></Field>
          <Save />
        </form>
      </Section>

      <Section title="Medios de pago" desc="Elegí qué medios aceptás, en qué monedas y qué integración procesa cada uno.">
        <form action={savePayments.bind(null, slug)} className="space-y-3">
          {PAYMENT_METHODS.map((m) => {
            const o = pay.options.find((x) => x.method === m);
            const compatible = providers.filter((p) => p.methods.includes(m));
            return (
              <div key={m} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-32 items-center gap-2 font-semibold">
                    <input type="checkbox" name={`${m}_enabled`} defaultChecked={o?.enabled ?? false} /> {LABELS.paymentMethod[m]}
                  </label>
                  <select name={`${m}_provider`} defaultValue={o?.provider} className="input w-auto flex-1 py-2 text-sm">
                    {compatible.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {p.label}{!p.available ? " — próximamente" : ""}
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
            <Field label="Clave Pix"><input name="pixKey" className="input" defaultValue={pay.pixKey ?? ""} /></Field>
            <Field label="Titular Pix"><input name="pixHolder" className="input" defaultValue={pay.pixHolder ?? ""} /></Field>
            <Field label="Datos para transferencia" wide>
              <textarea name="bankInfo" className="input" defaultValue={pay.bankInfo ?? ""} placeholder="Banco, cuenta, titular, CI/RUC" />
            </Field>
          </div>
          <p className="text-xs text-muted">Las credenciales de gateways (Bancard, Pagopar) se cargarán aquí cuando la integración esté activa.</p>
          <Save />
        </form>
      </Section>

      <Section title="Delivery" desc="Tarifa = base + (km × precio por km), redondeada a Gs. 500. La distancia se calcula con la ubicación del cliente.">
        <form action={saveDelivery.bind(null, slug)} className="grid gap-3 sm:grid-cols-3">
          <Field label="Latitud del local"><input name="lat" className="input" defaultValue={t.lat ?? ""} placeholder="-25.5097" /></Field>
          <Field label="Longitud del local"><input name="lng" className="input" defaultValue={t.lng ?? ""} placeholder="-54.6111" /></Field>
          <Field label="Radio máximo (km)"><input name="deliveryMaxKm" className="input" defaultValue={t.deliveryMaxKm} /></Field>
          <Field label="Tarifa base (Gs.)"><input name="deliveryBaseFeePyg" className="input" defaultValue={t.deliveryBaseFeePyg} /></Field>
          <Field label="Por km (Gs.)"><input name="deliveryPerKmPyg" className="input" defaultValue={t.deliveryPerKmPyg} /></Field>
          <Field label="Gratis desde (Gs.)"><input name="deliveryFreeOverPyg" className="input" defaultValue={t.deliveryFreeOverPyg ?? ""} placeholder="vacío = nunca" /></Field>
          <p className="text-xs text-muted sm:col-span-3">Tip: en Google Maps, tocá tu local y copiá las coordenadas.</p>
          <Save />
        </form>
      </Section>

      <Section title="Facturación" desc="Manual (talonario) hoy. SIFEN (factura electrónica) queda listo para activar.">
        <form action={saveFiscal.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label="Modo">
            <select name="provider" defaultValue={fiscal.provider} className="input">
              {listFiscalProviders().map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>{p.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Timbrado"><input name="timbrado" className="input" defaultValue={fiscal.timbrado ?? ""} /></Field>
          <Field label="Establecimiento"><input name="establishment" className="input" defaultValue={fiscal.establishment} /></Field>
          <Field label="Punto de expedición"><input name="expeditionPoint" className="input" defaultValue={fiscal.expeditionPoint} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="autoIssue" defaultChecked={fiscal.autoIssue} /> Registrar factura automáticamente al cobrar un pedido
          </label>
          <Save />
        </form>
      </Section>

      <Section title="Seguridad">
        <form action={changePassword.bind(null, slug)} className="flex flex-wrap gap-2">
          <input name="password" type="password" minLength={8} className="input max-w-xs" placeholder="Nueva contraseña (mín. 8)" required />
          <button className="btn-primary">Cambiar contraseña</button>
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

function Save() {
  return (
    <div className="sm:col-span-full">
      <button className="btn-brand">Guardar</button>
    </div>
  );
}
