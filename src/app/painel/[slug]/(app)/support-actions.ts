"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit, isLimited, rateLimit } from "@/lib/security";
import { CATEGORIES, PRIORITIES, type Category, type Priority } from "@/core/support";
import { getRegion, tr } from "@/core/region";
import { customerReply, openTicket } from "@/services/support";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function newTicket(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const T = tr(getRegion(t.country).locale);
  const back = (m: string): never => redirect(`/painel/${slug}/suporte?err=${encodeURIComponent(m)}`);
  const category = str(f, "category") as Category;
  const priority = str(f, "priority") as Priority;
  const subject = str(f, "subject").slice(0, 120);
  const body = str(f, "body").slice(0, 4000);
  if (!CATEGORIES.includes(category) || !PRIORITIES.includes(priority)) back(T("Elegí el tipo y el impacto.", "Escolha o tipo e o impacto."));
  if (subject.length < 4 || body.length < 10) back(T("Contanos el asunto y qué pasó.", "Conte o assunto e o que aconteceu."));
  const key = `ticket:${t.id}`;
  if (await isLimited(key, 10)) back(T("Muchos chamados seguidos. Probá en un rato.", "Muitos chamados seguidos. Tente daqui a pouco."));
  await rateLimit(key, 10, 3600);
  const who = await actorName(slug);
  const ticket = await openTicket({ tenantId: t.id, openedBy: who, category, priority, subject, body });
  await audit(t.id, who, "support.open", ticket.protocol);
  redirect(`/painel/${slug}/suporte/${ticket.id}?novo=1`);
}

export async function replyTicket(slug: string, id: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const body = str(f, "body").slice(0, 4000);
  if (body.length >= 2) await customerReply(t.id, id, await actorName(slug), body);
  revalidatePath(`/painel/${slug}/suporte/${id}`);
  redirect(`/painel/${slug}/suporte/${id}`);
}

export async function rateTicket(slug: string, id: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const r = Math.round(Number(str(f, "rating")));
  if (r >= 1 && r <= 5)
    await db
      .update(schema.supportTickets)
      .set({ rating: r, status: "CLOSED" })
      .where(and(eq(schema.supportTickets.id, id), eq(schema.supportTickets.tenantId, t.id), eq(schema.supportTickets.status, "RESOLVED")));
  redirect(`/painel/${slug}/suporte/${id}`);
}
