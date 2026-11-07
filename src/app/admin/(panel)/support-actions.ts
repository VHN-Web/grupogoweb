"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { adminActor, requirePlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";
import { PRIORITIES, STATUSES, slaDue, type Priority, type TicketStatus } from "@/core/support";
import { adminReply } from "@/services/support";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function answerTicket(id: string, f: FormData) {
  const me = await requirePlatformAdmin();
  const status = str(f, "status") as TicketStatus;
  await adminReply(id, me.name, str(f, "body").slice(0, 6000), { internal: f.get("internal") === "on", status: STATUSES.includes(status) ? status : undefined });
  await audit(null, await adminActor(), "support.reply", id);
  revalidatePath(`/admin/suporte/${id}`);
  redirect(`/admin/suporte/${id}?ok=${encodeURIComponent("Salvo.")}`);
}

/** Muda a prioridade e recalcula os prazos a partir da abertura. */
export async function setTicketPriority(id: string, f: FormData) {
  await requirePlatformAdmin();
  const p = str(f, "priority") as Priority;
  const t = await db.query.supportTickets.findFirst({ where: eq(schema.supportTickets.id, id) });
  if (!t || !PRIORITIES.includes(p)) redirect(`/admin/suporte/${id}`);
  await db.update(schema.supportTickets).set({ priority: p, ...slaDue(p, t!.createdAt) }).where(eq(schema.supportTickets.id, id));
  await audit(null, await adminActor(), "support.priority", `${t!.protocol} → ${p}`);
  redirect(`/admin/suporte/${id}?ok=${encodeURIComponent("Prioridade e prazos atualizados.")}`);
}
