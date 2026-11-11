import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { formatMoney } from "@/core/money";
import { MIN_REAL_MENU, NICHES, nicheOf } from "@/core/store-research";
import type { MenuItem } from "@/core/menu-import";
import { tenantPublicUrl } from "@/lib/urls";
import { getDraft } from "@/services/demo-ai";
import { createFromDraftAction } from "../../../demo-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SOURCE: Record<string, string> = { ifood: "iFood", site: "site", instagram: "Instagram", google: "Google", foto: "fotos enviadas", nenhum: "" };

export default async function GeovanaDraft({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const d = await getDraft(id);
  if (!d) notFound();
  const p = d.profile;
  const currency = d.input.country === "BR" ? "BRL" : "PYG";
  const made = d.tenantId ? await db.query.tenants.findFirst({ where: eq(schema.tenants.id, d.tenantId), columns: { slug: true, name: true, customDomain: true } }) : null;
  const realMenu = !!p && p.menu.length >= MIN_REAL_MENU;
  const byCat = new Map<string, MenuItem[]>();
  for (const m of p?.menu ?? []) byCat.set(m.category, [...(byCat.get(m.category) ?? []), m]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/admin/demos" className="text-sm text-muted underline">← Demonstrações</Link>
        <h1 className="mt-2 text-xl font-bold">Prévia da Geovana: {p?.name || d.input.name}</h1>
        <p className="text-sm text-muted">Confira e corrija antes de criar. Na demo os contatos continuam fictícios e nada é enviado de verdade.</p>
      </div>
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
      {made && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Esta pesquisa já virou a demonstração <b>{made.name}</b>: <a className="underline" target="_blank" href={tenantPublicUrl(made)}>ver loja</a> · <a className="underline" target="_blank" href={`/painel/${made.slug}`}>abrir painel</a>
        </p>
      )}

      {!p ? (
        <section className="card p-5">
          <h2 className="font-semibold">A Geovana não conseguiu montar o perfil</h2>
          <p className="mt-1 text-sm text-muted">{d.error ?? "Tente de novo."}</p>
          <Link href="/admin/demos#geovana" className="btn-brand mt-3 inline-flex rounded-xl px-4 py-2.5 font-semibold">Tentar de novo</Link>
        </section>
      ) : (
        <>
          {!p.found && (
            <p className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              A Geovana <b>não teve certeza</b> de que achou este estabelecimento. Confira os dados abaixo — se estiver errado, pesquise de novo com o link do Google Maps ou do Instagram.
            </p>
          )}

          <section className="card grid gap-4 p-5 md:grid-cols-3">
            <div className="md:col-span-2">
              <h2 className="font-semibold">O que ela encontrou</h2>
              {p.description && <p className="mt-2 text-sm">{p.description}</p>}
              <ul className="mt-3 space-y-1 text-sm text-muted">
                {p.rating != null && <li>Google: <b>{p.rating.toLocaleString("pt-BR")}</b>{p.reviews != null ? ` (${p.reviews} avaliações)` : ""}</li>}
                {p.hours && <li>Horário: {p.hours}</li>}
                <li>Atende: {[p.delivery && "entrega", p.pickup && "retirada", p.dineIn && "no local"].filter(Boolean).join(", ") || "—"}</li>
                {p.instagram && <li>Instagram: @{p.instagram}</li>}
                {p.website && <li>Site: {p.website}</li>}
              </ul>
              {p.highlights.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.highlights.map((h) => <span key={h} className="rounded-full bg-[#3CC46B]/15 px-3 py-1 text-xs font-semibold text-emerald-800">{h}</span>)}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">Fontes</h3>
              {p.sources.length === 0 ? <p className="mt-2 text-sm text-muted">Sem fontes informadas.</p> : (
                <ul className="mt-2 space-y-1 text-sm">
                  {p.sources.map((s) => <li key={s.url} className="truncate"><a className="underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}
                </ul>
              )}
            </div>
          </section>

          {!made && (
            <form action={createFromDraftAction.bind(null, d.id)} className="card space-y-4 p-5">
              <h2 className="font-semibold">Como a demo vai ficar</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="name">Nome da loja</label><input id="name" name="name" className="input" required maxLength={60} defaultValue={p.name} /></div>
                <div>
                  <label className="label" htmlFor="niche">Nicho (define o visual e a atendente)</label>
                  <select id="niche" name="niche" className="input" defaultValue={p.niche}>
                    {NICHES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                  </select>
                </div>
                <div><label className="label" htmlFor="tagline">Frase da loja</label><input id="tagline" name="tagline" className="input" maxLength={60} defaultValue={p.tagline} /></div>
                <div>
                  <label className="label" htmlFor="color">Cor da marca</label>
                  <div className="flex items-center gap-2">
                    <input id="color" name="color" type="color" className="h-11 w-14 cursor-pointer rounded-lg border border-line" defaultValue={p.color ?? "#16130F"} />
                    <span className="text-xs text-muted">{p.color ? "cor encontrada na marca" : "não achou a cor — escolha uma"}</span>
                  </div>
                </div>
                <div className="sm:col-span-2"><label className="label" htmlFor="address">Endereço</label><input id="address" name="address" className="input" maxLength={200} defaultValue={p.address} /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor="hours">Horário (a Geovana usa para responder)</label><input id="hours" name="hours" className="input" maxLength={200} defaultValue={p.hours} /></div>
                <div className="sm:col-span-2"><label className="label" htmlFor="note">Para quem / observação</label><input id="note" name="note" className="input" maxLength={120} placeholder={`Ex.: reunião com o dono da ${p.name}`} /></div>
              </div>

              <div className="rounded-xl bg-black/[.03] p-4">
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="useMenu" defaultChecked={realMenu} disabled={!realMenu} className="mt-1 h-5 w-5 accent-[#3CC46B]" />
                  <span className="text-sm">
                    {realMenu ? (
                      <><b>Usar o cardápio real</b>: {p.menu.length} produtos{SOURCE[p.menuSource] ? ` (fonte: ${SOURCE[p.menuSource]})` : ""}. Desmarque para usar o cardápio de exemplo do modelo {nicheOf(p.niche).label.toLowerCase()}.</>
                    ) : (
                      <>Não achei o cardápio com preços na internet: a demo usa o <b>cardápio de exemplo</b> do nicho. Para usar o real, pesquise de novo enviando fotos do cardápio.</>
                    )}
                  </span>
                </label>
                {realMenu && (
                  <div className="mt-3 max-h-80 space-y-3 overflow-y-auto text-sm">
                    {[...byCat.entries()].map(([cat, items]) => (
                      <div key={cat}>
                        <p className="font-semibold">{cat}</p>
                        <ul className="divide-y divide-line">
                          {items.map((m) => (
                            <li key={m.name} className="flex gap-3 py-1">
                              <span className="min-w-0 flex-1"><span className="block truncate">{m.name}</span>{m.description && <span className="block truncate text-xs text-muted">{m.description}</span>}</span>
                              <span className="tabular-nums">{formatMoney(m.priceMinor, currency)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted">A demo vem com tudo liberado: cardápio, pedidos, caixa, cupom, motoboy de exemplo e a Geovana configurada como atendente desta loja (teste em Painel → Geovana → Simulador).</p>
              <button className="btn-brand w-full rounded-xl px-4 py-3 font-semibold">Criar demonstração</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
