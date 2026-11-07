import Link from "next/link";
import { cookies } from "next/headers";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { fmtDate } from "@/core/billing";
import { tenantPublicUrl } from "@/lib/urls";
import { demoTemplates } from "@/services/demo";
import { deleteDemo, newDemo, resetDemoPassword } from "../demo-actions";

export const dynamic = "force-dynamic";

export default async function DemosPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  let flash: { slug: string; password: string } | null = null;
  try {
    flash = JSON.parse((await cookies()).get("demo_flash")?.value ?? "null");
  } catch {}
  const [templates, mine] = await Promise.all([
    demoTemplates(),
    db.query.tenants.findMany({ where: and(eq(schema.tenants.demo, true), isNotNull(schema.tenants.demoNote)), orderBy: desc(schema.tenants.createdAt) }),
  ]);
  const models = templates.filter((t) => !mine.some((m) => m.id === t.id));
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Demonstrações</h1>
        <p className="text-sm text-muted">Crie uma loja fictícia com <b>tudo liberado</b> (GoInteligence e todos os módulos) para apresentar a sócios e clientes. Ela vem com cardápio, cupom, funcionário e motoboy de exemplo; nunca envia WhatsApp/e-mail de verdade, não cobra e não aparece na Vitrine nem no Google.</p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
      {flash && (
        <div className="rounded-xl border-2 border-[#3CC46B] bg-white p-4 text-sm">
          <p className="font-bold">Acesso da demonstração (anote agora — a senha não aparece de novo)</p>
          <p className="mt-1">Painel: <a className="font-semibold underline" target="_blank" href={`/painel/${flash.slug}/login`}>/painel/{flash.slug}</a> · senha <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-base">{flash.password}</code></p>
          <p className="text-xs text-muted">Funcionário de exemplo: usuário <b>caixa</b> (ou <b>caja</b>) com a mesma senha.</p>
        </div>
      )}

      <section className="card p-5">
        <h2 className="font-semibold">Nova demonstração</h2>
        <form action={newDemo} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input name="name" className="input" placeholder="Nome da loja (ex.: Pizzaria do João)" required maxLength={60} />
          <select name="template" className="input" required>
            {models.map((t) => (
              <option key={t.id} value={t.slug}>{t.country === "BR" ? "🇧🇷" : "🇵🇾"} {t.name}{t.tagline ? ` — ${t.tagline}` : ""}</option>
            ))}
          </select>
          <input name="slug" className="input" placeholder="Endereço (opcional, ex.: pizzaria-joao)" maxLength={40} />
          <input name="note" className="input" placeholder="Para quem / observação (ex.: reunião com sócio)" maxLength={120} />
          <button className="btn-brand rounded-xl px-4 py-2.5 font-semibold sm:col-span-2">Criar com tudo liberado</button>
        </form>
      </section>

      <section className="card divide-y divide-line">
        {mine.length === 0 && <p className="p-5 text-sm text-muted">Nenhuma demonstração criada ainda.</p>}
        {mine.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
            <div className="min-w-48 flex-1">
              <p className="font-semibold">{t.name} <span className="rounded-full bg-[#1F7FD8]/10 px-2 py-0.5 text-xs font-bold text-[#1F7FD8]">DEMO</span></p>
              <p className="text-xs text-muted">{t.demoNote} · criada em {fmtDate(t.createdAt)} · {t.country === "BR" ? "Brasil" : "Paraguai"}</p>
            </div>
            <a target="_blank" href={tenantPublicUrl(t)} className="btn-ghost rounded-lg px-3 py-1.5 font-semibold">Ver loja</a>
            <Link target="_blank" href={`/painel/${t.slug}`} className="btn-ghost rounded-lg px-3 py-1.5 font-semibold">Abrir painel</Link>
            <form action={resetDemoPassword.bind(null, t.id)}><button className="btn-ghost rounded-lg px-3 py-1.5 font-semibold">Nova senha</button></form>
            <form action={deleteDemo.bind(null, t.id)}><button className="rounded-lg px-3 py-1.5 font-semibold text-red-600 hover:bg-red-50">Apagar</button></form>
          </div>
        ))}
      </section>
    </div>
  );
}
