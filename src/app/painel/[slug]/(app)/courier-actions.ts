"use server";
// Motoboys (módulo Delivery): cadastro e atribuição de entregas.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";
import { getRegion, isValidE164, isValidName, tr } from "@/core/region";
import { parseMajorToMinor } from "@/core/money";
import { hasModule } from "@/core/modules";
import type { Currency } from "@/core/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const page = (slug: string) => `/painel/${slug}/motoboys`;
const back = (path: string, kind: "ok" | "err", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

function fields(f: FormData, cur: Currency) {
  return {
    name: str(f, "name").slice(0, 60),
    phone: str(f, "phone"),
    vehicle: str(f, "vehicle").slice(0, 80) || null,
    pixKey: str(f, "pixKey").slice(0, 120) || null,
    feePerDelivery: Math.max(0, parseMajorToMinor(str(f, "fee") || "0", cur) ?? 0),
  };
}

export async function saveCourier(slug: string, id: string | null, f: FormData) {
  const t = await requireTenantAdmin(slug, "couriers");
  const T = tr(getRegion(t.country).locale);
  const v = fields(f, t.currency as Currency);
  if (!isValidName(v.name)) back(page(slug), "err", T("Nombre inválido (solo letras).", "Nome inválido (só letras)."));
  if (!isValidE164(v.phone)) back(page(slug), "err", T("WhatsApp inválido.", "WhatsApp inválido."));
  const dup = await db.query.couriers.findFirst({ where: and(eq(schema.couriers.tenantId, t.id), eq(schema.couriers.phone, v.phone)) });
  if (dup && dup.id !== id) back(page(slug), "err", T("Ya hay un repartidor con ese WhatsApp.", "Já existe um motoboy com esse WhatsApp."));
  if (id) {
    await db.update(schema.couriers).set({ ...v, active: f.get("active") === "on" }).where(and(eq(schema.couriers.id, id), eq(schema.couriers.tenantId, t.id)));
  } else {
    await db.insert(schema.couriers).values({ ...v, tenantId: t.id });
  }
  await audit(t.id, await actorName(slug), id ? "courier.update" : "courier.create", v.name);
  revalidatePath(page(slug));
  back(page(slug), "ok", T("Guardado ✓", "Salvo ✓"));
}

export async function deleteCourier(slug: string, id: string) {
  const t = await requireTenantAdmin(slug, "couriers");
  const T = tr(getRegion(t.country).locale);
  const c = await db.query.couriers.findFirst({ where: and(eq(schema.couriers.id, id), eq(schema.couriers.tenantId, t.id)) });
  if (!c) back(page(slug), "err", "—");
  // o histórico de entregas fica (o pedido guarda só o id); o motoboy some da lista
  await db.delete(schema.couriers).where(and(eq(schema.couriers.id, id), eq(schema.couriers.tenantId, t.id)));
  await audit(t.id, await actorName(slug), "courier.delete", c!.name);
  back(page(slug), "ok", T("Repartidor eliminado.", "Motoboy removido."));
}

/** Liga o pedido de delivery a um motoboy (e, se pedido, marca "saiu para entrega"). */
export async function assignCourier(slug: string, orderId: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "orders");
  const path = `/painel/${slug}/pedidos/${orderId}`;
  if (!hasModule(t, "delivery")) redirect(`/painel/${slug}/plano?modulo=couriers`);
  const courierId = str(f, "courierId") || null;
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, t.id)) });
  if (!o || o.type !== "DELIVERY") back(path, "err", "—");
  if (courierId) {
    const c = await db.query.couriers.findFirst({ where: and(eq(schema.couriers.id, courierId), eq(schema.couriers.tenantId, t.id), eq(schema.couriers.active, true)) });
    if (!c) back(path, "err", "—");
  }
  await db.update(schema.orders).set({ courierId }).where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, t.id)));
  await audit(t.id, await actorName(slug), "order.courier", `#${o!.number}`);
  revalidatePath(path);
  redirect(path);
}
