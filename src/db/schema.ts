// Atlas — modelo de dados multi-tenant (white-label).
//
// Convenções (IMPORTANTE para quem — humano ou IA — for mexer aqui):
// - Todo dado de negócio pertence a um tenant (tenantId). Nunca consulte sem filtrar por tenantId.
// - Valores do estabelecimento ficam na MOEDA BASE dele (tenants.currency), em unidade menor.
//   As colunas chamadas *_pyg guardam esse valor (nome histórico: o sistema nasceu só PYG).
//   Exceção: invoices.amount_pyg/usd/brl (billing da plataforma) é sempre por moeda.
// - Valores em moeda estrangeira ficam em UNIDADE MENOR (centavos de USD/BRL). Colunas *_minor.
// - Colunas "enum" são text tipadas com os unions de src/core/types.ts.
import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  BillingInterval,
  CustomerStatus,
  InvoiceKind,
  InvoiceStatus,
  Currency,
  FiscalDirection,
  FiscalStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  StockReason,
} from "@/core/types";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable("tenants", {
  id: id(),
  slug: text("slug").notNull().unique(), // atlas.com.py/{slug}
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#16130F"),
  // Aparência do site (ver src/core/themes.ts)
  theme: text("theme").notNull().default("classic"),
  tagline: text("tagline"), // "Cucina italiana", "Cervecería · Bar"
  bannerTag: text("banner_tag"), // "PROMO DE LA SEMANA"
  bannerTitle: text("banner_title"), // "Combo Doble + papas"
  bannerSubtitle: text("banner_subtitle"),
  bannerHighlight: text("banner_highlight"), // "Gs. 59.000" / "2x1 · 18 a 21 h"
  bannerImageUrl: text("banner_image_url"), // foto do banner (upload)
  bannerIllustration: text("banner_illustration"), // ilustração quando não há foto
  phone: text("phone"),
  address: text("address"),
  ruc: text("ruc"),
  isOpen: boolean("is_open").notNull().default(false),
  acceptsDineIn: boolean("accepts_dine_in").notNull().default(true),
  acceptsPickup: boolean("accepts_pickup").notNull().default(true),
  acceptsDelivery: boolean("accepts_delivery").notNull().default(true),

  // Região: país define idioma, moeda base e formato de telefone (src/core/region.ts)
  country: text("country").notNull().default("PY"),
  currency: text("currency").$type<Currency>().notNull().default("PYG"), // moeda base dos preços

  // Câmbio manual: unidades da moeda BASE por 1 unidade da moeda
  rateUsd: doublePrecision("rate_usd").notNull().default(7300),
  rateBrl: doublePrecision("rate_brl").notNull().default(1300),
  ratePyg: doublePrecision("rate_pyg").notNull().default(0.00075),

  // Delivery
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  deliveryBaseFeePyg: integer("delivery_base_fee_pyg").notNull().default(5000),
  deliveryPerKmPyg: integer("delivery_per_km_pyg").notNull().default(2000),
  deliveryMaxKm: doublePrecision("delivery_max_km").notNull().default(8),
  deliveryFreeOverPyg: integer("delivery_free_over_pyg"),

  // Configurações JSON validadas por zod em src/core/tenant-config.ts
  paymentConfig: text("payment_config").notNull().default("{}"),
  fiscalConfig: text("fiscal_config").notNull().default("{}"),

  adminPasswordHash: text("admin_password_hash").notNull(),

  // Domínio próprio do estabelecimento (ex: www.donmario.com.py). Ver src/middleware.ts
  customDomain: text("custom_domain").unique(),
  // Suspenso por inadimplência (cardápio fora do ar; painel continua acessível para pagar)
  suspended: boolean("suspended").notNull().default(false),
  createdAt: createdAt(),
});

export const categories = pgTable(
  "categories",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("categories_tenant_idx").on(t.tenantId)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    illustration: text("illustration"), // ilustração usada quando não há foto (src/core/illustrations.ts)
    pricePyg: integer("price_pyg").notNull(),
    active: boolean("active").notNull().default(true),
    trackStock: boolean("track_stock").notNull().default(false),
    stock: integer("stock").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("products_tenant_idx").on(t.tenantId)],
);

export const stockMovements = pgTable("stock_movements", {
  id: id(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(), // + entrada / - saída
  reason: text("reason").$type<StockReason>().notNull(),
  orderId: text("order_id"),
  note: text("note"),
  createdAt: createdAt(),
});

export const diningTables = pgTable(
  "dining_tables",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "Mesa 5"
    code: text("code").notNull(), // código curto do QR (?mesa=CODE)
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("tables_tenant_code_uq").on(t.tenantId, t.code)],
);

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingAmountPyg: integer("opening_amount_pyg").notNull().default(0),
    countedAmountPyg: integer("counted_amount_pyg"),
    notes: text("notes"),
  },
  (t) => [index("cash_sessions_tenant_idx").on(t.tenantId, t.openedAt)],
);

export const cashMovements = pgTable("cash_movements", {
  id: id(),
  sessionId: text("session_id")
    .notNull()
    .references(() => cashSessions.id, { onDelete: "cascade" }),
  type: text("type").$type<"IN" | "OUT">().notNull(), // IN = suprimento, OUT = sangria/gasto
  amountPyg: integer("amount_pyg").notNull(),
  description: text("description").notNull(),
  createdAt: createdAt(),
});

export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // número curto aleatório para o cliente ("4821")
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    type: text("type").$type<OrderType>().notNull(),
    tableId: text("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    tableLabel: text("table_label"), // snapshot
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    distanceKm: doublePrecision("distance_km"),
    notes: text("notes"),

    subtotalPyg: integer("subtotal_pyg").notNull(),
    deliveryFeePyg: integer("delivery_fee_pyg").notNull().default(0),
    totalPyg: integer("total_pyg").notNull(),

    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull(),
    paymentProvider: text("payment_provider").notNull(), // id do adapter
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("PENDING"),
    paymentRef: text("payment_ref"),
    payCurrency: text("pay_currency").$type<Currency>().notNull().default("PYG"),
    exchangeRate: doublePrecision("exchange_rate").notNull().default(1), // PYG por 1 unidade
    payAmountMinor: integer("pay_amount_minor").notNull(),
    cashTenderedMinor: integer("cash_tendered_minor"), // "pago con"
    changeDuePyg: integer("change_due_pyg"), // vuelto em guaraníes

    status: text("status").$type<OrderStatus>().notNull().default("RECEIVED"),
    cashSessionId: text("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("orders_tenant_number_idx").on(t.tenantId, t.number),
  ],
);

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
  name: text("name").notNull(), // snapshot
  unitPricePyg: integer("unit_price_pyg").notNull(), // snapshot
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
});

// Registro de notas fiscais (facturas): emitidas (ventas) e recebidas (compras)
export const fiscalDocuments = pgTable(
  "fiscal_documents",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
    direction: text("direction").$type<FiscalDirection>().notNull(),
    provider: text("provider").notNull().default("manual"), // manual | sifen
    status: text("status").$type<FiscalStatus>().notNull().default("REGISTERED"),
    docNumber: text("doc_number"), // 001-001-0000123
    timbrado: text("timbrado"),
    cdc: text("cdc"), // Código de Control SIFEN (44 dígitos)
    partyRuc: text("party_ruc"),
    partyName: text("party_name"),
    totalPyg: integer("total_pyg").notNull(),
    iva10Pyg: integer("iva10_pyg").notNull().default(0),
    iva5Pyg: integer("iva5_pyg").notNull().default(0),
    exentoPyg: integer("exento_pyg").notNull().default(0),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("fiscal_tenant_idx").on(t.tenantId, t.issuedAt)],
);

// =============================================================================
// PLATAFORMA (o seu negócio): planos, clientes contratantes, faturas, tarefas
// =============================================================================
// Valores de planos/faturas em UNIDADE MENOR de cada moeda: PYG inteiro, USD/BRL centavos.

export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("default"), // linha única
  companyName: text("company_name").notNull().default("Atlas"),
  platformDomain: text("platform_domain"), // ex: atlas.com.py — habilita {slug}.atlas.com.py
  supportWhatsapp: text("support_whatsapp"),
  supportEmail: text("support_email"),
  // Preço do domínio adicional (1º ano), por moeda
  domainPricePyg: integer("domain_price_pyg").notNull().default(150000),
  domainPriceUsdMinor: integer("domain_price_usd_minor").notNull().default(2000),
  domainPriceBrlMinor: integer("domain_price_brl_minor").notNull().default(9900),
  // Gateway por moeda: { PYG: "manual", USD: "paypal", BRL: "mercadopago" }
  gatewayByCurrency: text("gateway_by_currency").notNull().default('{"PYG":"manual","USD":"manual","BRL":"mercadopago"}'),
  // Instruções de pagamento manual (transferência, depósito...) por moeda
  manualInstructions: text("manual_instructions"),
  invoiceDaysBefore: integer("invoice_days_before").notNull().default(5), // gera a fatura X dias antes do vencimento
  graceDays: integer("grace_days").notNull().default(7), // dias de atraso até suspender
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable("plans", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  interval: text("interval").$type<BillingInterval>().notNull(), // MONTHLY | YEARLY
  // Mensalidade/anuidade por moeda
  pricePyg: integer("price_pyg").notNull(),
  priceUsdMinor: integer("price_usd_minor").notNull(),
  priceBrlMinor: integer("price_brl_minor").notNull(),
  // Taxa de implantação por moeda
  setupPyg: integer("setup_pyg").notNull().default(0),
  setupUsdMinor: integer("setup_usd_minor").notNull().default(0),
  setupBrlMinor: integer("setup_brl_minor").notNull().default(0),
  includesDomain: boolean("includes_domain").notNull().default(false), // anual: domínio grátis
  features: text("features"), // texto livre, 1 por linha (exibido ao cliente)
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const customers = pgTable(
  "customers",
  {
    id: id(),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    whatsapp: text("whatsapp"),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    ruc: text("ruc"),
    desiredSlug: text("desired_slug").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    preferredCurrency: text("preferred_currency").$type<Currency>().notNull().default("PYG"),
    theme: text("theme").notNull().default("classic"), // modelo de site escolhido na contratação
    country: text("country").notNull().default("PY"), // país do estabelecimento
    wantsDomain: boolean("wants_domain").notNull().default(false),
    domainName: text("domain_name"), // domínio desejado
    status: text("status").$type<CustomerStatus>().notNull().default("AWAITING_SETUP_PAYMENT"),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    nextBillingAt: timestamp("next_billing_at", { withTimezone: true }), // próximo vencimento
    domainPaidUntil: timestamp("domain_paid_until", { withTimezone: true }), // planos sem domínio incluso renovam anualmente
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_status_idx").on(t.status)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    kind: text("kind").$type<InvoiceKind>().notNull(), // SETUP | SUBSCRIPTION
    description: text("description").notNull(),
    // Valor nas 3 moedas: o cliente escolhe como pagar
    amountPyg: integer("amount_pyg").notNull(),
    amountUsdMinor: integer("amount_usd_minor").notNull(),
    amountBrlMinor: integer("amount_brl_minor").notNull(),
    status: text("status").$type<InvoiceStatus>().notNull().default("OPEN"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidCurrency: text("paid_currency").$type<Currency>(),
    paidAmountMinor: integer("paid_amount_minor"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    checkoutUrl: text("checkout_url"),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_customer_idx").on(t.customerId), index("invoices_status_idx").on(t.status, t.dueAt)],
);

export const adminTasks = pgTable("admin_tasks", {
  id: id(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // IMPLEMENTATION | DOMAIN_PURCHASE | DNS_SETUP
  title: text("title").notNull(),
  details: text("details"),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // EMAIL | WHATSAPP
  to: text("to").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  status: text("status").notNull(), // SENT | FAILED | LOGGED
  error: text("error"),
  createdAt: createdAt(),
});

// ---------- Relations ----------
export const tenantsRelations = relations(tenants, ({ many }) => ({
  categories: many(categories),
  products: many(products),
  tables: many(diningTables),
  orders: many(orders),
}));
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  tenant: one(tenants, { fields: [categories.tenantId], references: [tenants.id] }),
  products: many(products),
}));
export const productsRelations = relations(products, ({ one }) => ({
  tenant: one(tenants, { fields: [products.tenantId], references: [tenants.id] }),
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
}));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(tenants, { fields: [orders.tenantId], references: [tenants.id] }),
  items: many(orderItems),
  table: one(diningTables, { fields: [orders.tableId], references: [diningTables.id] }),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));
export const cashSessionsRelations = relations(cashSessions, ({ many }) => ({
  movements: many(cashMovements),
}));
export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  session: one(cashSessions, { fields: [cashMovements.sessionId], references: [cashSessions.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  plan: one(plans, { fields: [customers.planId], references: [plans.id] }),
  tenant: one(tenants, { fields: [customers.tenantId], references: [tenants.id] }),
  invoices: many(invoices),
  tasks: many(adminTasks),
}));
export const invoicesRelations = relations(invoices, ({ one }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
}));
export const adminTasksRelations = relations(adminTasks, ({ one }) => ({
  customer: one(customers, { fields: [adminTasks.customerId], references: [customers.id] }),
}));

export type Tenant = typeof tenants.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type PlatformSettings = typeof platformSettings.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type DiningTable = typeof diningTables.$inferSelect;
export type FiscalDocument = typeof fiscalDocuments.$inferSelect;
