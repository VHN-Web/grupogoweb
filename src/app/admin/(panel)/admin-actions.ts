"use server";
// Cadastro de administradores da plataforma (só o administrador principal / papel "owner").
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminActor, hashPassword, requirePlatformOwner } from "@/lib/auth";
import { audit } from "@/lib/security";
import { isValidName } from "@/core/region";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (msg: string, kind: "ok" | "err" = "ok"): never => redirect(`/admin/admins?${kind}=${encodeURIComponent(msg)}`);

export async function createAdmin(f: FormData) {
  await requirePlatformOwner();
  const name = str(f, "name").slice(0, 60);
  const email = str(f, "email").toLowerCase().slice(0, 120);
  const password = str(f, "password");
  const role = str(f, "role") === "owner" ? "owner" : "admin";
  if (!isValidName(name)) back("Nome inválido (só letras).", "err");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("E-mail inválido.", "err");
  if (password && password.length < 8) back("A senha precisa ter pelo menos 8 caracteres.", "err");
  const exists = await db.query.platformAdmins.findFirst({ where: eq(schema.platformAdmins.email, email), columns: { id: true } });
  if (exists) back("Já existe um admin com esse e-mail.", "err");
  await db.insert(schema.platformAdmins).values({ name, email, role, passwordHash: password ? hashPassword(password) : null });
  await audit(null, await adminActor(), "admin.create", `${name} <${email}> (${role === "owner" ? "principal" : "admin"})`);
  back(`${name} cadastrado. ${password ? "Envie a senha por um canal seguro." : "Ele entra com a conta Google desse e-mail."}`);
}

export async function updateAdmin(id: string, f: FormData) {
  const me = await requirePlatformOwner();
  const a = await db.query.platformAdmins.findFirst({ where: eq(schema.platformAdmins.id, id) });
  if (!a) return back("Admin não encontrado.", "err");
  const password = str(f, "password");
  const active = f.get("active") === "on";
  const role = str(f, "role") === "owner" ? "owner" : "admin";
  if (password && password.length < 8) back("A senha precisa ter pelo menos 8 caracteres.", "err");
  if (me.id === a.id && (!active || role !== "owner")) back("Você não pode desativar nem rebaixar a si mesmo.", "err");
  const changedAccess = !!password || !active || role !== a.role;
  await db
    .update(schema.platformAdmins)
    .set({
      active,
      role,
      ...(password ? { passwordHash: hashPassword(password) } : {}),
      // trocar senha, papel ou desativar derruba as sessões abertas dele
      ...(changedAccess ? { sessionVersion: sql`${schema.platformAdmins.sessionVersion} + 1` } : {}),
    })
    .where(eq(schema.platformAdmins.id, id));
  await audit(null, await adminActor(), "admin.update", `${a.name}${password ? " (senha trocada)" : ""}${active ? "" : " (desativado)"} · ${role}`);
  back("Alterações salvas.");
}

export async function deleteAdmin(id: string) {
  const me = await requirePlatformOwner();
  if (me.id === id) back("Você não pode remover a si mesmo.", "err");
  const a = await db.query.platformAdmins.findFirst({ where: eq(schema.platformAdmins.id, id) });
  if (!a) return back("Admin não encontrado.", "err");
  // nunca deixa a plataforma sem um principal cadastrado se o removido for o único "owner" — a senha-mestra continua valendo
  await db.delete(schema.platformAdmins).where(and(eq(schema.platformAdmins.id, id), ne(schema.platformAdmins.id, me.id ?? "")));
  await audit(null, await adminActor(), "admin.delete", `${a.name} <${a.email}>`);
  back(`${a.name} removido.`);
}
