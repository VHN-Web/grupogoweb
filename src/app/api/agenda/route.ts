import { hasModule } from "@/core/modules";
import { tooMany } from "@/lib/security";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getRegion, isValidE164, isValidName, tr, formatPhone } from "@/core/region";
import { isPro, slotsFor } from "@/services/intelligence";
import { sendWhatsApp } from "@/adapters/notify";
import { appUrl } from "@/lib/urls";

const Body = z.object({
  slug: z.string(),
  productId: z.string(),
  startsAt: z.string().datetime(),
  customerName: z.string().trim().min(2).max(60).refine(isValidName),
  customerPhone: z.string().refine(isValidE164),
  notes: z.string().max(200).optional().nullable(),
});

/** Cliente pede um horário (fica PENDENTE até o estabelecimento confirmar no painel). */
export async function POST(req: Request) {
  const limited = await tooMany(req, "agenda", 8, 600);
  if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const p = Body.safeParse(raw);
  if (!p.success) {
    const tt = typeof raw?.slug === "string" ? await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, raw.slug), columns: { country: true } }) : null;
    return NextResponse.json({ error: tr(getRegion(tt?.country).locale)("Revisá tu nombre y WhatsApp", "Confira seu nome e WhatsApp") }, { status: 400 });
  }
  const t = await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, p.data.slug) });
  if (!t || !isPro(t) || !hasModule(t, "agenda")) return NextResponse.json({ error: "—" }, { status: 404 });
  const T = tr(getRegion(t.country).locale);
  const prod = await db.query.products.findFirst({ where: and(eq(schema.products.id, p.data.productId), eq(schema.products.tenantId, t.id)) });
  if (!prod?.durationMin) return NextResponse.json({ error: T("Servicio no encontrado", "Serviço não encontrado") }, { status: 404 });
  const date = p.data.startsAt.slice(0, 10);
  const day = new Date(p.data.startsAt);
  // revalida a disponibilidade no servidor (data local pode diferir da UTC: confere o dia anterior/seguinte)
  const candidates = [date, new Date(day.getTime() - 864e5).toISOString().slice(0, 10), new Date(day.getTime() + 864e5).toISOString().slice(0, 10)];
  let ok = false;
  for (const d of candidates) {
    const slots = await slotsFor(t, prod.id, d);
    if (slots.some((s) => s.startsAt.getTime() === day.getTime())) {
      ok = true;
      break;
    }
  }
  if (!ok) return NextResponse.json({ error: T("Ese horario ya no está disponible", "Esse horário não está mais disponível") }, { status: 409 });
  const [a] = await db
    .insert(schema.appointments)
    .values({
      tenantId: t.id,
      productId: prod.id,
      serviceName: prod.name,
      pricePyg: prod.pricePyg,
      customerName: p.data.customerName,
      customerPhone: p.data.customerPhone,
      startsAt: day,
      durationMin: prod.durationMin,
      notes: p.data.notes ?? null,
    })
    .returning();
  // avisa o estabelecimento (se houver WhatsApp configurado no servidor)
  const owner = t.whatsapp || t.phone;
  if (owner && !t.demo) { // loja de demonstração nunca dispara mensagem real
    const region = getRegion(t.country);
    const when = new Intl.DateTimeFormat(region.intlLocale, { dateStyle: "short", timeStyle: "short", timeZone: region.timeZone }).format(day);
    await sendWhatsApp(
      owner,
      T(
        `📅 Nuevo pedido de turno: ${a.customerName} (${formatPhone(a.customerPhone)}) — ${a.serviceName}, ${when}. Confirmá en ${appUrl()}/painel/${t.slug}/agenda`,
        `📅 Novo pedido de horário: ${a.customerName} (${formatPhone(a.customerPhone)}) — ${a.serviceName}, ${when}. Confirme em ${appUrl()}/painel/${t.slug}/agenda`,
      ),
    ).catch(() => {});
  }
  return NextResponse.json({ ok: true, id: a.id }, { status: 201 });
}
