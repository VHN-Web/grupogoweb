import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AuthShell } from "@/components/brand/AuthShell";
import { NameInput } from "@/components/forms/NameInput";
import { PhoneInput } from "@/components/forms/PhoneInput";
import { db, schema } from "@/db";
import { normalizeAffCode, shortName } from "@/core/affiliates";
import { getAffiliate } from "@/lib/affiliate-auth";
import { fmtDateTime, nextCohort } from "@/services/affiliates";
import { signupAction } from "../actions";

export const metadata = { title: "GoWeb Afiliados — cadastro", description: "Indique a GoWeb e ganhe comissão sobre cada implantação paga." };

export default async function AffSignup({ searchParams }: { searchParams: Promise<{ err?: string; indicacao?: string }> }) {
  if (await getAffiliate()) redirect("/afiliados");
  const { err, indicacao } = await searchParams;
  const rc = normalizeAffCode(indicacao ?? "");
  const rec = rc ? await db.query.affiliates.findFirst({ where: eq(schema.affiliates.code, rc), columns: { name: true, status: true } }) : null;
  const cohort = await nextCohort();
  return (
    <AuthShell eyebrow="Programa de afiliados · Brasil" title="Crie a sua conta">
      {rec?.status === "ACTIVE" && <p className="mb-4 rounded-xl bg-[#3CC46B]/15 px-4 py-3 text-sm text-[#bdf0cf]">Você foi convidado por <b>{shortName(rec.name)}</b>.</p>}
      <p className="mb-5 text-sm text-[#B9B3A7]">
        Sem taxa e sem meta. Depois do cadastro você entra na turma da próxima <b className="text-white">live de boas-vindas</b>
        {cohort ? <> (<b className="text-white">{fmtDateTime(cohort.startsAt)}</b>)</> : null}; o seu link é liberado logo depois da live.
      </p>
      <form action={signupAction} className="space-y-3">
        {err && <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{err}</p>}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <input type="hidden" name="indicacao" value={rc} />
        <label className="label" htmlFor="name">Nome completo</label>
        <NameInput id="name" name="name" required />
        <label className="label" htmlFor="cpf">CPF</label>
        <input id="cpf" name="cpf" className="input" inputMode="numeric" placeholder="000.000.000-00" maxLength={14} required />
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        <label className="label" htmlFor="whatsapp">WhatsApp</label>
        <PhoneInput id="whatsapp" name="whatsapp" defaultCountry="BR" locale="pt" required />
        <label className="label" htmlFor="city">Cidade / UF</label>
        <input id="city" name="city" className="input" placeholder="Recife / PE" maxLength={60} />
        <fieldset className="rounded-2xl border border-[#33333a] p-3">
          <legend className="px-1 text-[13px] font-semibold text-[#B9B3A7]">Chave Pix para receber</legend>
          <select name="pixKeyType" className="input" aria-label="Tipo da chave Pix" defaultValue="cpf">
            <option value="cpf">CPF (o mesmo do cadastro)</option>
            <option value="phone">Celular</option>
            <option value="email">E-mail</option>
            <option value="random">Chave aleatória</option>
          </select>
          <input name="pixKey" className="input mt-2" placeholder="Deixe vazio para usar o seu CPF" aria-label="Chave Pix" maxLength={80} />
        </fieldset>
        <label className="label" htmlFor="code">Código do seu link (opcional)</label>
        <div className="flex items-center gap-2 text-sm text-[#8a857b]">
          <span>goweboficial.com/a/</span>
          <input id="code" name="code" className="input" placeholder="SEUNOME" maxLength={12} pattern="[A-Za-z0-9]{3,12}" />
        </div>
        <label className="label" htmlFor="password">Senha (mín. 8 caracteres)</label>
        <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        <label className="label" htmlFor="password2">Repita a senha</label>
        <input id="password2" name="password2" type="password" className="input" autoComplete="new-password" minLength={8} required />
        <label className="flex items-start gap-2 pt-1 text-sm text-[#B9B3A7]">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>Li e aceito os <Link href="/afiliados/termos" target="_blank" className="font-semibold text-[#3CC46B] underline">termos do programa de afiliados</Link>.</span>
        </label>
        <button className="btn-brand w-full py-3">Criar conta de afiliado</button>
      </form>
      <p className="mt-6 text-sm text-[#B9B3A7]">
        Já tem conta? <Link href="/afiliados/login" className="font-semibold text-[#3CC46B] hover:underline">Entrar</Link>
      </p>
    </AuthShell>
  );
}
