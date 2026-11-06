"use server";
// Server Actions do GoInteligence (recursos pro). Toda action verifica acesso + plano pro.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { actorName, hashPassword, requireTenantAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";
import { normalizeCode, parseBookingConfig, waLink } from "@/core/intelligence";
import { parseMajorToMinor, formatMoney } from "@/core/money";
import { getRegion, tr } from "@/core/region";
import { PANEL_AREAS, type Currency, type PanelArea } from "@/core/types";
import { appointmentConfirmMessage, recoveryMessage } from "@/services/intelligence";
import { sendWhatsApp } from "@/adapters/notify";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const base = (slug: string) => `/painel/${slug}`;

async function proTenant(slug: string, area: PanelArea) {
  const t = await requireTenantAdmin(slug, area);
  if (t.tier !== "pro") redirect(`${base(slug)}/plano`);
  return t;
}
function back(path: string, kind: "ok" | "err", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

// ---------------------------------------------------------------- ofertas relâmpago
export async function saveFlashOffer(slug: string, f: FormData) {
  const t = await proTenant(slug, "marketing");
  const T = tr(getRegion(t.country).locale);
  const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, str(f, "productId")), eq(schema.products.tenantId, t.id)) });
  if (!p) back(`${base(slug)}/marketing`, "err", T("Elegí un producto", "Escolha um produto"));
  const price = parseMajorToMinor(str(f, "promoPrice"), t.currency as Currency);
  if (price == null || price <= 0 || price >= p.pricePyg)
    back(`${base(slug)}/marketing`, "err", T("El precio de oferta tiene que ser menor que el precio normal", "O preço da oferta precisa ser menor que o preço normal"));
  const hours = Math.min(24 * 14, Math.max(1, Number(str(f, "hours")) || 2));
  await db
    .update(schema.products)
    .set({ promoPricePyg: price, promoEndsAt: new Date(Date.now() + hours * 3600e3) })
    .where(eq(schema.products.id, p.id));
  revalidatePath(`/${t.slug}`);
  back(`${base(slug)}/marketing`, "ok", T(`Oferta relámpago activa por ${hours} h`, `Oferta relâmpago ativa por ${hours} h`));
}

export async function endFlashOffer(slug: string, productId: string) {
  const t = await proTenant(slug, "marketing");
  await db
    .update(schema.products)
    .set({ promoPricePyg: null, promoEndsAt: null })
    .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, t.id)));
  revalidatePath(`${base(slug)}/marketing`);
  revalidatePath(`/${t.slug}`);
}

// ---------------------------------------------------------------- cupons
export async function saveCoupon(slug: string, f: FormData) {
  const t = await proTenant(slug, "marketing");
  const T = tr(getRegion(t.country).locale);
  const code = normalizeCode(str(f, "code"));
  if (code.length < 3) back(`${base(slug)}/marketing`, "err", T("Código muy corto", "Código muito curto"));
  const kind = str(f, "kind") === "FIXED" ? "FIXED" : "PERCENT";
  const value = kind === "PERCENT" ? Math.round(Number(str(f, "value").replace(",", "."))) : (parseMajorToMinor(str(f, "value"), t.currency as Currency) ?? 0);
  if (!(value > 0) || (kind === "PERCENT" && value > 90)) back(`${base(slug)}/marketing`, "err", T("Valor del descuento inválido", "Valor do desconto inválido"));
  const min = str(f, "minSubtotal") ? (parseMajorToMinor(str(f, "minSubtotal"), t.currency as Currency) ?? 0) : 0;
  const maxUses = Number(str(f, "maxUses")) > 0 ? Math.floor(Number(str(f, "maxUses"))) : null;
  const days = Number(str(f, "days")) > 0 ? Number(str(f, "days")) : null;
  const exists = await db.query.coupons.findFirst({ where: and(eq(schema.coupons.tenantId, t.id), eq(schema.coupons.code, code)) });
  if (exists) back(`${base(slug)}/marketing`, "err", T("Ya existe un cupón con ese código", "Já existe um cupom com esse código"));
  await db.insert(schema.coupons).values({
    tenantId: t.id,
    code,
    kind,
    value,
    minSubtotal: min,
    maxUses,
    expiresAt: days ? new Date(Date.now() + days * 864e5) : null,
  });
  await audit(t.id, await actorName(slug), "coupon.create", `${code} ${kind === "PERCENT" ? `${value}%` : formatMoney(value, t.currency as Currency)}`);
  back(`${base(slug)}/marketing`, "ok", T(`Cupón ${code} creado`, `Cupom ${code} criado`));
}

export async function toggleCoupon(slug: string, id: string) {
  const t = await proTenant(slug, "marketing");
  const c = await db.query.coupons.findFirst({ where: and(eq(schema.coupons.id, id), eq(schema.coupons.tenantId, t.id)) });
  if (c) await db.update(schema.coupons).set({ active: !c.active }).where(eq(schema.coupons.id, c.id));
  revalidatePath(`${base(slug)}/marketing`);
}

export async function deleteCoupon(slug: string, id: string) {
  const t = await proTenant(slug, "marketing");
  const [c] = await db.delete(schema.coupons).where(and(eq(schema.coupons.id, id), eq(schema.coupons.tenantId, t.id))).returning({ code: schema.coupons.code });
  if (c) await audit(t.id, await actorName(slug), "coupon.delete", c.code);
  revalidatePath(`${base(slug)}/marketing`);
}

// ---------------------------------------------------------------- carrinho abandonado
/** Abre o WhatsApp do cliente com a mensagem de recuperação (e cupom, se escolhido). */
export async function contactCart(slug: string, cartId: string, f: FormData) {
  const t = await proTenant(slug, "marketing");
  const cart = await db.query.carts.findFirst({ where: and(eq(schema.carts.id, cartId), eq(schema.carts.tenantId, t.id)) });
  if (!cart) redirect(`${base(slug)}/marketing`);
  const couponId = str(f, "couponId");
  const coupon = couponId ? await db.query.coupons.findFirst({ where: and(eq(schema.coupons.id, couponId), eq(schema.coupons.tenantId, t.id)) }) : null;
  const label = coupon ? (coupon.kind === "PERCENT" ? `${coupon.value}% OFF` : `-${formatMoney(coupon.value, t.currency as Currency)}`) : undefined;
  const msg = recoveryMessage(t, cart, coupon?.code, label);
  await db.update(schema.carts).set({ status: "CONTACTED", contactedAt: new Date() }).where(eq(schema.carts.id, cart.id));
  redirect(waLink(cart.customerPhone, msg));
}

export async function dismissCart(slug: string, cartId: string) {
  const t = await proTenant(slug, "marketing");
  await db.delete(schema.carts).where(and(eq(schema.carts.id, cartId), eq(schema.carts.tenantId, t.id)));
  revalidatePath(`${base(slug)}/marketing`);
}

// ---------------------------------------------------------------- agenda
export async function saveBooking(slug: string, f: FormData) {
  const t = await proTenant(slug, "agenda");
  const T = tr(getRegion(t.country).locale);
  const hours = Array.from({ length: 7 }, (_, d) => {
    if (!bool(f, `open_${d}`)) return "";
    const a = str(f, `from_${d}`);
    const b = str(f, `to_${d}`);
    return /^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b) && a < b ? `${a}-${b}` : "";
  });
  const cfg = parseBookingConfig(
    JSON.stringify({ enabled: bool(f, "enabled"), slotMin: Number(str(f, "slotMin")), hours, leadMin: Number(str(f, "leadMin")), daysAhead: Number(str(f, "daysAhead")) }),
  );
  await db.update(schema.tenants).set({ bookingConfig: JSON.stringify(cfg) }).where(eq(schema.tenants.id, t.id));
  revalidatePath(`/${t.slug}`);
  back(`${base(slug)}/agenda`, "ok", T("Agenda guardada", "Agenda salva"));
}

export async function setAppointmentStatus(slug: string, id: string, status: "CONFIRMED" | "CANCELLED" | "DONE") {
  const t = await proTenant(slug, "agenda");
  const a = await db.query.appointments.findFirst({ where: and(eq(schema.appointments.id, id), eq(schema.appointments.tenantId, t.id)) });
  if (!a) redirect(`${base(slug)}/agenda`);
  await db.update(schema.appointments).set({ status }).where(eq(schema.appointments.id, a.id));
  revalidatePath(`${base(slug)}/agenda`);
  if (status === "CONFIRMED") {
    // confirmação para o cliente: automática se houver API de WhatsApp; senão abre o WhatsApp com a mensagem pronta
    const msg = appointmentConfirmMessage(t, a);
    const r = t.demo ? { status: "SKIPPED" as const } : await sendWhatsApp(a.customerPhone, msg).catch(() => ({ status: "FAILED" as const }));
    if (r.status !== "SENT") redirect(waLink(a.customerPhone, msg));
  }
}

// ---------------------------------------------------------------- equipe
function permsFrom(f: FormData): PanelArea[] {
  return PANEL_AREAS.filter((a) => a !== "team" && bool(f, `perm_${a}`));
}

export async function createStaff(slug: string, f: FormData) {
  const t = await proTenant(slug, "team");
  const T = tr(getRegion(t.country).locale);
  const name = str(f, "name").slice(0, 60);
  const username = str(f, "username").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30);
  const password = str(f, "password");
  if (!name || username.length < 3) back(`${base(slug)}/equipe`, "err", T("Completá nombre y usuario (mín. 3 letras)", "Preencha nome e usuário (mín. 3 letras)"));
  if (password.length < 6) back(`${base(slug)}/equipe`, "err", T("Contraseña de al menos 6 caracteres", "Senha de pelo menos 6 caracteres"));
  const exists = await db.query.staff.findFirst({ where: and(eq(schema.staff.tenantId, t.id), eq(schema.staff.username, username)) });
  if (exists) back(`${base(slug)}/equipe`, "err", T("Ese usuario ya existe", "Esse usuário já existe"));
  await db.insert(schema.staff).values({ tenantId: t.id, name, username, passwordHash: hashPassword(password), permissions: JSON.stringify(permsFrom(f)) });
  await audit(t.id, await actorName(slug), "staff.create", `${name} (${username})`);
  back(`${base(slug)}/equipe`, "ok", T(`Usuario ${username} creado`, `Usuário ${username} criado`));
}

export async function updateStaff(slug: string, id: string, f: FormData) {
  const t = await proTenant(slug, "team");
  const T = tr(getRegion(t.country).locale);
  const s = await db.query.staff.findFirst({ where: and(eq(schema.staff.id, id), eq(schema.staff.tenantId, t.id)) });
  if (!s) redirect(`${base(slug)}/equipe`);
  const password = str(f, "password");
  if (password && password.length < 6) back(`${base(slug)}/equipe`, "err", T("Contraseña de al menos 6 caracteres", "Senha de pelo menos 6 caracteres"));
  await db
    .update(schema.staff)
    .set({
      permissions: JSON.stringify(permsFrom(f)),
      active: bool(f, "active"),
      // senha nova ou acesso desativado: derruba as sessões abertas desse funcionário
      ...(password ? { passwordHash: hashPassword(password) } : {}),
      ...(password || !bool(f, "active") ? { sessionVersion: sql`${schema.staff.sessionVersion} + 1` } : {}),
    })
    .where(eq(schema.staff.id, s.id));
  await audit(t.id, await actorName(slug), "staff.update", `${s.name}${password ? " (senha trocada)" : ""}${bool(f, "active") ? "" : " (desativado)"}`);
  back(`${base(slug)}/equipe`, "ok", T("Permisos actualizados", "Permissões atualizadas"));
}

export async function deleteStaff(slug: string, id: string) {
  const t = await proTenant(slug, "team");
  const [s] = await db.delete(schema.staff).where(and(eq(schema.staff.id, id), eq(schema.staff.tenantId, t.id))).returning({ name: schema.staff.name });
  if (s) await audit(t.id, await actorName(slug), "staff.delete", s.name);
  revalidatePath(`${base(slug)}/equipe`);
}
