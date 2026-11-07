import { redirect } from "next/navigation";
import { hasModule } from "@/core/modules";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { PANEL_AREAS, PANEL_AREA_LABELS, type PanelArea } from "@/core/types";
import { ProBadge, ProUpsell } from "@/components/ProUpsell";
import { createStaff, deleteStaff, updateStaff } from "../pro-actions";

export const dynamic = "force-dynamic";

const AREAS = PANEL_AREAS.filter((a) => a !== "team");

export default async function TeamPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "team");
  const { T, region } = panelI18n(t);
  const L = (a: PanelArea) => (region.locale === "pt" ? PANEL_AREA_LABELS[a].pt : PANEL_AREA_LABELS[a].es);
  if (!hasModule(t, "equipe")) redirect(`/painel/${slug}/plano?modulo=team`);
  if (t.tier !== "pro")
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">{T("Equipo", "Equipe")} <ProBadge /></h1>
        <ProUpsell locale={region.locale} />
      </div>
    );
  const list = await db.query.staff.findMany({ where: eq(schema.staff.tenantId, t.id), orderBy: asc(schema.staff.name) });

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-xl font-bold">{T("Equipo", "Equipe")} <ProBadge /></h1>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
      <p className="text-sm text-muted">
        {T(
          "Cada persona entra con su usuario y contraseña en la misma pantalla del panel y solo ve las áreas que vos liberes. La gestión del equipo y del plan es exclusiva del dueño.",
          "Cada pessoa entra com seu usuário e senha na mesma tela do painel e só vê as áreas que você liberar. A gestão da equipe e do plano é exclusiva do dono.",
        )}
      </p>

      <section className="card p-5">
        <h2 className="font-semibold">{T("Nuevo integrante", "Novo integrante")}</h2>
        <form action={createStaff.bind(null, slug)} className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input name="name" className="input" placeholder={T("Nombre (ej: Ana – caja)", "Nome (ex: Ana – caixa)")} required />
            <input name="username" className="input lowercase" placeholder={T("usuario (ej: ana)", "usuário (ex: ana)")} required autoComplete="off" />
            <input name="password" type="password" className="input" placeholder={T("Contraseña (mín. 6)", "Senha (mín. 6)")} required minLength={6} autoComplete="new-password" />
          </div>
          <Perms L={L} T={T} />
          <button className="btn-primary">{T("Crear acceso", "Criar acesso")}</button>
        </form>
      </section>

      {list.map((s) => {
        let perms: string[] = [];
        try {
          perms = JSON.parse(s.permissions);
        } catch {}
        return (
          <section key={s.id} className={`card p-5 ${s.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {s.name} <span className="font-mono text-sm font-normal text-muted">· {s.username}</span>
              </p>
              <form action={deleteStaff.bind(null, slug, s.id)}>
                <button className="text-xs text-red-600 hover:underline">{T("Eliminar", "Excluir")}</button>
              </form>
            </div>
            <form action={updateStaff.bind(null, slug, s.id)} className="mt-3 space-y-3">
              <Perms L={L} T={T} checked={perms} />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={s.active} /> {T("Acceso activo", "Acesso ativo")}
                </label>
                <input name="password" type="password" className="input w-56" placeholder={T("Nueva contraseña (opcional)", "Nova senha (opcional)")} autoComplete="new-password" />
                <button className="btn-ghost">{T("Guardar", "Salvar")}</button>
              </div>
            </form>
          </section>
        );
      })}
    </div>
  );
}

function Perms({ L, T, checked = ["orders"] }: { L: (a: PanelArea) => string; T: (es: string, pt: string) => string; checked?: string[] }) {
  return (
    <fieldset>
      <legend className="label">{T("Puede acceder a", "Pode acessar")}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {AREAS.map((a) => (
          <label key={a} className="flex items-center gap-2">
            <input type="checkbox" name={`perm_${a}`} defaultChecked={checked.includes(a)} /> {L(a)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
