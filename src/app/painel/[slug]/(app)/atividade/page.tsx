import { requireTenantAdmin } from "@/lib/auth";
import { panelI18n } from "@/lib/panel-i18n";
import { recentAudit } from "@/lib/security";

export const dynamic = "force-dynamic";

const LABELS: Record<string, [string, string]> = {
  "login.ok": ["Ingreso al panel", "Entrou no painel"],
  "login.fail": ["Intento de ingreso fallido", "Tentativa de login com erro"],
  "password.change": ["Contraseña cambiada", "Senha alterada"],
  "password.fail": ["Intento de cambio de contraseña (actual incorrecta)", "Tentativa de troca de senha (senha atual errada)"],
  "order.mark_paid": ["Pedido marcado como pagado (manual)", "Pedido marcado como pago (manual)"],
  "order.paid": ["Pago confirmado por el gateway", "Pagamento confirmado pelo gateway"],
  "order.failed": ["Pago rechazado por el gateway", "Pagamento recusado pelo gateway"],
  "order.refunded": ["Pago reembolsado", "Pagamento estornado"],
  "order.cancel": ["Pedido cancelado", "Pedido cancelado"],
  "order.amount_mismatch": ["⚠ Pago con valor menor al pedido (bloqueado)", "⚠ Pagamento com valor menor que o pedido (bloqueado)"],
  "cash.open": ["Caja abierta", "Caixa aberto"],
  "cash.close": ["Caja cerrada", "Caixa fechado"],
  "cash.in": ["Ingreso de dinero en caja", "Suprimento no caixa"],
  "cash.out": ["Retiro de dinero de caja", "Sangria do caixa"],
  "stock.adjust": ["Ajuste de stock", "Ajuste de estoque"],
  "product.delete": ["Producto eliminado", "Produto excluído"],
  "coupon.create": ["Cupón creado", "Cupom criado"],
  "coupon.delete": ["Cupón eliminado", "Cupom excluído"],
  "staff.create": ["Usuario del equipo creado", "Usuário da equipe criado"],
  "staff.update": ["Usuario del equipo modificado", "Usuário da equipe alterado"],
  "staff.delete": ["Usuario del equipo eliminado", "Usuário da equipe excluído"],
  "integration.connect": ["Integración de pago conectada", "Integração de pagamento conectada"],
  "integration.remove": ["Integración de pago desconectada", "Integração de pagamento desconectada"],
  "google.email": ["E-mail de Google para entrar cambiado", "E-mail Google para entrar alterado"],
};

const ALERT = new Set(["login.fail", "password.fail", "order.amount_mismatch", "order.mark_paid", "cash.out", "integration.remove"]);

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTenantAdmin(slug, "team"); // só o dono
  const { T, region } = panelI18n(t);
  const rows = await recentAudit(t.id, 100);
  const fmt = new Intl.DateTimeFormat(region.locale === "pt" ? "pt-BR" : "es-PY", { dateStyle: "short", timeStyle: "short", timeZone: region.timeZone });

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-bold">{T("Registro de actividad", "Registro de atividades")}</h1>
      <p className="text-sm text-muted">
        {T(
          "Todo lo sensible queda registrado: ingresos, pagos marcados a mano, cancelaciones, caja, equipo e integraciones. Si ves algo que no reconocés, cambiá la contraseña.",
          "Tudo o que é sensível fica registrado: logins, pagamentos marcados à mão, cancelamentos, caixa, equipe e integrações. Se vir algo que não reconhece, troque a senha.",
        )}
      </p>
      <div className="card divide-y divide-[var(--border,#e5e7eb)]">
        {rows.length === 0 && <p className="p-5 text-sm text-muted">{T("Sin actividad todavía.", "Nenhuma atividade ainda.")}</p>}
        {rows.map((r) => {
          const l = LABELS[r.action];
          return (
            <div key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="w-32 shrink-0 tabular-nums text-muted">{fmt.format(r.createdAt)}</span>
              <span className={ALERT.has(r.action) ? "font-semibold text-amber-700" : "font-medium"}>{l ? (region.locale === "pt" ? l[1] : l[0]) : r.action}</span>
              {r.detail && <span className="text-muted">{r.detail}</span>}
              <span className="ml-auto text-xs text-muted">
                {r.actor}
                {r.ip && r.ip !== "unknown" ? ` · ${r.ip}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
