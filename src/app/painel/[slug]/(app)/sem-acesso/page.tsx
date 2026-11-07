import { requirePanelAccess } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";

export default async function NoAccess({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const acc = await requirePanelAccess(slug);
  const { T } = panelI18n(acc.tenant);
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      
      <h1 className="mt-3 text-xl font-bold">{T("Sin acceso a esta área", "Sem acesso a esta área")}</h1>
      <p className="mt-2 text-sm text-muted">{T("Pedile al dueño que libere este permiso en Equipo.", "Peça ao dono para liberar esta permissão em Equipe.")}</p>
    </div>
  );
}
