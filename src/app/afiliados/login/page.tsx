import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand/AuthShell";
import { getAffiliate } from "@/lib/affiliate-auth";
import { loginAction } from "../actions";

export const metadata = { title: "GoWeb Afiliados — entrar", robots: { index: false } };

export default async function AffLogin({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (await getAffiliate()) redirect("/afiliados");
  const { err } = await searchParams;
  return (
    <AuthShell eyebrow="Programa de afiliados" title="Entrar no portal">
      <form action={loginAction} className="space-y-3">
        {err && <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{err}</p>}
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" autoComplete="email" required autoFocus />
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
        <button className="btn-brand w-full py-3">Entrar</button>
      </form>
      <p className="mt-6 text-sm text-[#B9B3A7]">
        Ainda não é afiliado? <Link href="/afiliados/cadastro" className="font-semibold text-[#3CC46B] hover:underline">Cadastre-se grátis</Link>
      </p>
      <p className="mt-2 text-xs text-[#8a857b]">Esqueceu a senha? Fale com o suporte da GoWeb pelo WhatsApp.</p>
    </AuthShell>
  );
}
