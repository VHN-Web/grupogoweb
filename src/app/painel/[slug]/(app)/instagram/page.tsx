import Link from "next/link";
import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { instagramAllowed } from "@/core/instagram";
import { geovanaOf } from "@/services/geovana";
import { igOverview, storeAiUsage } from "@/services/instagram";
import { igAiAction, igDisconnectAction } from "../instagram-actions";

export const dynamic = "force-dynamic";

export default async function InstagramPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const t = await requireTenantAdmin(slug, "customers");
  const { T, fmtDate } = panelI18n(t);
  const allowed = instagramAllowed({ tier: t.tier, demo: t.demo, country: t.country });

  if (!allowed.ok) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">Instagram · Direct</h1>
        <div className="card p-5 text-sm">
          <p>{T("La Geovana también atiende el Direct de Instagram de tu tienda: responde dudas, arma el carrito y llama al equipo cuando hace falta.", "A Geovana também atende o Direct do Instagram da sua loja: tira dúvidas, monta o carrinho e chama a equipe quando precisa.")}</p>
          <p className="mt-2 text-muted">{allowed.reason}</p>
          {!t.demo && <Link href={`/painel/${slug}/plano`} className="btn-brand mt-4 inline-block">{T("Disponible en GoInteligence", "Disponível no GoInteligence")}</Link>}
        </div>
      </div>
    );
  }

  const [ov, usage] = await Promise.all([igOverview({ tenantId: t.id }), storeAiUsage(t.id)]);
  const cfg = geovanaOf(t);
  const acc = ov.account;
  const pct = Math.min(100, Math.round((usage.total / usage.franchise) * 100));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{cfg.name} · Instagram Direct</h1>
          <p className="text-sm text-muted">{T("Conexión oficial de Meta. La Geovana solo responde a quien escribe, hasta 24 h después del último mensaje.", "Conexão oficial da Meta. A Geovana só responde quem escreveu, até 24 h depois da última mensagem.")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${acc?.status === "active" && acc.aiEnabled ? "bg-emerald-100 text-emerald-800" : acc ? "bg-amber-100 text-amber-900" : "bg-black/5 text-muted"}`}>
          {!acc ? T("No conectado", "Não conectado") : acc.status !== "active" ? T("En pausa", "Pausado") : acc.aiEnabled ? T("Atendiendo", "Atendendo") : T("Conectado, IA apagada", "Conectado, IA desligada")}
        </span>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">{T("1. Conectar el Instagram de la tienda", "1. Conectar o Instagram da loja")}</h2>
        {!ov.configured ? (
          <p className="mt-2 text-muted">{T("La GoWeb está terminando la habilitación con Meta. En cuanto esté lista, el botón aparece acá.", "A GoWeb está finalizando a liberação com a Meta. Assim que estiver pronta, o botão aparece aqui.")}</p>
        ) : acc ? (
          <div className="mt-2 space-y-2">
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">✓ @{acc.username ?? "instagram"}{acc.expiresAt ? ` · ${T("acceso renovado automáticamente (vence", "acesso renovado automaticamente (vence")} ${fmtDate(acc.expiresAt, { dateStyle: "short" })})` : ""}</p>
            {acc.lastError && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">{acc.lastError}</p>}
            <div className="flex flex-wrap gap-2">
              <form action={igAiAction.bind(null, slug, !acc.aiEnabled)}><button className="btn-ghost px-3 py-1.5 text-xs font-semibold">{acc.aiEnabled ? T("Apagar la IA en Instagram", "Desligar a IA no Instagram") : T("Prender la IA en Instagram", "Ligar a IA no Instagram")}</button></form>
              {acc.status === "error" && <a href={`/api/instagram/oauth/start?loja=${encodeURIComponent(slug)}`} className="btn-brand px-3 py-1.5 text-xs">{T("Reconectar", "Reconectar")}</a>}
              <form action={igDisconnectAction.bind(null, slug)}><button className="px-3 py-1.5 text-xs font-semibold text-red-600">{T("Desconectar", "Desconectar")}</button></form>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-muted">{T("Hace falta una cuenta profesional de Instagram (comercial o de creador). Vas a entrar con el usuario y la contraseña de Instagram de la tienda y autorizar los mensajes.", "Precisa de uma conta profissional do Instagram (comercial ou de criador). Você entra com o usuário e a senha do Instagram da loja e autoriza as mensagens.")}</p>
            <a href={`/api/instagram/oauth/start?loja=${encodeURIComponent(slug)}`} className="btn-brand inline-block">{T("Conectar con Instagram", "Conectar com o Instagram")}</a>
          </div>
        )}
      </section>

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">{T("2. Cómo atiende", "2. Como ela atende")}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>{T("Usa las mismas instrucciones, catálogo y horario que configuraste para el WhatsApp", "Usa as mesmas instruções, catálogo e horário que você configurou para o WhatsApp")} (<Link className="underline" href={`/painel/${slug}/geovana`}>Geovana</Link>).</li>
          <li>{T("Nunca manda mensajes por iniciativa propia: solo responde, hasta 24 h después del último mensaje del cliente (regla de Instagram).", "Nunca manda mensagem por conta própria: só responde, até 24 h depois da última mensagem do cliente (regra do Instagram).")}</li>
          <li>{T("Si alguien del equipo responde por el app de Instagram, la IA hace una pausa en esa conversación.", "Se alguém da equipe responder pelo app do Instagram, a IA pausa nessa conversa.")}</li>
          <li>{T("Fotos y audios van al equipo (la IA no los ve).", "Fotos e áudios vão para a equipe (a IA não vê).")}</li>
        </ul>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="font-semibold">{T("Respuestas de IA este mes", "Respostas de IA neste mês")}</h2>
        <p className="mt-1 text-muted">{T("La franquicia suma WhatsApp e Instagram. Al llegar al límite, las conversaciones pasan al equipo hasta el próximo mes.", "A franquia soma WhatsApp e Instagram. Ao chegar no limite, as conversas passam para a equipe até o próximo mês.")}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-[var(--brand)]" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2"><b>{usage.total}</b> / {usage.franchise} · WhatsApp {usage.whatsapp} · Instagram {usage.instagram}</p>
        <Link href={`/painel/${slug}/conversas`} className="btn-ghost mt-3 inline-block px-3 py-1.5 text-xs font-semibold">{T("Ver conversaciones (WhatsApp + Instagram)", "Ver conversas (WhatsApp + Instagram)")}</Link>
      </section>
    </div>
  );
}
