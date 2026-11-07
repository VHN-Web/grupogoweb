import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { formatPhone } from "@/core/region";
import { SEGMENTS, SEGMENT_LABELS, SOURCE_LABELS, formatBirthday, normalizeSource, type Segment } from "@/core/growth";
import { waLink } from "@/core/intelligence";
import { growthOf, pendingRewards, segmentRows, shopperRows, sourceStats } from "@/services/growth";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { ProBadge } from "@/components/ProUpsell";
import { newCampaign } from "../growth-actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string; q?: string; seg?: string; dias?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, fm, fmtDate, locale } = panelI18n(t);
  const { cfg, pro } = growthOf(t);
  const days = [7, 30, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const seg: Segment = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Segment) : "all";
  const [rows, sources, rewards, campaigns] = await Promise.all([
    shopperRows(t.id),
    sourceStats(t.id, days),
    pendingRewards(t.id),
    db.query.campaigns.findMany({ where: eq(schema.campaigns.tenantId, t.id), orderBy: desc(schema.campaigns.createdAt), limit: 10 }),
  ]);
  const q = (sp.q ?? "").toLowerCase().trim();
  const shown = segmentRows(rows, seg, false).filter((r) => !q || r.name.toLowerCase().includes(q) || r.phone.includes(q.replace(/\D/g, "") || "§"));
  const totalSrc = sources.reduce((a, s) => a + s.orders, 0) || 1;
  const mm = String(new Date().getMonth() + 1).padStart(2, "0");
  const bdays = rows.filter((r) => r.birthday?.startsWith(`${mm}-`)).sort((a, b) => (a.birthday! < b.birthday! ? -1 : 1));
  const optIn = rows.filter((r) => r.marketingOptIn).length;
  const L = (o: { es: string; pt: string }) => (locale === "pt" ? o.pt : o.es);
  const campaignsOn = pro && cfg.campaigns.enabled;
  const tpl = T(
    "¡Hola {nome}! Te extrañamos en {loja} Usá el cupón {cupom} en tu próximo pedido: {link}",
    "Oi {nome}! Sentimos sua falta na {loja} Use o cupom {cupom} no seu próximo pedido: {link}",
  );

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{T("Clientes", "Clientes")}</h1>
          <p className="text-sm text-muted">{T(`${rows.length} clientes · ${optIn} aceptan recibir ofertas`, `${rows.length} clientes · ${optIn} aceitam receber ofertas`)}</p>
        </div>
        <a href={`/api/painel/${slug}/clientes.csv`} className="btn-ghost rounded-xl px-4 py-2 text-sm font-semibold">⬇ {T("Exportar planilla", "Exportar planilha")}</a>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="pin" size={18} className="text-[var(--section)]" />{T("De dónde vienen tus ventas", "De onde vêm suas vendas")}</h2>
          <div className="flex gap-1 text-xs">
            {[7, 30, 90].map((d) => (
              <Link key={d} href={`?dias=${d}`} className={`rounded-lg border border-transparent px-2.5 py-1 font-semibold ${d === days ? "bg-ink text-white" : "btn-ghost"}`}>{d} {T("días", "dias")}</Link>
            ))}
          </div>
        </div>
        <p className="mt-0.5 text-sm text-muted">{T("Usá los enlaces de Divulgación en cada red para saber cuál vende más.", "Use os links da aba Divulgação em cada rede para saber qual vende mais.")}</p>
        <div className="mt-4 space-y-2">
          {sources.length === 0 && <p className="text-sm text-muted">{T("Todavía no hay pedidos en este período.", "Ainda não há pedidos neste período.")}</p>}
          {sources.map((s) => (
            <div key={s.source} className="text-sm">
              <div className="flex justify-between"><span className="font-semibold">{L(SOURCE_LABELS[normalizeSource(s.source)])}</span><span className="text-muted">{s.orders} · {fm(s.total)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-[#3CC46B]" style={{ width: `${Math.max(3, (s.orders / totalSrc) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      {rewards.length > 0 && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="gift" size={18} className="text-[var(--section)]" />{T("Premios para avisar", "Prêmios para avisar")}</h2>
          <p className="mt-0.5 text-sm text-muted">{T("Cupones generados por fidelidad, recomendación o cumpleaños que el cliente todavía no usó.", "Cupons gerados por fidelidade, indicação ou aniversário que o cliente ainda não usou.")}</p>
          <div className="mt-3 divide-y divide-line">
            {rewards.slice(0, 20).map(({ coupon: c, shopper: s }) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <p className="min-w-48 flex-1"><b>{s.name}</b> <span className="text-muted">· {formatPhone(s.phone)}</span><br /><span className="text-xs text-muted">{c.code} · {c.kind === "PERCENT" ? `${c.value}%` : fm(c.value)}{c.expiresAt && ` · ${T("vence", "vence")} ${fmtDate(c.expiresAt, { dateStyle: "short" })}`}</span></p>
                <a target="_blank" rel="noopener noreferrer" className="btn-brand rounded-lg px-3 py-1.5 text-xs font-semibold" href={waLink(s.phone, T(`¡Hola ${s.name.split(" ")[0]}! Tenés un regalo en ${t.name}: cupón ${c.code} (${c.kind === "PERCENT" ? `${c.value}%` : fm(c.value)}).`, `Oi ${s.name.split(" ")[0]}! Você ganhou um presente na ${t.name}: cupom ${c.code} (${c.kind === "PERCENT" ? `${c.value}%` : fm(c.value)}).`))}>WhatsApp</a>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="megaphone" size={18} className="text-[var(--section)]" />{T("Campañas de reactivación", "Campanhas de reativação")} <ProBadge /></h2>
        {!pro ? (
          <p className="mt-1 text-sm text-muted">{T("Mandá mensajes con cupón a quien no compra hace tiempo. Disponible en GoInteligence.", "Mande mensagens com cupom para quem sumiu. Disponível no GoInteligence.")} <Link className="font-semibold underline" href={`/painel/${slug}/plano`}>{T("Ver planes", "Ver planos")}</Link></p>
        ) : !cfg.campaigns.enabled ? (
          <p className="mt-1 text-sm text-muted">{T("Las campañas están apagadas.", "As campanhas estão desligadas.")} <Link className="font-semibold underline" href={`/painel/${slug}/crescimento`}>{T("Activar en Crecimiento", "Ativar em Crescimento")}</Link></p>
        ) : (
          <>
            <p className="mt-0.5 text-sm text-muted">{T("Solo reciben quienes aceptaron ofertas en el checkout (LGPD). Variables: {nome} {loja} {cupom} {link}.", "Só recebe quem autorizou ofertas no checkout (LGPD). Variáveis: {nome} {loja} {cupom} {link}.")}</p>
            <form action={newCampaign.bind(null, slug)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input name="name" className="input" placeholder={T("Nombre (ej.: Volvé en noviembre)", "Nome (ex.: Volta de novembro)")} maxLength={80} />
              <select name="segment" className="input" defaultValue="away30">
                {SEGMENTS.map((s) => {
                  const n = segmentRows(rows, s, true).length;
                  return <option key={s} value={s}>{L(SEGMENT_LABELS[s])} · {n}</option>;
                })}
              </select>
              <textarea name="message" className="input sm:col-span-2" rows={3} defaultValue={tpl} maxLength={700} required />
              <label className="text-sm">{T("Cupón de descuento (%)", "Cupom de desconto (%)")}<input name="couponPct" className="input mt-1" inputMode="numeric" defaultValue="10" placeholder="0 = sem cupom" /></label>
              <label className="text-sm">{T("Validez (días)", "Validade (dias)")}<input name="couponDays" className="input mt-1" inputMode="numeric" defaultValue="15" /></label>
              <button className="btn-brand rounded-xl px-4 py-2.5 font-semibold sm:col-span-2">{T("Crear campaña", "Criar campanha")}</button>
            </form>
          </>
        )}
        {campaignsOn && campaigns.length > 0 && (
          <div className="mt-4 divide-y divide-line border-t border-line">
            {campaigns.map((c) => (
              <Link key={c.id} href={`/painel/${slug}/clientes/campanha/${c.id}`} className="flex justify-between py-2.5 text-sm hover:underline">
                <span><b>{c.name}</b> · {L(SEGMENT_LABELS[c.segment as Segment] ?? SEGMENT_LABELS.all)}</span>
                <span className="text-muted">{(JSON.parse(c.recipients) as unknown[]).length} · {fmtDate(c.createdAt, { dateStyle: "short" })}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {bdays.length > 0 && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="cake" size={18} className="text-[var(--section)]" />{T("Cumpleañeros del mes", "Aniversariantes do mês")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {bdays.map((r) => (
              <a key={r.id} target="_blank" rel="noopener noreferrer" href={waLink(r.phone, T(`¡Feliz cumpleaños, ${r.name.split(" ")[0]}!`, `Feliz aniversário, ${r.name.split(" ")[0]}!`))} className="btn-ghost rounded-full px-3 py-1.5 text-sm">{formatBirthday(r.birthday)} · {r.name}</a>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5">
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q} className="input min-w-48 flex-1" placeholder={T("Buscar por nombre o teléfono", "Buscar por nome ou telefone")} />
          <select name="seg" defaultValue={seg} className="input w-auto">
            {SEGMENTS.map((s) => <option key={s} value={s}>{L(SEGMENT_LABELS[s]).replace(/ \((con|com) .*\)/, "")}</option>)}
          </select>
          <button className="btn-primary rounded-xl px-4 py-2 text-sm font-semibold">{T("Filtrar", "Filtrar")}</button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm [&_td]:pr-3 [&_th]:pr-3">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-2">{T("Cliente", "Cliente")}</th><th>{T("Pedidos", "Pedidos")}</th><th>Total</th><th>{T("Última compra", "Última compra")}</th><th>{T("Ofertas", "Ofertas")}</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.length === 0 && <tr><td colSpan={6} className="py-4 text-muted">{T("Los clientes aparecen aquí cuando informan el WhatsApp en un pedido.", "Os clientes aparecem aqui quando informam o WhatsApp em um pedido.")}</td></tr>}
              {shown.slice(0, 300).map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5"><b>{r.name}</b><br /><span className="text-xs text-muted">{formatPhone(r.phone)}{r.birthday && ` · ${formatBirthday(r.birthday)}`}</span></td>
                  <td>{r.orders}</td>
                  <td>{fm(r.total)}</td>
                  <td className="text-muted">{r.lastOrderAt ? fmtDate(r.lastOrderAt, { dateStyle: "short" }) : "—"}</td>
                  <td>{r.marketingOptIn ? "✓" : "—"}</td>
                  <td><a target="_blank" rel="noopener noreferrer" className="text-[#1F7FD8] font-semibold" href={waLink(r.phone, `${T("¡Hola", "Oi")} ${r.name.split(" ")[0]}!`)}>WhatsApp</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
