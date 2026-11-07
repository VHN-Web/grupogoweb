import { and, asc, desc, isNull, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { fmtDate } from "@/core/billing";
import { createAdmin, deleteAdmin, updateAdmin } from "../admin-actions";

export const dynamic = "force-dynamic";

export default async function AdminsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePlatformAdmin();
  const sp = await searchParams;
  const list = await db.query.platformAdmins.findMany({ orderBy: asc(schema.platformAdmins.createdAt) });
  const logs = await db.query.auditLogs.findMany({
    where: and(isNull(schema.auditLogs.tenantId), like(schema.auditLogs.actor, "admin%")),
    orderBy: desc(schema.auditLogs.createdAt),
    limit: 40,
  });
  const adminLogs = logs;
  const owner = me.role === "owner";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Administradores</h1>
        <p className="text-sm text-muted">Pessoas com acesso a este admin. <b>Principal</b> pode cadastrar e remover admins; <b>Admin</b> acessa todo o resto (clientes, planos, faturas e painéis das lojas).</p>
      </div>
      {sp.ok && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{sp.ok}</p>}
      {sp.err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}

      <section className="card p-5 text-sm">
        <p><b>Você:</b> {me.name}{me.email ? ` · ${me.email}` : " (senha-mestra)"} · {me.role === "owner" ? "Principal" : "Admin"}</p>
      </section>

      {owner && (
        <section className="card p-5">
          <h2 className="font-semibold">Novo administrador</h2>
          <form action={createAdmin} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="name" className="input" placeholder="Nome" required maxLength={60} />
            <input name="email" type="email" className="input" placeholder="E-mail" required />
            <input name="password" type="password" className="input" placeholder="Senha (mín. 8) — vazio = só Google" minLength={8} autoComplete="new-password" />
            <select name="role" className="input" defaultValue="admin">
              <option value="admin">Admin</option>
              <option value="owner">Principal (pode cadastrar admins)</option>
            </select>
            <button className="btn-brand rounded-xl px-4 py-2.5 font-semibold sm:col-span-2">Cadastrar</button>
          </form>
        </section>
      )}

      <section className="card divide-y divide-line">
        {list.length === 0 && <p className="p-5 text-sm text-muted">Nenhum admin cadastrado além do principal (senha-mestra).</p>}
        {list.map((a) => (
          <div key={a.id} className="p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p><b>{a.name}</b> · {a.email} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${a.active ? "bg-emerald-100 text-emerald-800" : "bg-black/10 text-muted"}`}>{a.active ? (a.role === "owner" ? "Principal" : "Admin") : "Desativado"}</span></p>
              <p className="text-xs text-muted">{a.lastLoginAt ? `Último acesso ${fmtDate(a.lastLoginAt)}` : "Nunca entrou"} · {a.passwordHash ? "senha + Google" : "só Google"}</p>
            </div>
            {owner && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={updateAdmin.bind(null, a.id)} className="flex flex-wrap items-center gap-2">
                  <input name="password" type="password" className="input w-48" placeholder="Nova senha (opcional)" minLength={8} autoComplete="new-password" />
                  <select name="role" defaultValue={a.role} className="input w-auto"><option value="admin">Admin</option><option value="owner">Principal</option></select>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={a.active} /> Ativo</label>
                  <button className="btn-ghost rounded-lg px-3 py-2 font-semibold">Salvar</button>
                </form>
                {me.id !== a.id && (
                  <form action={deleteAdmin.bind(null, a.id)}><button className="rounded-lg px-3 py-2 font-semibold text-red-600 hover:bg-red-50">Remover</button></form>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Atividade recente dos admins</h2>
        <div className="mt-2 divide-y divide-line text-sm">
          {adminLogs.length === 0 && <p className="py-2 text-muted">Sem registros.</p>}
          {adminLogs.map((l) => (
            <p key={l.id} className="py-2"><span className="text-muted">{fmtDate(l.createdAt)}</span> · <b>{l.actor}</b> · {l.action}{l.detail ? ` — ${l.detail}` : ""}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
