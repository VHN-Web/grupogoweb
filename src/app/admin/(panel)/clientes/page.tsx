import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMinor } from "@/core/money";
import { PLATFORM_LABELS } from "@/core/types";
import { fmtDate } from "@/core/billing";
import { Flash } from "@/components/Flash";
import { StatusPill } from "@/components/StatusPill";
import { deleteCustomers, deleteOrphanStores, newCustomer, orphanStores } from "../actions";
import { THEMES, THEME_IDS } from "@/core/themes";
import { NameInput } from "@/components/forms/NameInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { COUNTRIES, REGIONS } from "@/core/region";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const [customers, plans] = await Promise.all([
    db.query.customers.findMany({ with: { plan: true, tenant: true }, orderBy: desc(schema.customers.createdAt) }),
    db.query.plans.findMany({ where: eq(schema.plans.active, true), orderBy: asc(schema.plans.sortOrder) }),
  ]);
  const orphans = await orphanStores();

  return (
    <div className="space-y-6">
      <Flash {...sp} />
      <details className="card p-5" open={customers.length === 0 || !!sp.err}>
        <summary className="cursor-pointer text-lg font-semibold">+ Novo cliente (contratação)</summary>
        {plans.length === 0 ? (
          <p className="mt-3 text-sm">Cadastre um plano primeiro em <Link className="underline" href="/admin/planos">Planos</Link>.</p>
        ) : (
          <form action={newCustomer} className="mt-4 grid gap-3 sm:grid-cols-2">
            <F label="Nome do estabelecimento"><input name="businessName" className="input" required /></F>
            <F label="Endereço do cardápio (slug)"><input name="slug" className="input" placeholder="gerado do nome se vazio" /></F>
            <F label="País do estabelecimento">
              <select name="country" className="input" defaultValue="BR">
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{REGIONS[c].name.pt} — moeda {REGIONS[c].currency}, idioma {REGIONS[c].locale === "pt" ? "português" : "espanhol"}</option>
                ))}
              </select>
            </F>
            <F label="Nome do responsável"><NameInput name="contactName" required /></F>
            <F label="E-mail (recebe cobranças e acessos)"><input name="email" type="email" className="input" required /></F>
            <F label="WhatsApp (opcional)"><PhoneInput name="whatsapp" defaultCountry="PY" locale="pt" /></F>
            <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="whatsappOptIn" defaultChecked /> Cliente aceita receber avisos por WhatsApp</label>
            <F label="RUC / CNPJ / CPF (opcional)"><input name="ruc" className="input" /></F>
            <F label="Moeda preferida para pagar">
              <select name="currency" className="input" defaultValue="PYG">
                <option value="PYG">Guarani (Gs.)</option>
                <option value="USD">Dólar (US$)</option>
                <option value="BRL">Reais (R$)</option>
              </select>
            </F>
            <F label="Plano" wide>
              <select name="planId" className="input">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {PLATFORM_LABELS.interval[p.interval]} · {formatMinor(p.pricePyg, "PYG")} / {formatMinor(p.priceUsdMinor, "USD")} / {formatMinor(p.priceBrlMinor, "BRL")}
                    {p.includesDomain ? " · domínio grátis" : ""}
                  </option>
                ))}
              </select>
            </F>
            <F label="Modelo do site">
              <select name="theme" className="input" defaultValue="burger">
                {THEME_IDS.map((id) => (
                  <option key={id} value={id}>{THEMES[id].label} — {THEMES[id].segment}</option>
                ))}
              </select>
            </F>
            <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" name="wantsDomain" /> Quer domínio próprio</label>
            <F label="Domínio desejado"><input name="domainName" className="input" placeholder="donmario.com.py" /></F>
            <F label="Observações internas" wide><input name="notes" className="input" /></F>
            <p className="text-xs text-muted sm:col-span-2">Ao criar, o cliente recebe por e-mail (e WhatsApp, se optou) o link para pagar a implantação em Gs., US$ ou R$. Quando o pagamento for confirmado, o sistema dele é criado automaticamente.</p>
            <button className="btn-primary sm:col-span-2">Criar cliente e enviar cobrança</button>
          </form>
        )}
      </details>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-line">
              <th className="w-10 px-4 py-2.5 font-medium"><span className="sr-only">Selecionar</span></th>
              <th className="px-4 py-2.5 font-medium">Cliente</th>
              <th className="px-4 py-2.5 font-medium">Plano</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Próx. vencimento</th>
              <th className="px-4 py-2.5 font-medium">Endereço</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {customers.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">Nenhum cliente ainda</td></tr>}
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-paper">
                <td className="px-4 py-2.5">
                  <input type="checkbox" name="ids" value={c.id} form="apagar-clientes" className="h-4 w-4" aria-label={`Selecionar ${c.businessName}`} />
                </td>
                <td className="px-4 py-2.5"><Link href={`/admin/clientes/${c.id}`} className="font-semibold hover:underline">{c.businessName}</Link><p className="text-xs text-muted">{c.contactName}</p></td>
                <td className="px-4 py-2.5">{c.plan.name}</td>
                <td className="px-4 py-2.5"><StatusPill status={c.status} /></td>
                <td className="px-4 py-2.5">{c.nextBillingAt ? fmtDate(c.nextBillingAt) : "—"}</td>
                <td className="px-4 py-2.5 text-muted">{c.tenant ? (c.tenant.customDomain ?? `/${c.tenant.slug}`) : `/${c.desiredSlug}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {customers.length > 0 && (
        <form id="apagar-clientes" action={deleteCustomers} className="card flex flex-wrap items-center gap-3 border-red-200 p-4 text-sm">
          <span className="font-semibold text-red-700">Apagar selecionados</span>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="withStore" defaultChecked className="h-4 w-4" /> apagar também a loja (site, painel, pedidos, caixa)
          </label>
          <input name="confirm" className="input w-40 py-1.5" placeholder="digite APAGAR" autoComplete="off" />
          <button className="btn-ghost text-red-600">Apagar de vez</button>
          <p className="w-full text-xs text-muted">Some da lista junto com faturas, contratos e recibos. Não dá para desfazer. Lojas de demonstração são preservadas.</p>
        </form>
      )}

      {orphans.length > 0 && (
        <form action={deleteOrphanStores} className="card space-y-3 p-4 text-sm">
          <p className="font-semibold">Lojas sem cliente ({orphans.length})</p>
          <p className="text-xs text-muted">Sobras de testes: lojas criadas que não estão ligadas a nenhum cliente.</p>
          <ul className="space-y-1">
            {orphans.map((t) => (
              <li key={t.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="ids" value={t.id} className="h-4 w-4" /> {t.name} <span className="text-muted">/{t.slug} · {fmtDate(t.createdAt)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <input name="confirm" className="input w-40 py-1.5" placeholder="digite APAGAR" autoComplete="off" />
            <button className="btn-ghost text-red-600">Apagar lojas selecionadas</button>
          </div>
        </form>
      )}
    </div>
  );
}

function F({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
