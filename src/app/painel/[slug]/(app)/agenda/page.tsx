import Link from "next/link";
import { and, asc, eq, gte, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { parseBookingConfig } from "@/core/intelligence";
import { formatPhone } from "@/core/region";
import { ProBadge, ProUpsell } from "@/components/ProUpsell";
import { AutoRefresh } from "@/components/AutoRefresh";
import { saveBooking, setAppointmentStatus } from "../pro-actions";

export const dynamic = "force-dynamic";

const DAYS = [
  ["Domingo", "Domingo"],
  ["Lunes", "Segunda"],
  ["Martes", "Terça"],
  ["Miércoles", "Quarta"],
  ["Jueves", "Quinta"],
  ["Viernes", "Sexta"],
  ["Sábado", "Sábado"],
] as const;

export default async function AgendaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "agenda");
  const { T, fm, region } = panelI18n(t);
  if (t.tier !== "pro")
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Agenda <ProBadge /></h1>
        <ProUpsell locale={region.locale} />
      </div>
    );
  const cfg = parseBookingConfig(t.bookingConfig);
  const [appts, services] = await Promise.all([
    db.query.appointments.findMany({
      where: and(eq(schema.appointments.tenantId, t.id), gte(schema.appointments.startsAt, new Date(Date.now() - 12 * 3600e3))),
      orderBy: asc(schema.appointments.startsAt),
      limit: 200,
    }),
    db.query.products.findMany({ where: and(eq(schema.products.tenantId, t.id), isNotNull(schema.products.durationMin)) }),
  ]);
  const day = new Intl.DateTimeFormat(region.intlLocale, { weekday: "long", day: "2-digit", month: "2-digit", timeZone: region.timeZone });
  const hour = new Intl.DateTimeFormat(region.intlLocale, { hour: "2-digit", minute: "2-digit", timeZone: region.timeZone });
  const groups = new Map<string, typeof appts>();
  for (const a of appts) {
    const k = day.format(a.startsAt);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const badge: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-900",
    CONFIRMED: "bg-emerald-100 text-emerald-800",
    CANCELLED: "bg-zinc-100 text-zinc-500 line-through",
    DONE: "bg-blue-100 text-blue-800",
  };
  const label: Record<string, string> = {
    PENDING: T("Por confirmar", "A confirmar"),
    CONFIRMED: T("Confirmado", "Confirmado"),
    CANCELLED: T("Cancelado", "Cancelado"),
    DONE: T("Atendido", "Atendido"),
  };

  return (
    <div className="max-w-5xl space-y-6">
      <AutoRefresh ms={15000} />
      <h1 className="text-xl font-bold">Agenda <ProBadge /></h1>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}

      <section className="card p-5">
        <h2 className="font-semibold">{T("Próximos turnos", "Próximos horários")}</h2>
        {!cfg.enabled && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {T("La agenda está desactivada en tu sitio. Activala abajo.", "A agenda está desativada no seu site. Ative abaixo.")}
          </p>
        )}
        {services.length === 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {T("Ningún servicio con duración. En ", "Nenhum serviço com duração. Em ")}
            <Link className="underline" href={`/painel/${slug}/produtos`}>{T("Productos", "Produtos")}</Link>
            {T(", completá «Duración en minutos» en los servicios que se reservan (ej: corte 30 min).", ", preencha “Duração em minutos” nos serviços que são agendados (ex: corte 30 min).")}
          </p>
        )}
        {groups.size === 0 && <p className="mt-3 text-sm text-muted">{T("Sin turnos por ahora.", "Nenhum horário marcado por enquanto.")}</p>}
        {[...groups.entries()].map(([d, list]) => (
          <div key={d} className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">{d}</p>
            <ul className="mt-1 divide-y divide-line">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <b className="w-14 tabular-nums">{hour.format(a.startsAt)}</b>
                  <span className="min-w-40 flex-1">
                    <b>{a.customerName}</b> · {a.serviceName} <span className="text-muted">({a.durationMin} min · {fm(a.pricePyg)})</span>
                    <br />
                    <a className="text-xs text-muted underline" href={`https://wa.me/${a.customerPhone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                      {formatPhone(a.customerPhone)}
                    </a>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge[a.status]}`}>{label[a.status]}</span>
                  {a.status === "PENDING" && (
                    <form action={setAppointmentStatus.bind(null, slug, a.id, "CONFIRMED")}>
                      <button className="rounded-xl bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white">✓ {T("Confirmar por WhatsApp", "Confirmar no WhatsApp")}</button>
                    </form>
                  )}
                  {a.status === "CONFIRMED" && (
                    <form action={setAppointmentStatus.bind(null, slug, a.id, "DONE")}>
                      <button className="btn-ghost px-3 py-1.5 text-xs">{T("Atendido", "Atendido")}</button>
                    </form>
                  )}
                  {(a.status === "PENDING" || a.status === "CONFIRMED") && (
                    <form action={setAppointmentStatus.bind(null, slug, a.id, "CANCELLED")}>
                      <button className="text-xs text-red-600 hover:underline">{T("Cancelar", "Cancelar")}</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">{T("Horarios de atención", "Horários de atendimento")}</h2>
        <form action={saveBooking.bind(null, slug)} className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> {T("Permitir reservas en mi sitio", "Permitir agendamentos no meu site")}
          </label>
          <div className="space-y-2">
            {DAYS.map(([es, pt], d) => {
              const [a, b] = (cfg.hours[d] || "").split("-");
              return (
                <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex w-32 items-center gap-2">
                    <input type="checkbox" name={`open_${d}`} defaultChecked={!!cfg.hours[d]} /> {T(es, pt)}
                  </label>
                  <input type="time" name={`from_${d}`} defaultValue={a || "09:00"} className="input py-1.5" style={{ width: 130 }} />
                  <span className="text-muted">—</span>
                  <input type="time" name={`to_${d}`} defaultValue={b || "18:00"} className="input py-1.5" style={{ width: 130 }} />
                </div>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">{T("Intervalo entre turnos", "Intervalo entre horários")}</label>
              <select name="slotMin" defaultValue={String(cfg.slotMin)} className="input">
                {[15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{T("Anticipación mínima", "Antecedência mínima")}</label>
              <select name="leadMin" defaultValue={String(cfg.leadMin)} className="input">
                {[0, 30, 60, 120, 240, 1440].map((m) => (
                  <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{T("Días disponibles", "Dias disponíveis")}</label>
              <select name="daysAhead" defaultValue={String(cfg.daysAhead)} className="input">
                {[7, 14, 30, 60].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-brand">{T("Guardar", "Salvar")}</button>
        </form>
      </section>
    </div>
  );
}
