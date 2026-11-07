import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatPhone } from "@/core/region";
import { waLink } from "@/core/intelligence";
import { courierReport } from "@/services/couriers";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { NameInput } from "@/components/forms/NameInput";
import { MoneyInput } from "@/components/forms/MoneyInput";
import type { Currency } from "@/core/types";
import { deleteCourier, saveCourier } from "../courier-actions";

export const dynamic = "force-dynamic";

export default async function MotoboysPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string; dias?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "couriers");
  const { T, fm, fmtDate, region } = panelI18n(t);
  const cur = t.currency as Currency;
  const days = [1, 7, 15, 30].includes(Number(sp.dias)) ? Number(sp.dias) : 7;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  const rows = await courierReport(t.id, since);
  const total = rows.reduce((a, r) => a + r.payout, 0);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{T("Repartidores", "Motoboys")}</h1>
        <p className="text-sm text-muted">{T("Registrá tus repartidores, asigná cada delivery desde el pedido y mandá la ruta por WhatsApp. Acá ves cuántas entregas hizo cada uno y cuánto pagar.", "Cadastre seus motoboys, atribua cada entrega pela tela do pedido e envie a rota pelo WhatsApp. Aqui você vê quantas entregas cada um fez e quanto pagar.")}</p>
      </div>
      {!t.acceptsDelivery && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{T("El delivery está apagado en Configuración.", "O delivery está desligado em Configurações.")} <Link className="font-semibold underline" href={`/painel/${slug}/config`}>{T("Activar", "Ativar")}</Link></p>}
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <section className="card p-5">
        <h2 className="font-semibold">{T("Nuevo repartidor", "Novo motoboy")}</h2>
        <form action={saveCourier.bind(null, slug, null)} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">{T("Nombre", "Nome")}<NameInput name="name" required /></label>
          <label className="text-sm">WhatsApp<PhoneInput name="phone" defaultCountry={t.country} locale={region.locale} required /></label>
          <label className="text-sm">{T("Vehículo / chapa (opcional)", "Veículo / placa (opcional)")}<input name="vehicle" className="input mt-1" maxLength={80} placeholder={T("Moto Honda · AAA 123", "Moto Honda CG · ABC1D23")} /></label>
          <label className="text-sm">{T("Valor por entrega (opcional)", "Valor por entrega (opcional)")}<MoneyInput name="fee" currency={cur} defaultMinor={0} /></label>
          <label className="text-sm sm:col-span-2">{T("Alias / cuenta para pagarle (opcional)", "Chave Pix para pagar (opcional)")}<input name="pixKey" className="input mt-1" maxLength={120} /></label>
          <p className="text-xs text-muted sm:col-span-2">{T("Sin valor por entrega, el pago sugerido es la suma de las tarifas de delivery cobradas.", "Sem valor por entrega, o pagamento sugerido é a soma das taxas de entrega cobradas.")}</p>
          <button className="btn-brand rounded-xl px-4 py-2.5 font-semibold sm:col-span-2">{T("Registrar", "Cadastrar")}</button>
        </form>
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{T("Entregas y pagos", "Entregas e acerto")}</h2>
          <div className="flex gap-1 text-xs">
            {[1, 7, 15, 30].map((d) => (
              <Link key={d} href={`?dias=${d}`} className={`rounded-lg border border-transparent px-2.5 py-1 font-semibold ${d === days ? "bg-ink text-white" : "btn-ghost"}`}>{d === 1 ? T("Hoy", "Hoje") : `${d} ${T("días", "dias")}`}</Link>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">{T("Total a pagar en el período:", "Total a pagar no período:")} <b className="text-ink">{fm(total)}</b></p>
        <div className="mt-3 divide-y divide-line">
          {rows.length === 0 && <p className="py-3 text-sm text-muted">{T("Todavía no hay repartidores.", "Nenhum motoboy cadastrado ainda.")}</p>}
          {rows.map(({ courier: c, count, fees, payout, orders }) => (
            <details key={c.id} className="py-3 text-sm">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="min-w-40 flex-1">
                  <b>{c.name}</b> {!c.active && <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs">{T("inactivo", "inativo")}</span>}
                  <br />
                  <span className="text-xs text-muted">{formatPhone(c.phone)}{c.vehicle && ` · ${c.vehicle}`}{c.feePerDelivery > 0 && ` · ${fm(c.feePerDelivery)}/${T("entrega", "entrega")}`}</span>
                </span>
                <span className="text-right">{count} {T("entregas", "entregas")} · <b>{fm(payout)}</b>{c.feePerDelivery > 0 && <span className="block text-xs text-muted">{T("tarifas cobradas", "taxas cobradas")} {fm(fees)}</span>}</span>
              </summary>
              <div className="mt-3 space-y-3 rounded-xl bg-black/[.03] p-3">
                <div className="flex flex-wrap gap-2">
                  <a target="_blank" rel="noopener noreferrer" className="btn-brand rounded-lg px-3 py-1.5 text-xs font-semibold" href={waLink(c.phone, T(`Hola ${c.name.split(" ")[0]}! Resumen de ${t.name}: ${count} entregas en el período, total ${fm(payout)}.`, `Oi ${c.name.split(" ")[0]}! Resumo da ${t.name}: ${count} entregas no período, total ${fm(payout)}.`))}>{T("Enviar resumen", "Enviar resumo")}</a>
                  {c.pixKey && <span className="rounded-lg bg-white px-3 py-1.5 text-xs">Pix: <b>{c.pixKey}</b></span>}
                </div>
                {orders.length > 0 && (
                  <p className="text-xs text-muted">{orders.slice(0, 40).map((o) => `#${o.number} (${fmtDate(o.createdAt, { dateStyle: "short" })})`).join(" · ")}</p>
                )}
                <form action={saveCourier.bind(null, slug, c.id)} className="grid gap-2 sm:grid-cols-2">
                  <NameInput name="name" defaultValue={c.name} required />
                  <PhoneInput name="phone" defaultValue={c.phone} defaultCountry={t.country} locale={region.locale} required />
                  <input name="vehicle" className="input" defaultValue={c.vehicle ?? ""} placeholder={T("Vehículo", "Veículo")} />
                  <MoneyInput name="fee" currency={cur} defaultMinor={c.feePerDelivery} />
                  <input name="pixKey" className="input" defaultValue={c.pixKey ?? ""} placeholder="Pix" />
                  <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={c.active} /> {T("Activo", "Ativo")}</label>
                  <button className="btn-primary rounded-lg px-3 py-2 font-semibold">{T("Guardar", "Salvar")}</button>
                </form>
                <form action={deleteCourier.bind(null, slug, c.id)}><button className="text-xs font-semibold text-red-600">{T("Eliminar repartidor", "Remover motoboy")}</button></form>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
