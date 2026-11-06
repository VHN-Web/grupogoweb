"use server";
// Server Actions do painel. TODA action começa com requireTenantAdmin(slug)
// e TODA query filtra por tenant.id — regra de isolamento multi-tenant.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { clearSession, hashPassword, requireTenantAdmin } from "@/lib/auth";
import { randomTableCode } from "@/core/codes";
import { CURRENCIES, ORDER_STATUSES, PAYMENT_METHODS, type Currency, type OrderStatus, type PaymentMethod } from "@/core/types";
import { fiscalConfigSchema, parseFiscalConfig, parsePaymentConfig } from "@/core/tenant-config";
import { setOrderStatus, setPaymentStatus } from "@/services/orders";
import { issueFiscalForOrder } from "@/services/fiscal";
import { addMovement, closeSession, openSession } from "@/services/cash";
import { ivaIncluded } from "@/adapters/fiscal/FiscalProvider";
import { saveImage, UploadError } from "@/adapters/storage";
import { isIllustration } from "@/core/illustrations";
import { THEME_IDS, type ThemeId } from "@/core/themes";

/** Faz upload se veio arquivo; "remove" apaga; senão mantém o atual. */
async function imageField(f: FormData, fileKey: string, removeKey: string, current: string | null, folder: string) {
  const file = f.get(fileKey);
  if (file instanceof File && file.size > 0) return saveImage(file, folder);
  if (f.get(removeKey) === "on") return null;
  return current;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optStr = (f: FormData, k: string) => str(f, k) || null;
const int = (f: FormData, k: string, d = 0) => {
  const n = Number(str(f, k).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : d;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k).replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const base = (slug: string) => `/painel/${slug}`;

// ---------------- Geral ----------------
export async function toggleOpen(slug: string) {
  const t = await requireTenantAdmin(slug);
  await db.update(schema.tenants).set({ isOpen: !t.isOpen }).where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

export async function logout(slug: string) {
  await clearSession();
  redirect(`/painel/${slug}/login`);
}

// ---------------- Pedidos ----------------
export async function updateOrderStatus(slug: string, orderId: string, status: OrderStatus) {
  const t = await requireTenantAdmin(slug);
  if (!ORDER_STATUSES.includes(status)) throw new Error("status inválido");
  await setOrderStatus(t.id, orderId, status);
  revalidatePath(base(slug), "layout");
}

export async function markOrderPaid(slug: string, orderId: string) {
  const t = await requireTenantAdmin(slug);
  await setPaymentStatus(t.id, orderId, "PAID");
  revalidatePath(base(slug), "layout");
}

export async function issueInvoiceForOrder(slug: string, orderId: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  await issueFiscalForOrder(t.id, orderId, { ruc: optStr(f, "ruc") ?? undefined, name: optStr(f, "name") ?? undefined });
  revalidatePath(base(slug), "layout");
}

// ---------------- Produtos / estoque ----------------
export async function saveProduct(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const id = optStr(f, "id");
  const existing = id
    ? await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.tenantId, t.id)), columns: { imageUrl: true } })
    : undefined;
  let imageUrl: string | null;
  try {
    imageUrl = await imageField(f, "imageFile", "removeImage", existing?.imageUrl ?? null, `tenants/${t.id}/products`);
  } catch (e) {
    if (e instanceof UploadError) redirect(`${base(slug)}/produtos?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const ill = str(f, "illustration");
  const values = {
    name: str(f, "name"),
    description: optStr(f, "description"),
    imageUrl,
    illustration: isIllustration(ill) ? ill : null,
    categoryId: optStr(f, "categoryId"),
    pricePyg: int(f, "pricePyg"),
    active: bool(f, "active"),
    trackStock: bool(f, "trackStock"),
  };
  if (!values.name || values.pricePyg < 0) throw new Error("Dados inválidos");
  if (values.categoryId) {
    const c = await db.query.categories.findFirst({
      where: and(eq(schema.categories.id, values.categoryId), eq(schema.categories.tenantId, t.id)),
    });
    if (!c) values.categoryId = null;
  }
  if (id) {
    await db.update(schema.products).set(values).where(and(eq(schema.products.id, id), eq(schema.products.tenantId, t.id)));
  } else {
    const stock = int(f, "stock");
    const [p] = await db.insert(schema.products).values({ ...values, tenantId: t.id, stock }).returning();
    if (values.trackStock && stock) {
      await db.insert(schema.stockMovements).values({ tenantId: t.id, productId: p.id, delta: stock, reason: "ADJUSTMENT", note: "Stock inicial" });
    }
  }
  revalidatePath(`${base(slug)}/produtos`);
}

export async function deleteProduct(slug: string, productId: string) {
  const t = await requireTenantAdmin(slug);
  await db.delete(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, t.id)));
  revalidatePath(`${base(slug)}/produtos`);
}

export async function adjustStock(slug: string, productId: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const delta = int(f, "delta");
  const reason = str(f, "reason") === "PURCHASE" ? "PURCHASE" : "ADJUSTMENT";
  if (!delta) return;
  await db.transaction(async (tx) => {
    const r = await tx
      .update(schema.products)
      .set({ stock: sql`greatest(0, ${schema.products.stock} + ${delta})` })
      .where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, t.id)))
      .returning({ id: schema.products.id });
    if (!r.length) return;
    await tx.insert(schema.stockMovements).values({ tenantId: t.id, productId, delta, reason, note: optStr(f, "note") });
  });
  revalidatePath(`${base(slug)}/produtos`);
}

export async function saveCategory(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const id = optStr(f, "id");
  const name = str(f, "name");
  if (!name) return;
  const sortOrder = int(f, "sortOrder");
  if (id) await db.update(schema.categories).set({ name, sortOrder }).where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, t.id)));
  else await db.insert(schema.categories).values({ tenantId: t.id, name, sortOrder });
  revalidatePath(`${base(slug)}/produtos`);
}

export async function deleteCategory(slug: string, id: string) {
  const t = await requireTenantAdmin(slug);
  await db.delete(schema.categories).where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, t.id)));
  revalidatePath(`${base(slug)}/produtos`);
}

// ---------------- Caixa ----------------
export async function openCash(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  await openSession(t.id, int(f, "openingAmountPyg"));
  revalidatePath(`${base(slug)}/caixa`);
}

export async function closeCash(slug: string, sessionId: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  await closeSession(t.id, sessionId, int(f, "countedAmountPyg"), optStr(f, "notes") ?? undefined);
  revalidatePath(`${base(slug)}/caixa`);
}

export async function addCashMovement(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const type = str(f, "type") === "IN" ? "IN" : "OUT";
  const amount = int(f, "amountPyg");
  if (amount <= 0) return;
  await addMovement(t.id, type, amount, str(f, "description") || (type === "IN" ? "Suprimento" : "Retiro"));
  revalidatePath(`${base(slug)}/caixa`);
}

// ---------------- Notas fiscais ----------------
export async function registerFiscalDoc(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const total = int(f, "totalPyg");
  if (total <= 0) return;
  const ivaMode = str(f, "iva");
  await db.insert(schema.fiscalDocuments).values({
    tenantId: t.id,
    direction: str(f, "direction") === "ISSUED" ? "ISSUED" : "RECEIVED",
    docNumber: optStr(f, "docNumber"),
    timbrado: optStr(f, "timbrado"),
    partyRuc: optStr(f, "partyRuc"),
    partyName: optStr(f, "partyName"),
    totalPyg: total,
    iva10Pyg: ivaMode === "10" ? ivaIncluded(total, 10) : 0,
    iva5Pyg: ivaMode === "5" ? ivaIncluded(total, 5) : 0,
    exentoPyg: ivaMode === "EX" ? total : 0,
    issuedAt: str(f, "issuedAt") ? new Date(`${str(f, "issuedAt")}T12:00:00`) : new Date(),
    notes: optStr(f, "notes"),
  });
  revalidatePath(`${base(slug)}/notas`);
}

export async function updateFiscalDoc(slug: string, id: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const status = str(f, "status");
  await db
    .update(schema.fiscalDocuments)
    .set({
      docNumber: optStr(f, "docNumber"),
      ...(status === "CANCELLED" || status === "REGISTERED" ? { status } : {}),
    })
    .where(and(eq(schema.fiscalDocuments.id, id), eq(schema.fiscalDocuments.tenantId, t.id)));
  revalidatePath(`${base(slug)}/notas`);
}

// ---------------- Mesas ----------------
export async function addTables(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const label = str(f, "label");
  const qty = Math.min(50, Math.max(1, int(f, "qty", 1)));
  const existing = await db.query.diningTables.findMany({ where: eq(schema.diningTables.tenantId, t.id), columns: { id: true } });
  const rows = Array.from({ length: qty }, (_, i) => ({
    tenantId: t.id,
    label: label && qty === 1 ? label : `${label || "Mesa"} ${existing.length + i + 1}`,
    code: randomTableCode(),
  }));
  await db.insert(schema.diningTables).values(rows);
  revalidatePath(`${base(slug)}/mesas`);
}

export async function toggleTable(slug: string, id: string) {
  const t = await requireTenantAdmin(slug);
  await db
    .update(schema.diningTables)
    .set({ active: sql`not ${schema.diningTables.active}` })
    .where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.tenantId, t.id)));
  revalidatePath(`${base(slug)}/mesas`);
}

export async function regenerateTableCode(slug: string, id: string) {
  const t = await requireTenantAdmin(slug);
  await db
    .update(schema.diningTables)
    .set({ code: randomTableCode() })
    .where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.tenantId, t.id)));
  revalidatePath(`${base(slug)}/mesas`);
}

export async function deleteTable(slug: string, id: string) {
  const t = await requireTenantAdmin(slug);
  await db.delete(schema.diningTables).where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.tenantId, t.id)));
  revalidatePath(`${base(slug)}/mesas`);
}

// ---------------- Aparência do site (tema, banner, logo) ----------------
export async function saveAppearance(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const theme = str(f, "theme") as ThemeId;
  const ill = str(f, "bannerIllustration");
  const color = str(f, "primaryColor");
  try {
    const logoUrl = await imageField(f, "logoFile", "removeLogo", t.logoUrl, `tenants/${t.id}/brand`);
    const bannerImageUrl = await imageField(f, "bannerFile", "removeBanner", t.bannerImageUrl, `tenants/${t.id}/brand`);
    await db
      .update(schema.tenants)
      .set({
        theme: THEME_IDS.includes(theme) ? theme : t.theme,
        primaryColor: /^#[0-9a-f]{6}$/i.test(color) ? color : t.primaryColor,
        logoUrl,
        tagline: optStr(f, "tagline"),
        bannerTag: optStr(f, "bannerTag"),
        bannerTitle: optStr(f, "bannerTitle"),
        bannerSubtitle: optStr(f, "bannerSubtitle"),
        bannerHighlight: optStr(f, "bannerHighlight"),
        bannerImageUrl,
        bannerIllustration: isIllustration(ill) ? ill : null,
      })
      .where(eq(schema.tenants.id, t.id));
  } catch (e) {
    if (e instanceof UploadError) redirect(`${base(slug)}/aparencia?err=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(base(slug), "layout");
  redirect(`${base(slug)}/aparencia?ok=1`);
}

// ---------------- Configuração (white-label) ----------------
export async function saveGeneral(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  await db
    .update(schema.tenants)
    .set({
      name: str(f, "name") || t.name,
      phone: optStr(f, "phone"),
      address: optStr(f, "address"),
      ruc: optStr(f, "ruc"),
      acceptsDineIn: bool(f, "acceptsDineIn"),
      acceptsPickup: bool(f, "acceptsPickup"),
      acceptsDelivery: bool(f, "acceptsDelivery"),
    })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

export async function saveRates(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const usd = num(f, "rateUsd");
  const brl = num(f, "rateBrl");
  await db
    .update(schema.tenants)
    .set({ rateUsd: usd && usd > 0 ? usd : t.rateUsd, rateBrl: brl && brl > 0 ? brl : t.rateBrl })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

export async function saveDelivery(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const freeOver = str(f, "deliveryFreeOverPyg") ? int(f, "deliveryFreeOverPyg") : null;
  await db
    .update(schema.tenants)
    .set({
      lat: num(f, "lat"),
      lng: num(f, "lng"),
      deliveryBaseFeePyg: int(f, "deliveryBaseFeePyg"),
      deliveryPerKmPyg: int(f, "deliveryPerKmPyg"),
      deliveryMaxKm: num(f, "deliveryMaxKm") ?? t.deliveryMaxKm,
      deliveryFreeOverPyg: freeOver,
    })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
}

export async function savePayments(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const cfg = parsePaymentConfig(t.paymentConfig);
  const options = PAYMENT_METHODS.map((m: PaymentMethod) => ({
    method: m,
    provider: str(f, `${m}_provider`) || cfg.options.find((o) => o.method === m)?.provider || "cash",
    enabled: bool(f, `${m}_enabled`),
    currencies: CURRENCIES.filter((c: Currency) => bool(f, `${m}_${c}`)),
  })).map((o) => ({ ...o, currencies: o.currencies.length ? o.currencies : (["PYG"] as Currency[]) }));
  const next = { ...cfg, options, pixKey: optStr(f, "pixKey") ?? undefined, pixHolder: optStr(f, "pixHolder") ?? undefined, bankInfo: optStr(f, "bankInfo") ?? undefined };
  await db.update(schema.tenants).set({ paymentConfig: JSON.stringify(next) }).where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
}

export async function saveFiscal(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const cur = parseFiscalConfig(t.fiscalConfig);
  const next = fiscalConfigSchema.parse({
    ...cur,
    provider: str(f, "provider") || "manual",
    autoIssue: bool(f, "autoIssue"),
    timbrado: optStr(f, "timbrado") ?? undefined,
    establishment: str(f, "establishment") || "001",
    expeditionPoint: str(f, "expeditionPoint") || "001",
  });
  await db.update(schema.tenants).set({ fiscalConfig: JSON.stringify(next) }).where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
}

export async function changePassword(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug);
  const p = str(f, "password");
  if (p.length < 8) throw new Error("Mínimo 8 caracteres");
  await db.update(schema.tenants).set({ adminPasswordHash: hashPassword(p) }).where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
}
