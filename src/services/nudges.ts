import "server-only";
// Lembretes automáticos pelo WhatsApp da GoWeb (Geovana): passo a passo, loja parada e cobrança gentil.
// Regras em core/nudges.ts. Cada envio grava uma chave em nudge_log → nunca repete. Roda no cron do CRM (3x/dia).
import { and, desc, eq, isNotNull, like, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { businessHours, idleNudge, idleText, invoiceStage, invoiceText, setupNudge, setupText, weekKey } from "@/core/nudges";
import { setupProgress } from "@/core/setup";
import { formatMinor } from "@/core/money";
import { storeSetup } from "@/services/setup";
import { gwBotConfig, gwProactive, notifyPartners } from "@/services/goweb-bot";
import { getSettings } from "@/services/billing";
import { appUrl } from "@/lib/urls";

/** Reserva a chave; true = pode enviar (primeira vez). */
async function claim(key: string) {
  const r = await db.insert(schema.nudgeLog).values({ key }).onConflictDoNothing().returning({ key: schema.nudgeLog.key });
  return r.length > 0;
}
const release = (key: string) => db.delete(schema.nudgeLog).where(eq(schema.nudgeLog.key, key));

export async function runNudges(now = new Date()) {
  const cfg = await gwBotConfig();
  const out = { setup: 0, idle: 0, billing: 0, skipped: "" };
  if (!cfg.instance || !cfg.enabled) return { ...out, skipped: "WhatsApp da GoWeb desligado" };
  if (!businessHours(now)) return { ...out, skipped: "fora do horário" };
  const base = appUrl();

  // clientes com loja entregue (Brasil, não demo)
  const custs = await db.query.customers.findMany({
    where: and(isNotNull(schema.customers.tenantId), isNotNull(schema.customers.whatsapp), isNotNull(schema.customers.deliveredAt), eq(schema.customers.country, "BR")),
    with: { tenant: true },
    limit: 500,
  });
  const idleStores: string[] = [];
  for (const c of custs) {
    const t = (c as typeof c & { tenant: schema.Tenant | null }).tenant;
    if (!t || t.demo || t.suspended || !c.whatsapp) continue;
    const steps = await storeSetup(t);
    const pr = setupProgress(steps);
    // ---- 10. passo a passo
    if (cfg.setupNudges && pr.next) {
      const sent = await db.$count(schema.nudgeLog, like(schema.nudgeLog.key, `setup:${t.id}:%`));
      const key = setupNudge({ tenantId: t.id, deliveredAt: c.deliveredAt, sent, now });
      if (key && (await claim(key))) {
        const ok = await gwProactive(c.whatsapp, setupText({ contact: c.contactName, store: t.name, step: pr.next, link: `${base}${pr.next.href}`, done: pr.done, total: pr.total }), { tenantId: t.id }).catch(() => false);
        if (ok) out.setup++;
        else await release(key);
      }
      continue; // ainda configurando: não conta como "parada"
    }
    // ---- 11. loja parada
    if (cfg.idleNudges && c.deliveredAt) {
      const last = await db.query.orders.findFirst({ where: eq(schema.orders.tenantId, t.id), orderBy: desc(schema.orders.createdAt), columns: { createdAt: true } });
      const idle = idleNudge({ tenantId: t.id, liveSince: c.deliveredAt, lastOrderAt: last?.createdAt ?? null, now });
      if (idle && (await claim(idle.key))) {
        idleStores.push(`${t.name} (${idle.days} dias)`);
        const week = Number(weekKey(now).split("w")[1]) || 0;
        const ok = await gwProactive(c.whatsapp, idleText({ contact: c.contactName, store: t.name, days: idle.days, link: t.customDomain ? `https://${t.customDomain}` : `${base}/${t.slug}`, panel: `${base}/painel/${t.slug}`, week }), { tenantId: t.id }).catch(() => false);
        if (ok) out.idle++;
      }
    }
  }
  if (idleStores.length) await notifyPartners(`${idleStores.length} loja(s) parada(s)`, `Sem pedidos há 7+ dias: ${idleStores.slice(0, 6).join(", ")}${idleStores.length > 6 ? "…" : ""}. A Geovana já mandou dicas; vale uma ligação.`, "/admin/clientes");

  // ---- 12. cobrança gentil (faturas em aberto de clientes do Brasil)
  if (cfg.billingNudges) {
    const settings = await getSettings();
    const open = await db.query.invoices.findMany({
      where: and(eq(schema.invoices.status, "OPEN"), sql`${schema.invoices.dueAt} between ${new Date(now.getTime() - 4 * 86400_000)} and ${new Date(now.getTime() + 4 * 86400_000)}`),
      with: { customer: { with: { tenant: true } } },
      limit: 300,
    });
    for (const inv of open) {
      const c = (inv as typeof inv & { customer: (schema.Customer & { tenant: schema.Tenant | null }) | null }).customer;
      if (!c?.whatsapp || c.country !== "BR" || c.tenant?.demo) continue;
      const stage = invoiceStage(inv.dueAt, now);
      if (!stage) continue;
      const key = `inv:${inv.id}:${stage}`;
      if (!(await claim(key))) continue;
      const text = invoiceText({
        contact: c.contactName,
        store: c.tenant?.name ?? c.businessName,
        stage,
        amount: formatMinor(inv.amountBrlMinor, "BRL"),
        due: inv.dueAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        link: `${base}/fatura/${inv.id}`,
        graceDays: settings.graceDays,
      });
      const ok = await gwProactive(c.whatsapp, text, { tenantId: c.tenantId }).catch(() => false);
      if (ok) out.billing++;
      else await release(key);
    }
  }
  return out;
}

/** Para testes/diagnóstico: quantos lembretes já saíram por tipo. */
export async function nudgeStats() {
  const rows = await db.select({ k: sql<string>`split_part(${schema.nudgeLog.key}, ':', 1)`, n: sql<number>`count(*)::int` }).from(schema.nudgeLog).groupBy(sql`1`);
  return Object.fromEntries(rows.map((r) => [r.k, r.n]));
}
