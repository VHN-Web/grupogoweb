import { CourierShell } from "@/components/courier/CourierShell";
import { courierEarnings } from "@/services/courier-app";
import { courierCtx } from "../ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ganhos" };

export default async function CourierEarnings() {
  const { courier: c, tenant, T, fm, fmtDay, shell } = await courierCtx();
  const e = await courierEarnings(c, tenant);
  const cards = [
    { label: T("Hoy", "Hoje"), ...e.today },
    { label: T("Esta semana", "Esta semana"), ...e.week },
    { label: T("Este mes", "Este mês"), ...e.month },
  ];
  return (
    <CourierShell {...shell} tab="ganhos">
      <h1 className="text-xl font-bold">{T("Mis ganancias", "Meus ganhos")}</h1>
      <p className="mt-1 text-sm text-[var(--s-muted)]">
        {c.feePerDelivery > 0
          ? T(`Valor acordado con ${tenant.name}: ${fm(c.feePerDelivery)} por entrega.`, `Valor combinado com ${tenant.name}: ${fm(c.feePerDelivery)} por entrega.`)
          : T("Cada entrega suma la tarifa de delivery cobrada al cliente.", "Cada entrega soma a taxa de entrega cobrada do cliente.")}
      </p>
      <div className="mt-4 grid gap-3">
        {cards.map((k, i) => (
          <div key={k.label} className={`rounded-3xl p-5 ${i === 0 ? "bg-[#12351f] text-[#E8F7EE]" : "border border-[var(--s-line)] bg-[var(--s-card)]"}`}>
            <p className="text-xs font-bold uppercase tracking-[.14em] opacity-80">{k.label}</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{fm(k.total)}</p>
            <p className="mt-1 text-sm opacity-80">{k.count} {k.count === 1 ? T("entrega", "entrega") : T("entregas", "entregas")}{k.km > 0 && ` · ~${k.km} km`}</p>
          </div>
        ))}
      </div>
      {c.pixKey && <p className="mt-4 rounded-2xl bg-[var(--s-soft)] p-3 text-sm">{T("Tu clave para recibir", "Sua chave Pix para receber")}: <b>{c.pixKey}</b></p>}
      <h2 className="mb-2 mt-6 text-xs font-bold uppercase tracking-[.14em] text-[var(--s-muted)]">{T("Últimas entregas", "Últimas entregas")}</h2>
      {e.recent.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--s-line)] p-5 text-center text-sm text-[var(--s-muted)]">{T("Todavía no hay entregas concluidas este mes.", "Nenhuma entrega concluída neste mês ainda.")}</p>
      ) : (
        <ul className="divide-y divide-[var(--s-line)] rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]">
          {e.recent.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-bold">#{o.number}</p>
                <p className="truncate text-xs text-[var(--s-muted)]">{fmtDay(o.deliveredAt ?? o.createdAt)}{o.address && ` · ${o.address}`}</p>
              </div>
              <b className="tabular-nums">{fm(o.earning)}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-[var(--s-muted)]">{T("El pago lo hace la tienda. Este resumen es el mismo que ve la tienda en el panel.", "O pagamento é feito pela loja. Este resumo é o mesmo que a loja vê no painel.")}</p>
    </CourierShell>
  );
}
