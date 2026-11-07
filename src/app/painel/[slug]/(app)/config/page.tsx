import { requireTenantAdmin } from "@/lib/auth";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { openCredentials } from "@/lib/security";
import { googleEnabled } from "@/lib/google";
import { PAYMENT_METHODS, type Currency } from "@/core/types";
import { panelI18n } from "@/lib/panel-i18n";
import { CURRENCY_SYMBOL, minorToInput } from "@/core/money";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { parseFiscalConfig, parsePaymentConfig } from "@/core/tenant-config";
import { listPaymentProviders } from "@/adapters/payments/registry";
import { listFiscalProviders } from "@/adapters/fiscal/providers";
import { changePassword, saveDelivery, saveFiscal, saveGeneral, savePayments, saveRates, saveIntegration, removeIntegration, savePrinter, saveReport, saveLoginEmail } from "../actions";
import { ProBadge, ProUpsell } from "@/components/ProUpsell";

export const dynamic = "force-dynamic";

export default async function ConfigPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "settings");
  const pay = parsePaymentConfig(t.paymentConfig);
  const fiscal = parseFiscalConfig(t.fiscalConfig);
  const providers = listPaymentProviders();
  const { T, L, region, base } = panelI18n(t);
  const sym = CURRENCY_SYMBOL[base];
  const mi = (v: number | null | undefined) => minorToInput(v, base);
  // Moedas do país do estabelecimento: Brasil = só R$; Paraguai = Gs. + US$ + R$
  const regionCurrencies: Currency[] = [base, ...region.extraCurrencies];
  const others = region.extraCurrencies;
  const pt = region.locale === "pt";
  const labelOf = (p: { label: string; labelPt?: string }) => (pt ? (p.labelPt ?? p.label) : p.label);
  const regionProviders = providers.filter((p) => p.currencies.includes(base));
  const mpCreds = openCredentials(pay.credentials.mercadopago);
  const integrations = regionProviders.filter((p) => p.online && p.id !== "mock_online");
  const rateField: Record<Currency, "rateUsd" | "rateBrl" | "ratePyg"> = { USD: "rateUsd", BRL: "rateBrl", PYG: "ratePyg" };

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-xl font-bold">{T("Configuración", "Configurações")}</h1>

      <Section title={T("Datos del local", "Dados do estabelecimento")} desc={T("Logo, colores y banner están en Apariencia.", "Logo, cores e banner ficam em Aparência.")}>
        <form action={saveGeneral.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label={T("Nombre", "Nome")}><input name="name" className="input" defaultValue={t.name} /></Field>
          <Field label={T("Teléfono / WhatsApp", "Telefone / WhatsApp")}><PhoneInput name="phone" defaultValue={t.phone} defaultCountry={t.country} locale={region.locale} /></Field>
          <Field label={T("WhatsApp del local (ícono en el sitio)", "WhatsApp do negócio (ícone no site)")}><PhoneInput name="whatsapp" defaultValue={t.whatsapp} defaultCountry={t.country} locale={region.locale} /></Field>
          <Field label="Instagram">
            <div className="flex items-center rounded-xl border border-line bg-white pl-3 text-sm">
              <span className="text-muted">@</span>
              <input name="instagram" className="w-full bg-transparent px-1 py-2.5 outline-none" defaultValue={t.instagram ?? ""} placeholder={T("tu_local", "seu_negocio")} maxLength={30} />
            </div>
          </Field>
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

      {others.length > 0 && (
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
      )}

      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <Section
        title={T("Integraciones de pago", "Integrações de pagamento")}
        desc={T(
          "Conectá tu cuenta para cobrar online. El dinero va directo a tu cuenta y el pedido se confirma solo.",
          "Conecte sua conta para receber online. O dinheiro vai direto para a sua conta e o pedido é confirmado sozinho.",
        )}
      >
        <div className="space-y-4">
          {integrations.map((p) =>
            p.id === "mercadopago" ? (
              <div key={p.id} id="mercadopago" className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <b>Mercado Pago</b>
                  {mpCreds.accessToken ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                      ✓ {T("Conectado", "Conectado")}{mpCreds.account ? ` · ${mpCreds.account}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold text-muted">{T("No conectado", "Não conectado")}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  {T(
                    "Pix y tarjeta online con confirmación automática.",
                    "Pix e cartão online com confirmação automática. Pegue o Access Token em mercadopago.com.br/developers → Suas integrações → Credenciais de produção.",
                  )}
                </p>
                <form action={saveIntegration.bind(null, slug, "mercadopago")} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Access Token" wide>
                    <input
                      name="accessToken"
                      type="password"
                      autoComplete="off"
                      className="input font-mono"
                      placeholder={mpCreds.accessToken ? `APP_USR-••••${mpCreds.accessToken.slice(-4)} (${T("guardado", "salvo")})` : "APP_USR-..."}
                      required={!mpCreds.accessToken}
                    />
                  </Field>
                  <Field label={T("Clave secreta del webhook (opcional)", "Assinatura secreta do webhook (opcional)")} wide>
                    <input name="webhookSecret" type="password" autoComplete="off" className="input font-mono" placeholder={mpCreds.webhookSecret ? "••••••••" : ""} />
                  </Field>
                  <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                    <button className="btn-brand">{mpCreds.accessToken ? T("Actualizar", "Atualizar") : T("Conectar", "Conectar")}</button>
                    <span className="text-xs text-muted">{T("Probamos el token antes de guardar.", "Testamos o token antes de salvar. Ao conectar, o Pix do seu site passa a ser automático.")}</span>
                  </div>
                </form>
                {mpCreds.accessToken && (
                  <form action={removeIntegration.bind(null, slug, "mercadopago")} className="mt-2">
                    <button className="text-xs text-red-600 hover:underline">{T("Desconectar", "Desconectar")}</button>
                  </form>
                )}
              </div>
            ) : (
              <div key={p.id} className="rounded-xl border border-line p-4 opacity-70">
                <b>{labelOf(p)}</b>
                <p className="mt-1 text-sm text-muted">{T("Próximamente: la integración está en desarrollo.", "Em breve: integração em desenvolvimento.")}</p>
              </div>
            ),
          )}
        </div>
      </Section>

      <Section title={T("Medios de pago", "Formas de pagamento")} desc={T("Elegí qué medios aceptás, en qué monedas y qué integración procesa cada uno.", "Escolha quais formas aceita, em quais moedas e qual integração processa cada uma.")}>
        <form action={savePayments.bind(null, slug)} className="space-y-3">
          {PAYMENT_METHODS.map((m) => {
            const o = pay.options.find((x) => x.method === m);
            const compatible = regionProviders.filter((p) => p.methods.includes(m));
            if (compatible.length === 0) return null;
            return (
              <div key={m} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex min-w-32 items-center gap-2 font-semibold">
                    <input type="checkbox" name={`${m}_enabled`} defaultChecked={o?.enabled ?? false} /> {L.paymentMethod[m]}
                  </label>
                  <select name={`${m}_provider`} defaultValue={o?.provider} className="input w-auto flex-1 py-2 text-sm">
                    {compatible.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.available}>
                        {labelOf(p)}
                        {!p.available ? T(" — próximamente", " — em breve") : p.id === "mercadopago" && !mpCreds.accessToken ? T(" — conectá arriba", " — conecte acima") : ""}
                      </option>
                    ))}
                  </select>
                  {regionCurrencies.length > 1 ? (
                    <div className="flex gap-3 text-sm">
                      {regionCurrencies.map((c) => (
                        <label key={c} className="flex items-center gap-1">
                          <input type="checkbox" name={`${m}_${c}`} defaultChecked={o?.currencies.includes(c)} /> {c}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input type="hidden" name={`${m}_${base}`} value="on" />
                  )}
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
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title="Delivery" desc={T(`Tarifa = base + (km × precio por km), redondeada a ${base === "PYG" ? "Gs. 500" : `${sym} 0,50`}. La distancia se calcula con la ubicación del cliente.`, `Taxa = base + (km × preço por km), arredondada para ${base === "PYG" ? "Gs. 500" : `${sym} 0,50`}. A distância é calculada pela localização do cliente.`)}>
        <form action={saveDelivery.bind(null, slug)} className="grid gap-3 sm:grid-cols-3">
          <Field label={T("Latitud del local", "Latitude do local")}><input name="lat" className="input" defaultValue={t.lat ?? ""} placeholder="-25.5097" /></Field>
          <Field label={T("Longitud del local", "Longitude do local")}><input name="lng" className="input" defaultValue={t.lng ?? ""} placeholder="-54.6111" /></Field>
          <Field label={T("Radio máximo (km)", "Raio máximo (km)")}><input name="deliveryMaxKm" className="input" defaultValue={t.deliveryMaxKm} /></Field>
          <Field label={`${T("Tarifa base", "Taxa base")} (${sym})`}><MoneyInput name="deliveryBaseFeePyg" currency={t.currency as Currency} defaultMinor={t.deliveryBaseFeePyg} /></Field>
          <Field label={`${T("Por km", "Por km")} (${sym})`}><MoneyInput name="deliveryPerKmPyg" currency={t.currency as Currency} defaultMinor={t.deliveryPerKmPyg} /></Field>
          <Field label={`${T("Gratis desde", "Grátis a partir de")} (${sym})`}><MoneyInput name="deliveryFreeOverPyg" currency={t.currency as Currency} defaultMinor={t.deliveryFreeOverPyg} placeholder={T("vacío = nunca", "vazio = nunca")} /></Field>
          <p className="text-xs text-muted sm:col-span-3">{T("Tip: en Google Maps, tocá tu local y copiá las coordenadas.", "Dica: no Google Maps, toque no seu local e copie as coordenadas.")}</p>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section title={T("Facturación", "Notas fiscais")} desc={T("Manual (talonario) hoy. SIFEN (factura electrónica) queda listo para activar.", "Registro manual hoje. Emissão eletrônica (NF-e/NFC-e) virá como integração.")}>
        <form action={saveFiscal.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          {pt ? (
            <>
              <input type="hidden" name="provider" value="manual" />
              <input type="hidden" name="establishment" value={fiscal.establishment} />
              <input type="hidden" name="expeditionPoint" value={fiscal.expeditionPoint} />
            </>
          ) : (
            <>
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
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="autoIssue" defaultChecked={fiscal.autoIssue} /> {T("Registrar factura automáticamente al cobrar un pedido", "Registrar nota automaticamente ao receber um pedido")}
          </label>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section
        title={T("Impresora térmica", "Impressora térmica")}
        desc={T(
          "Funciona con cualquier impresora térmica instalada en la computadora (USB, red o Bluetooth). Elegí el ancho del papel.",
          "Funciona com qualquer impressora térmica instalada no computador (USB, rede ou Bluetooth). Escolha a largura do papel.",
        )}
      >
        <form action={savePrinter.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
          <Field label={T("Ancho del papel", "Largura do papel")}>
            <select name="printerWidth" defaultValue={String(t.printerWidth)} className="input">
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="autoPrint" defaultChecked={t.autoPrint} /> {T("Imprimir automáticamente cada pedido nuevo", "Imprimir automaticamente cada pedido novo")}
          </label>
          <p className="text-xs text-muted sm:col-span-2">
            {T(
              "Para imprimir sin la ventana de confirmación, abrí el panel en Chrome con la opción --kiosk-printing y dejá la térmica como impresora predeterminada.",
              "Para imprimir sem a janela de confirmação, abra o painel no Chrome com a opção --kiosk-printing e deixe a térmica como impressora padrão.",
            )}
          </p>
          <Save label={T("Guardar", "Salvar")} />
        </form>
      </Section>

      <Section
        title={<>{T("Informe de cierre de caja", "Relatório de fechamento de caixa")} <ProBadge /></>}
        desc={T(
          "Al cerrar la caja enviamos un resumen: total facturado, producto más vendido, stock actualizado, canal más usado y ticket promedio.",
          "Ao fechar o caixa enviamos um resumo: total faturado, produto mais vendido, estoque atualizado, canal mais usado e ticket médio.",
        )}
      >
        {t.tier === "pro" ? (
          <form action={saveReport.bind(null, slug)} className="grid gap-3 sm:grid-cols-2">
            <Field label={T("Enviar por", "Enviar por")}>
              <select name="reportChannel" defaultValue={t.reportChannel} className="input">
                <option value="none">{T("No enviar", "Não enviar")}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </select>
            </Field>
            <Field label={T("WhatsApp o e-mail de destino", "WhatsApp ou e-mail de destino")}>
              <input name="reportTo" className="input" defaultValue={t.reportTo ?? ""} placeholder={T("+595981123456 o dueño@email.com", "+5581991234567 ou dono@email.com")} />
            </Field>
            <p className="text-xs text-muted sm:col-span-2">{T("También avisamos aquí cuando haya carritos abandonados.", "Também avisamos aqui quando houver carrinhos abandonados.")}</p>
            <Save label={T("Guardar", "Salvar")} />
          </form>
        ) : (
          <ProUpsell locale={region.locale} />
        )}
      </Section>

      <div id="seguranca" />
      <Section title={T("Seguridad", "Segurança")} desc={T("Al cambiar la contraseña, todos los otros dispositivos se desconectan.", "Ao alterar a senha, todos os outros aparelhos são desconectados.")}>
        <form action={changePassword.bind(null, slug)} className="grid gap-2 sm:grid-cols-3">
          <input name="current" type="password" autoComplete="current-password" className="input" placeholder={T("Contraseña actual", "Senha atual")} />
          <input name="password" type="password" autoComplete="new-password" minLength={8} className="input" placeholder={T("Nueva (8+, letras y números)", "Nova (8+, letras e números)")} required />
          <input name="confirm" type="password" autoComplete="new-password" minLength={8} className="input" placeholder={T("Repetir nueva", "Repetir nova")} required />
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button className="btn-primary">{T("Cambiar contraseña", "Alterar senha")}</button>
            <a href={`/painel/${slug}/atividade`} className="text-sm underline">{T("Ver registro de actividad", "Ver registro de atividades")}</a>
          </div>
        </form>
      </Section>

      {googleEnabled() && (
        <Section title={T("Entrar con Google", "Entrar com Google")} desc={T("Además del e-mail del contrato, podés autorizar otra cuenta de Google para entrar al panel como dueño.", "Além do e-mail do contrato, você pode autorizar outra conta Google para entrar no painel como dono.")}>
          <form action={saveLoginEmail.bind(null, slug)} className="flex flex-wrap gap-2">
            <input name="loginEmail" type="email" className="input max-w-sm" defaultValue={t.loginEmail ?? ""} placeholder="voce@gmail.com" />
            <button className="btn-primary">{T("Guardar", "Salvar")}</button>
          </form>
        </Section>
      )}
    </div>
  );
}

function Section({ title, desc, children }: { title: React.ReactNode; desc?: string; children: React.ReactNode }) {
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
