import { sendPush } from "./push";
// Chamados de suporte do lojista → GoWeb. Abertura com protocolo e prazos (SLA), conversa e avisos.
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail, sendWhatsApp } from "@/adapters/notify";
import { sendPlatformWhatsApp } from "@/services/platform-wa";
import { CATEGORY_LABELS, SLA, STATUS_LABELS, makeProtocol, slaDue, type Category, type Priority, type TicketStatus } from "@/core/support";
import { getRegion, tr } from "@/core/region";
import { appUrl } from "@/lib/urls";
import { getSettings } from "./billing";

export class SupportError extends Error {}

function fmt(d: Date, locale: "es" | "pt") {
  return new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : "es-PY", { dateStyle: "short", timeStyle: "short", timeZone: locale === "pt" ? "America/Sao_Paulo" : "America/Asuncion" }).format(d);
}

async function contactOf(tenantId: string) {
  const c = await db.query.customers.findFirst({ where: eq(schema.customers.tenantId, tenantId) });
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  return { email: c?.email ?? t?.loginEmail ?? null, whatsapp: c?.whatsappOptIn ? c.whatsapp : null, tenant: t! };
}

export async function openTicket(input: { tenantId: string; openedBy: string; category: Category; priority: Priority; subject: string; body: string }) {
  const now = new Date();
  const due = slaDue(input.priority, now);
  const { email, whatsapp, tenant } = await contactOf(input.tenantId);
  let ticket: schema.SupportTicket | undefined;
  for (let i = 0; i < 5 && !ticket; i++) {
    [ticket] = await db
      .insert(schema.supportTickets)
      .values({
        protocol: makeProtocol(now),
        tenantId: input.tenantId,
        openedBy: input.openedBy,
        contactEmail: email,
        contactWhatsapp: whatsapp,
        category: input.category,
        priority: input.priority,
        subject: input.subject,
        ...due,
      })
      .onConflictDoNothing()
      .returning();
  }
  if (!ticket) throw new SupportError("protocol");
  await db.insert(schema.supportMessages).values({ ticketId: ticket.id, author: "cliente", authorName: input.openedBy, body: input.body });

  const locale = getRegion(tenant.country).locale;
  const T = tr(locale);
  const s = await getSettings();
  // aviso para a equipe GoWeb
  const adminText = `Novo chamado ${ticket.protocol} — ${tenant.name}\nPrioridade: ${SLA[input.priority].label.pt} · ${CATEGORY_LABELS[input.category].pt}\nAssunto: ${input.subject}\n\n${input.body}\n\nResponder: ${appUrl()}/admin/suporte/${ticket.id}`;
  if (!tenant.demo) await sendPush("all", { title: `Chamado ${ticket.protocol}`, body: `${tenant.name}: ${input.subject}`, url: `/admin/suporte/${ticket.id}`, tag: `ticket-${ticket.id}`, category: "suporte" });
  if (!tenant.demo) {
    if (s.supportEmail) await sendEmail(s.supportEmail, `[${ticket.protocol}] ${SLA[input.priority].label.pt}: ${input.subject}`, adminText).catch(() => null);
    if (s.supportWhatsapp && (input.priority === "urgente" || input.priority === "alta")) await sendWhatsApp(s.supportWhatsapp, adminText).catch(() => null);
    // confirmação para o lojista, com protocolo e prazo
    if (email)
      await sendEmail(
        email,
        T(`Recibimos tu solicitud — protocolo ${ticket.protocol}`, `Recebemos seu chamado — protocolo ${ticket.protocol}`),
        T(
          `Hola! Abriste el chamado ${ticket.protocol} ("${input.subject}").\nPrimera respuesta hasta: ${fmt(due.firstResponseDueAt, locale)}\nSolución prevista hasta: ${fmt(due.resolutionDueAt, locale)}\n\nSeguilo en: ${appUrl()}/painel/${tenant.slug}/suporte/${ticket.id}`,
          `Olá! Você abriu o chamado ${ticket.protocol} ("${input.subject}").\nPrimeira resposta até: ${fmt(due.firstResponseDueAt, locale)}\nSolução prevista até: ${fmt(due.resolutionDueAt, locale)}\n\nAcompanhe em: ${appUrl()}/painel/${tenant.slug}/suporte/${ticket.id}`,
        ),
      ).catch(() => null);
  }
  return ticket;
}

export async function customerReply(tenantId: string, ticketId: string, authorName: string, body: string) {
  const t = await db.query.supportTickets.findFirst({ where: and(eq(schema.supportTickets.id, ticketId), eq(schema.supportTickets.tenantId, tenantId)) });
  if (!t) throw new SupportError("not found");
  await db.insert(schema.supportMessages).values({ ticketId, author: "cliente", authorName, body });
  // cliente respondeu: volta para a fila (reabre se estava resolvido)
  await db
    .update(schema.supportTickets)
    .set({ lastMessageAt: new Date(), unreadByAdmin: true, status: t.status === "WAITING_CUSTOMER" || t.status === "RESOLVED" ? "IN_PROGRESS" : t.status, resolvedAt: t.status === "RESOLVED" ? null : t.resolvedAt })
    .where(eq(schema.supportTickets.id, ticketId));
  const s = await getSettings();
  const tenant = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (s.supportEmail && !tenant?.demo) await sendEmail(s.supportEmail, `[${t.protocol}] Nova resposta do cliente`, `${authorName}:\n\n${body}\n\n${appUrl()}/admin/suporte/${t.id}`).catch(() => null);
}

export async function adminReply(ticketId: string, adminName: string, body: string, opts: { internal: boolean; status?: TicketStatus }) {
  const t = await db.query.supportTickets.findFirst({ where: eq(schema.supportTickets.id, ticketId), with: { tenant: true } });
  if (!t) throw new SupportError("not found");
  const now = new Date();
  if (body.trim()) await db.insert(schema.supportMessages).values({ ticketId, author: "suporte", authorName: adminName, body, internal: opts.internal });
  const publicReply = !!body.trim() && !opts.internal;
  const status = opts.status ?? (publicReply && t.status === "OPEN" ? "IN_PROGRESS" : t.status);
  await db
    .update(schema.supportTickets)
    .set({
      status,
      lastMessageAt: now,
      unreadByAdmin: false,
      ...(publicReply ? { unreadByCustomer: true } : {}),
      ...(publicReply && !t.firstResponseAt ? { firstResponseAt: now } : {}),
      ...(status === "RESOLVED" || status === "CLOSED" ? { resolvedAt: t.resolvedAt ?? now } : { resolvedAt: null }),
      assignedTo: t.assignedTo ?? adminName,
    })
    .where(eq(schema.supportTickets.id, ticketId));
  if ((publicReply || status !== t.status) && t.contactEmail && !t.tenant.demo) {
    const locale = getRegion(t.tenant.country).locale;
    const T = tr(locale);
    const st = locale === "pt" ? STATUS_LABELS[status].pt : STATUS_LABELS[status].es;
    const text = `${publicReply ? `${body}\n\n` : ""}${T("Estado", "Situação")}: ${st}\n${appUrl()}/painel/${t.tenant.slug}/suporte/${t.id}`;
    await sendEmail(t.contactEmail, T(`Respuesta a tu chamado ${t.protocol}`, `Resposta ao seu chamado ${t.protocol}`), text).catch(() => null);
    // resposta a chamado aberto pelo lojista: sai a qualquer hora, mas com os limites da proteção da Geovana
    if (t.contactWhatsapp) await sendPlatformWhatsApp(t.contactWhatsapp, `*GoWeb — ${t.protocol}*\n\n${text}`, "support").catch(() => null);
  }
}

export function tenantTickets(tenantId: string) {
  return db.query.supportTickets.findMany({ where: eq(schema.supportTickets.tenantId, tenantId), orderBy: desc(schema.supportTickets.lastMessageAt), limit: 100 });
}
