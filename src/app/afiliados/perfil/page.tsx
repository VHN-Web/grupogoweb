import Link from "next/link";
import { AffShell, Flash } from "@/components/affiliates/AffShell";
import { card } from "@/components/affiliates/ui";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { requireAffiliate } from "@/lib/affiliate-auth";
import { affiliateLink } from "@/services/affiliates";
import { changePasswordAction, saveProfileAction } from "../actions";

export const metadata = { title: "Perfil e Pix — GoWeb Afiliados", robots: { index: false } };

export default async function Profile({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const a = await requireAffiliate();
  const sp = await searchParams;
  return (
    <AffShell name={a.name} status={a.status}>
      <Flash ok={sp.ok} err={sp.err} />
      <h1 className="text-2xl font-bold tracking-tight">Perfil e Pix</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={`${card} p-6`}>
          <h2 className="font-bold">Seus dados</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex gap-2"><dt className="text-[var(--s-muted)]">Nome:</dt><dd className="font-semibold">{a.name}</dd></div>
            <div className="flex gap-2"><dt className="text-[var(--s-muted)]">E-mail:</dt><dd className="font-semibold">{a.email}</dd></div>
            <div className="flex gap-2"><dt className="text-[var(--s-muted)]">Código:</dt><dd className="font-mono font-semibold">{a.code}</dd></div>
            {a.status === "ACTIVE" && <div className="flex gap-2"><dt className="text-[var(--s-muted)]">Link:</dt><dd className="truncate font-semibold">{affiliateLink(a.code)}</dd></div>}
          </dl>
          <form action={saveProfileAction} className="mt-5 space-y-3">
            <div>
              <label className="label" htmlFor="pixKeyType">Tipo da chave Pix</label>
              <select id="pixKeyType" name="pixKeyType" defaultValue={a.pixKeyType} className="input">
                <option value="cpf">CPF</option>
                <option value="phone">Celular</option>
                <option value="email">E-mail</option>
                <option value="random">Chave aleatória</option>
              </select>
            </div>
            <div><label className="label" htmlFor="pixKey">Chave Pix</label><input id="pixKey" name="pixKey" defaultValue={a.pixKey} className="input" required maxLength={80} /></div>
            <div><label className="label" htmlFor="whatsapp">WhatsApp</label><PhoneInput id="whatsapp" name="whatsapp" defaultValue={a.whatsapp} defaultCountry="BR" locale="pt" required /></div>
            <div><label className="label" htmlFor="city">Cidade / UF</label><input id="city" name="city" defaultValue={a.city ?? ""} className="input" maxLength={60} /></div>
            <p className="text-xs text-[var(--s-muted)]">A chave Pix precisa estar no seu nome (titular do CPF cadastrado).</p>
            <button className="btn-brand">Salvar</button>
          </form>
        </section>
        <section className={`${card} p-6`}>
          <h2 className="font-bold">Trocar senha</h2>
          <form action={changePasswordAction} className="mt-4 space-y-3">
            <div><label className="label" htmlFor="current">Senha atual</label><input id="current" name="current" type="password" className="input" autoComplete="current-password" required /></div>
            <div><label className="label" htmlFor="password">Nova senha</label><input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required /></div>
            <button className="btn-primary">Trocar senha</button>
          </form>
          <p className="mt-6 text-sm text-[var(--s-muted)]">Regras do programa: <Link href="/afiliados/termos" className="font-semibold underline">termos do programa de afiliados</Link>.</p>
        </section>
      </div>
    </AffShell>
  );
}
