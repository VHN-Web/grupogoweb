"use server";
// Server Actions do painel. TODA action começa com requireTenantAdmin(slug)
// e TODA query filtra por tenant.id — regra de isolamento multi-tenant.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { formatMoney, parseMajorToMinor } from "@/core/money";
import { COUNTRIES, getRegion, isValidE164, tr } from "@/core/region";
import { checkMercadoPagoToken } from "@/adapters/payments/mercadopago";
import { actorName, clearSession, hashPassword, ownerSubject, requireTenantAdmin, setSession, verifyPassword } from "@/lib/auth";
import { audit, openCredentials, sealCredentials } from "@/lib/security";
import { randomTableCode } from "@/core/codes";
import { CURRENCIES, ORDER_STATUSES, PAYMENT_METHODS, type Currency, type OrderStatus, type PaymentMethod } from "@/core/types";
import { fiscalConfigSchema, parseFiscalConfig, parsePaymentConfig } from "@/core/tenant-config";
import { setOrderStatus, setPaymentStatus } from "@/services/orders";
import { issueFiscalForOrder } from "@/services/fiscal";
import { addMovement, closeSession, openSession } from "@/services/cash";
import { sendCashReport } from "@/services/intelligence";
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
/** Valor monetário digitado em unidade maior da moeda base do tenant → minor units. */
const money = (f: FormData, k: string, cur: string) => parseMajorToMinor(str(f, k), cur as Currency) ?? 0;
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const base = (slug: string) => `/painel/${slug}`;

// ---------------- Geral ----------------
export async function toggleOpen(slug: string) {
  const t = await requireTenantAdmin(slug, "orders");
  await db.update(schema.tenants).set({ isOpen: !t.isOpen }).where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

export async function logout(slug: string) {
  await clearSession();
  redirect(`/painel/${slug}/login`);
}

// ---------------- Pedidos ----------------
async function orderRef(tenantId: string, orderId: string) {
  const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)), columns: { number: true, totalPyg: true } });
  return o ? `#${o.number}` : orderId;
}
export async function updateOrderStatus(slug: string, orderId: string, status: OrderStatus) {
  const t = await requireTenantAdmin(slug, "orders");
  if (!ORDER_STATUSES.includes(status)) throw new Error("status inválido");
  await setOrderStatus(t.id, orderId, status);
  if (status === "CANCELLED") await audit(t.id, await actorName(slug), "order.cancel", await orderRef(t.id, orderId));
  revalidatePath(base(slug), "layout");
}

export async function markOrderPaid(slug: string, orderId: string) {
  const t = await requireTenantAdmin(slug, "orders");
  await setPaymentStatus(t.id, orderId, "PAID");
  await audit(t.id, await actorName(slug), "order.mark_paid", await orderRef(t.id, orderId));
  revalidatePath(base(slug), "layout");
}

export async function issueInvoiceForOrder(slug: string, orderId: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "fiscal");
  await issueFiscalForOrder(t.id, orderId, { ruc: optStr(f, "ruc") ?? undefined, name: optStr(f, "name") ?? undefined });
  revalidatePath(base(slug), "layout");
}

// ---------------- Produtos / estoque ----------------
export async function saveProduct(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "products");
  const id = optStr(f, "id");
  const existing = id
    ? await db.query.products.findFirst({ where: and(eq(schema.products.id, id), eq(schema.products.tenantId, t.id)), columns: { imageUrl: true } })
    : undefined;
  let imageUrl: string | null;
  try {
    imageUrl = await imageField(f, "imageFile", "removeImage", existing?.imageUrl ?? null, `tenants/${t.id}/products`);
  } catch (e) {
    if (e instanceof UploadError) redirect(`${base(slug)}/produtos?err=${encodeURIComponent(e.text(getRegion(t.country).locale))}`);
    throw e;
  }
  const ill = str(f, "illustration");
  const values = {
    name: str(f, "name"),
    description: optStr(f, "description"),
    imageUrl,
    illustration: isIllustration(ill) ? ill : null,
    categoryId: optStr(f, "categoryId"),
    pricePyg: money(f, "pricePyg", t.currency),
    active: bool(f, "active"),
    trackStock: bool(f, "trackStock"),
    // serviço agendável (GoInteligence): duração em minutos
    durationMin: t.tier === "pro" && int(f, "durationMin") > 0 ? Math.min(480, int(f, "durationMin")) : null,
  };
  if (!values.name || values.pricePyg < 0) throw new Error("Dados inválidos");
  // categoria nova digitada no próprio formulário do produto
  const newCat = str(f, "newCategory").slice(0, 40);
  if (newCat) {
    const same = await db.query.categories.findFirst({ where: and(eq(schema.categories.tenantId, t.id), eq(schema.categories.name, newCat)) });
    if (same) values.categoryId = same.id;
    else {
      const n = await db.$count(schema.categories, eq(schema.categories.tenantId, t.id));
      const [c] = await db.insert(schema.categories).values({ tenantId: t.id, name: newCat, sortOrder: n + 1 }).returning();
      values.categoryId = c.id;
    }
  } else if (values.categoryId) {
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
  const t = await requireTenantAdmin(slug, "products");
  const [p] = await db.delete(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.tenantId, t.id))).returning({ name: schema.products.name });
  if (p) await audit(t.id, await actorName(slug), "product.delete", p.name);
  revalidatePath(`${base(slug)}/produtos`);
}

export async function adjustStock(slug: string, productId: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "products");
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
  await audit(t.id, await actorName(slug), "stock.adjust", `${delta > 0 ? "+" : ""}${delta} (${reason})`);
  revalidatePath(`${base(slug)}/produtos`);
}

export async function saveCategory(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "products");
  const id = optStr(f, "id");
  const name = str(f, "name");
  if (!name) return;
  const sortOrder = int(f, "sortOrder");
  if (id) await db.update(schema.categories).set({ name, sortOrder }).where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, t.id)));
  else await db.insert(schema.categories).values({ tenantId: t.id, name, sortOrder });
  revalidatePath(`${base(slug)}/produtos`);
}

export async function deleteCategory(slug: string, id: string) {
  const t = await requireTenantAdmin(slug, "products");
  await db.delete(schema.categories).where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, t.id)));
  revalidatePath(`${base(slug)}/produtos`);
}

// ---------------- Caixa ----------------
export async function openCash(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "cash");
  const opening = money(f, "openingAmountPyg", t.currency);
  await openSession(t.id, opening);
  await audit(t.id, await actorName(slug), "cash.open", formatMoney(opening, t.currency as Currency));
  revalidatePath(`${base(slug)}/caixa`);
}

export async function closeCash(slug: string, sessionId: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "cash");
  const counted = money(f, "countedAmountPyg", t.currency);
  await closeSession(t.id, sessionId, counted, optStr(f, "notes") ?? undefined);
  await audit(t.id, await actorName(slug), "cash.close", `${formatMoney(counted, t.currency as Currency)} contado`);
  revalidatePath(`${base(slug)}/caixa`);
  // GoInteligence: relatório de fechamento enviado no canal preferido do lojista
  if (t.tier === "pro") {
    await sendCashReport(t, sessionId).catch(() => null);
    redirect(`${base(slug)}/caixa/relatorio/${sessionId}`);
  }
}

export async function addCashMovement(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "cash");
  const type = str(f, "type") === "IN" ? "IN" : "OUT";
  const amount = money(f, "amountPyg", t.currency);
  if (amount <= 0) return;
  const desc = str(f, "description") || (type === "IN" ? "Suprimento" : "Retiro");
  await addMovement(t.id, type, amount, desc);
  await audit(t.id, await actorName(slug), type === "IN" ? "cash.in" : "cash.out", `${formatMoney(amount, t.currency as Currency)} — ${desc}`);
  revalidatePath(`${base(slug)}/caixa`);
}

// ---------------- Notas fiscais ----------------
export async function registerFiscalDoc(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "fiscal");
  const total = money(f, "totalPyg", t.currency);
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
  const t = await requireTenantAdmin(slug, "fiscal");
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
  const t = await requireTenantAdmin(slug, "tables");
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
  const t = await requireTenantAdmin(slug, "tables");
  await db
    .update(schema.diningTables)
    .set({ active: sql`not ${schema.diningTables.active}` })
    .where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.tenantId, t.id)));
  revalidatePath(`${base(slug)}/mesas`);
}

export async function regenerateTableCode(slug: string, id: string) {
  const t = await requireTenantAdmin(slug, "tables");
  await db
    .update(schema.diningTables)
    .set({ code: randomTableCode() })
    .where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.tenantId, t.id)));
  revalidatePath(`${base(slug)}/mesas`);
}

export async function deleteTable(slug: string, id: string) {
  const t = await requireTenantAdmin(slug, "tables");
  await db.delete(schema.diningTables).where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.tenantId, t.id)));
  revalidatePath(`${base(slug)}/mesas`);
}

// ---------------- Aparência do site (tema, banner, logo) ----------------
export async function saveAppearance(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "appearance");
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
    if (e instanceof UploadError) redirect(`${base(slug)}/aparencia?err=${encodeURIComponent(e.text(getRegion(t.country).locale))}`);
    throw e;
  }
  revalidatePath(base(slug), "layout");
  redirect(`${base(slug)}/aparencia?ok=1`);
}

// ---------------- Configuração (white-label) ----------------
export async function saveGeneral(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  await db
    .update(schema.tenants)
    .set({
      name: str(f, "name") || t.name,
      phone: isValidE164(str(f, "phone")) ? str(f, "phone") : null,
      whatsapp: isValidE164(str(f, "whatsapp")) ? str(f, "whatsapp") : null,
      instagram: str(f, "instagram").replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30) || null,
      address: optStr(f, "address"),
      ruc: optStr(f, "ruc"),
      acceptsDineIn: bool(f, "acceptsDineIn"),
      acceptsPickup: bool(f, "acceptsPickup"),
      acceptsDelivery: bool(f, "acceptsDelivery"),
    })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

/** País/moeda do estabelecimento. Trocar a moeda NÃO converte preços já cadastrados. */
export async function saveRegion(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  const country = str(f, "country");
  if (!(COUNTRIES as readonly string[]).includes(country)) throw new Error("País inválido");
  const r = getRegion(country);
  const changedCurrency = r.currency !== t.currency;
  await db
    .update(schema.tenants)
    .set({
      country,
      currency: r.currency,
      ...(changedCurrency ? { rateUsd: r.defaultRates.USD, rateBrl: r.defaultRates.BRL, ratePyg: r.defaultRates.PYG } : {}),
    })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
  revalidatePath(`/${t.slug}`);
}

export async function saveRates(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  const usd = num(f, "rateUsd");
  const brl = num(f, "rateBrl");
  const pyg = num(f, "ratePyg");
  await db
    .update(schema.tenants)
    .set({
      rateUsd: usd && usd > 0 ? usd : t.rateUsd,
      rateBrl: brl && brl > 0 ? brl : t.rateBrl,
      ratePyg: pyg && pyg > 0 ? pyg : t.ratePyg,
    })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

export async function saveDelivery(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  const freeOver = str(f, "deliveryFreeOverPyg") ? money(f, "deliveryFreeOverPyg", t.currency) : null;
  await db
    .update(schema.tenants)
    .set({
      lat: num(f, "lat"),
      lng: num(f, "lng"),
      deliveryBaseFeePyg: money(f, "deliveryBaseFeePyg", t.currency),
      deliveryPerKmPyg: money(f, "deliveryPerKmPyg", t.currency),
      deliveryMaxKm: num(f, "deliveryMaxKm") ?? t.deliveryMaxKm,
      deliveryFreeOverPyg: freeOver,
    })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
}

export async function savePayments(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  const cfg = parsePaymentConfig(t.paymentConfig);
  const region = getRegion(t.country);
  const allowed: Currency[] = [region.currency, ...region.extraCurrencies];
  const options = PAYMENT_METHODS.map((m: PaymentMethod) => ({
    method: m,
    provider: str(f, `${m}_provider`) || cfg.options.find((o) => o.method === m)?.provider || "cash",
    enabled: bool(f, `${m}_enabled`),
    currencies: allowed.filter((c: Currency) => bool(f, `${m}_${c}`)),
  })).map((o) => ({ ...o, currencies: o.currencies.length ? o.currencies : [region.currency] }));
  const T = tr(region.locale);
  if (options.some((o) => o.enabled && o.provider === "mercadopago") && !cfg.credentials.mercadopago?.accessToken) {
    redirect(`${base(slug)}/config?err=${encodeURIComponent(T("Conectá Mercado Pago antes de elegirlo.", "Conecte o Mercado Pago antes de escolhê-lo."))}#mercadopago`);
  }
  const next = { ...cfg, options, pixKey: optStr(f, "pixKey") ?? undefined, pixHolder: optStr(f, "pixHolder") ?? undefined, bankInfo: optStr(f, "bankInfo") ?? undefined };
  await db.update(schema.tenants).set({ paymentConfig: JSON.stringify(next) }).where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
  revalidatePath(`/${t.slug}`);
}

/** Conecta um gateway online do próprio estabelecimento (hoje: Mercado Pago). Token é testado antes de salvar. */
export async function saveIntegration(slug: string, providerId: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  const T = tr(getRegion(t.country).locale);
  const cfg = parsePaymentConfig(t.paymentConfig);
  const back = (k: "ok" | "err", msg: string) => redirect(`${base(slug)}/config?${k}=${encodeURIComponent(msg)}#${providerId}`);
  if (providerId !== "mercadopago") back("err", T("Integración no disponible.", "Integração indisponível."));

  const current = openCredentials(cfg.credentials.mercadopago);
  const accessToken = str(f, "accessToken").replace(/\s+/g, "") || current.accessToken || "";
  const webhookSecret = str(f, "webhookSecret").replace(/\s+/g, "") || current.webhookSecret || "";
  if (!accessToken) back("err", T("Pegá el Access Token.", "Cole o Access Token."));
  if (accessToken.startsWith("TEST-") === false && !accessToken.startsWith("APP_USR-")) {
    back("err", T("El Access Token empieza con APP_USR- (no uses la Public Key).", "O Access Token começa com APP_USR- (não use a Public Key)."));
  }
  const check = await checkMercadoPagoToken(accessToken);
  if (!check.ok) back("err", `${T("No se pudo conectar", "Não foi possível conectar")}: ${check.error}`);

  // Ao conectar, o Pix do site passa a ser automático pelo Mercado Pago
  const options = cfg.options.map((o) => (o.method === "PIX" ? { ...o, provider: "mercadopago", enabled: true, currencies: ["BRL" as Currency] } : o));
  const next = {
    ...cfg,
    options,
    credentials: {
      ...cfg.credentials,
      // tokens guardados criptografados (AES-256-GCM)
      mercadopago: sealCredentials({ accessToken, ...(webhookSecret ? { webhookSecret } : {}), account: check.ok ? check.account : "" }),
    },
  };
  await db.update(schema.tenants).set({ paymentConfig: JSON.stringify(next) }).where(eq(schema.tenants.id, t.id));
  await audit(t.id, await actorName(slug), "integration.connect", "Mercado Pago");
  revalidatePath(`/${t.slug}`);
  back("ok", T("¡Mercado Pago conectado! El Pix de tu sitio ahora es automático.", "Mercado Pago conectado! O Pix do seu site agora é automático."));
}

export async function removeIntegration(slug: string, providerId: string) {
  const t = await requireTenantAdmin(slug, "settings");
  const T = tr(getRegion(t.country).locale);
  const cfg = parsePaymentConfig(t.paymentConfig);
  const { [providerId]: _removed, ...rest } = cfg.credentials;
  void _removed;
  // métodos que usavam esse gateway voltam para o modo manual
  const fallback: Record<string, string> = { PIX: "pix_manual", CARD: "pos", CASH: "cash", TRANSFER: "transfer_manual" };
  const options = cfg.options.map((o) => (o.provider === providerId ? { ...o, provider: fallback[o.method] } : o));
  await db.update(schema.tenants).set({ paymentConfig: JSON.stringify({ ...cfg, options, credentials: rest }) }).where(eq(schema.tenants.id, t.id));
  await audit(t.id, await actorName(slug), "integration.remove", providerId);
  revalidatePath(`/${t.slug}`);
  redirect(`${base(slug)}/config?ok=${encodeURIComponent(T("Integración desconectada.", "Integração desconectada."))}`);
}

export async function saveFiscal(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
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
  const t = await requireTenantAdmin(slug, "team");
  const T = tr(getRegion(t.country).locale);
  const back = (k: "ok" | "err", m: string) => redirect(`${base(slug)}/config?${k}=${encodeURIComponent(m)}#seguranca`);
  const actor = await actorName(slug);
  const current = str(f, "current");
  const p = str(f, "password");
  // exige a senha atual (o admin da plataforma pode redefinir sem ela)
  if (actor !== "admin GoWeb" && !verifyPassword(current, t.adminPasswordHash)) {
    await audit(t.id, actor, "password.fail");
    back("err", T("La contraseña actual no es correcta.", "A senha atual não confere."));
  }
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) back("err", T("Mínimo 8 caracteres, con letras y números.", "Mínimo de 8 caracteres, com letras e números."));
  if (p !== str(f, "confirm")) back("err", T("Las contraseñas no coinciden.", "As senhas não conferem."));
  // nova versão de sessão: todos os outros aparelhos são desconectados
  const [u] = await db
    .update(schema.tenants)
    .set({ adminPasswordHash: hashPassword(p), sessionVersion: sql`${schema.tenants.sessionVersion} + 1` })
    .where(eq(schema.tenants.id, t.id))
    .returning();
  await audit(t.id, actor, "password.change");
  if (actor !== "admin GoWeb") await setSession(ownerSubject(u));
  back("ok", T("Contraseña cambiada. Los demás dispositivos fueron desconectados.", "Senha alterada. Os outros aparelhos foram desconectados."));
}

export async function savePrinter(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  const w = Number(str(f, "printerWidth"));
  await db
    .update(schema.tenants)
    .set({ printerWidth: w === 58 ? 58 : 80, autoPrint: bool(f, "autoPrint") })
    .where(eq(schema.tenants.id, t.id));
  revalidatePath(base(slug), "layout");
}

export async function saveReport(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "settings");
  if (t.tier !== "pro") return;
  const ch = str(f, "reportChannel");
  const channel = ch === "email" || ch === "whatsapp" ? ch : "none";
  let to = str(f, "reportTo");
  if (channel === "whatsapp") {
    to = "+" + to.replace(/\D/g, "");
    if (!isValidE164(to)) redirect(`${base(slug)}/config?err=${encodeURIComponent(tr(getRegion(t.country).locale)("WhatsApp inválido (con código de país)", "WhatsApp inválido (com código do país, ex: +5581991234567)"))}`);
  }
  if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) redirect(`${base(slug)}/config?err=${encodeURIComponent("E-mail inválido")}`);
  await db.update(schema.tenants).set({ reportChannel: channel, reportTo: channel === "none" ? null : to }).where(eq(schema.tenants.id, t.id));
  revalidatePath(`${base(slug)}/config`);
}

// ---------------- Entrar com Google ----------------
export async function saveLoginEmail(slug: string, f: FormData) {
  const t = await requireTenantAdmin(slug, "team"); // só o dono
  const T = tr(getRegion(t.country).locale);
  const email = str(f, "loginEmail").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`${base(slug)}/config?err=${encodeURIComponent(T("E-mail inválido", "E-mail inválido"))}#seguranca`);
  await db.update(schema.tenants).set({ loginEmail: email || null }).where(eq(schema.tenants.id, t.id));
  await audit(t.id, await actorName(slug), "google.email", email || "(removido)");
  revalidatePath(`${base(slug)}/config`);
  redirect(`${base(slug)}/config?ok=${encodeURIComponent(T("Guardado", "Salvo"))}#seguranca`);
}
