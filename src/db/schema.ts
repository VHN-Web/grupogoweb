// GoWeb — modelo de dados multi-tenant (white-label).
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
  slug: text("slug").notNull().unique(), // goweboficial.com/{slug}
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

  // Redes sociais exibidas no site (ícones clicáveis)
  whatsapp: text("whatsapp"), // E.164
  instagram: text("instagram"), // @usuario (sem @)

  // Plano de recursos: "basic" | "pro" (GoInteligence)
  tier: text("tier").$type<"basic" | "pro">().notNull().default("basic"),

  // Impressora térmica
  printerWidth: integer("printer_width").notNull().default(80), // 58 | 80 mm
  autoPrint: boolean("auto_print").notNull().default(false),

  // Relatório de fechamento de caixa (GoInteligence)
  reportChannel: text("report_channel").$type<"none" | "email" | "whatsapp">().notNull().default("none"),
  reportTo: text("report_to"), // e-mail ou WhatsApp E.164

  // Agenda (GoInteligence) — JSON validado em src/core/intelligence.ts
  bookingConfig: text("booking_config").notNull().default("{}"),
  dispatchConfig: text("dispatch_config").notNull().default("{}"), // entregas: atribuição automática (raio, limite por motoboy)
  geovanaConfig: text("geovana_config").notNull().default("{}"), // Geovana (IA no WhatsApp): predefinições + canal (segredos selados) — core/geovana.ts

  // Segurança
  demo: boolean("demo").notNull().default(false), // loja de demonstração (único caso em que o pagamento simulado é aceito)
  sessionVersion: integer("session_version").notNull().default(1), // trocar a senha derruba as outras sessões
  // Asaas (Brasil): subconta white-label do lojista para receber as vendas online com split
  asaasAccountId: text("asaas_account_id"),
  asaasWalletId: text("asaas_wallet_id"),
  asaasApiKeySealed: text("asaas_api_key_sealed"), // chave da subconta (selada com lib/secrets; o Asaas mostra uma vez só)
  asaasInfo: text("asaas_info"), // JSON: dados enviados na criação (sem chave), chave Pix p/ repasse, status cadastral
  splitPct: doublePrecision("split_pct"), // % de cada venda que abate a mensalidade (null = padrão da plataforma)
  // Crescimento (carteira de clientes, indicação, fidelidade, campanhas…) — JSON validado em core/growth.ts
  growthConfig: text("growth_config").notNull().default("{}"),
  modules: text("modules"), // plano personalizado: JSON ModuleKey[]; null = tudo do plano liberado
  demoNote: text("demo_note"), // demonstração criada pelo admin (para quem / observação); null nas demos do sistema
  loginEmail: text("login_email"), // e-mail Google do dono (além do e-mail do contrato) para "Entrar com Google"
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
    // Oferta relâmpago (GoInteligence): preço promocional até promoEndsAt
    promoPricePyg: integer("promo_price_pyg"),
    promoEndsAt: timestamp("promo_ends_at", { withTimezone: true }),
    // Serviço agendável (ex: corte de cabelo): duração em minutos
    durationMin: integer("duration_min"),
    importBatch: text("import_batch"), // cardápio por foto: lote importado (ocultos até a loja publicar)
    createdAt: createdAt(),
  },
  (t) => [index("products_tenant_idx").on(t.tenantId)],
);

/**
 * Galeria do produto (core/media.ts): fotos extras e vídeo, na ordem do lojista. A foto principal continua em
 * products.image_url (retrocompatível: produto sem linhas aqui = só a foto de sempre).
 */
export const productMedia = pgTable(
  "product_media",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"image" | "video">().notNull(),
    url: text("url").notNull(), // /uploads/<caminho> (Blob privado) ou URL pública do Blob
    sizeBytes: integer("size_bytes").notNull().default(0),
    contentType: text("content_type"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("product_media_product_idx").on(t.productId, t.position), index("product_media_tenant_idx").on(t.tenantId)],
);
export type ProductMedia = typeof productMedia.$inferSelect;

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
    customerDoc: text("customer_doc"), // CPF opcional (só dígitos) — "CPF na nota"
    printedAt: timestamp("printed_at", { withTimezone: true }), // impressão automática (uma vez só)
    type: text("type").$type<OrderType>().notNull(),
    tableId: text("table_id").references(() => diningTables.id, { onDelete: "set null" }),
    tableLabel: text("table_label"), // snapshot
    address: text("address"),
    neighborhood: text("neighborhood"), // bairro da entrega (destaque para o motoboy) — core/address.ts
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    distanceKm: doublePrecision("distance_km"),
    notes: text("notes"),

    subtotalPyg: integer("subtotal_pyg").notNull(),
    discountPyg: integer("discount_pyg").notNull().default(0),
    couponCode: text("coupon_code"),
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
    // Crescimento: cliente da loja, de onde veio e quem indicou
    shopperId: text("shopper_id"),
    courierId: text("courier_id"), // motoboy que levou o pedido
    autoAssigned: boolean("auto_assigned").notNull().default(false), // motoboy escolhido pelo sistema (pode recusar)
    declinedCourierIds: text("declined_courier_ids"), // JSON: quem recusou esta entrega
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }), // motoboy saiu com o pedido
    deliveredAt: timestamp("delivered_at", { withTimezone: true }), // motoboy confirmou a entrega
    // Asaas: split que abate a mensalidade (centavos) e ciclo a que pertence
    billingCycleId: text("billing_cycle_id"),
    platformSplitMinor: integer("platform_split_minor").notNull().default(0),
    splitStatus: text("split_status").$type<"PENDING" | "CONFIRMED" | "REFUNDED" | "CANCELLED">(),
    pixPayload: text("pix_payload"), // Pix copia e cola gerado pelo gateway
    // Apps de delivery (Open Delivery: 99Food, Keeta…): null = pedido do site/painel
    channel: text("channel"), // "99food" | "keeta"
    externalId: text("external_id"), // id do pedido no app
    externalDisplayId: text("external_display_id"), // número que o app mostra ao cliente
    marketplaceDelivery: boolean("marketplace_delivery").notNull().default(false), // entregador do app (não usa motoboys da loja)
    odConfirmed: boolean("od_confirmed").notNull().default(false), // já confirmado no app
    odFlags: text("od_flags"), // JSON: quais status o app quer receber (sendPreparing/sendDelivered/sendPickedUp)
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }), // app/cliente pediu para cancelar (loja decide)
    source: text("source"),
    campaign: text("campaign"), // Assessoria: código do anúncio/post rastreado (?origem=anuncio-s1-sex) — core/advisory.ts#campaignOf
    referrerShopperId: text("referrer_shopper_id"),
    growthDone: boolean("growth_done").notNull().default(false), // recompensas já processadas (uma vez só)
    cashSessionId: text("cash_session_id").references(() => cashSessions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("orders_tenant_number_idx").on(t.tenantId, t.number),
    uniqueIndex("orders_channel_ext_uq").on(t.tenantId, t.channel, t.externalId),
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
  companyName: text("company_name").notNull().default("GoWeb"),
  modulePrices: text("module_prices").notNull().default("{}"), // preços do plano personalizado (core/modules.ts)
  platformDomain: text("platform_domain"), // ex: goweboficial.com — habilita {slug}.goweboficial.com
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
  // Dados da contratada (aparecem no contrato). Enquanto não houver CNPJ, vale o CPF do titular.
  legalName: text("legal_name"), // razão social ou nome completo do titular
  legalDoc: text("legal_doc"), // CNPJ ou CPF
  legalAddress: text("legal_address"),
  legalCity: text("legal_city"), // foro / cidade do contrato
  // Nota fiscal de serviço (NFS-e): desligada até cadastrar a conta PJ
  nfseEnabled: boolean("nfse_enabled").notNull().default(false),
  nfseProvider: text("nfse_provider"), // "nacional" | "focus" | "enotas" (a integrar)
  nfseMunicipalReg: text("nfse_municipal_reg"), // inscrição municipal
  nfseServiceCode: text("nfse_service_code"), // item da lista de serviços (LC 116) — ex.: 1.03 / 1.05
  // Retenção de contratos e notas/recibos no sistema (meses)
  docsRetentionMonths: integer("docs_retention_months").notNull().default(12),
  affiliateConfig: text("affiliate_config").notNull().default("{}"), // programa de afiliados (core/affiliates.ts)
  crmConfig: text("crm_config").notNull().default("{}"), // CRM: busca de leads, metas, chave Gemini (selada), VAPID
  asaasConfig: text("asaas_config").notNull().default("{}"),
  homologConfig: text("homolog_config").notNull().default("{}"), // Central de Homologação: repositório, token do GitHub (selado), segredo do webhook
  whatsappConfig: text("whatsapp_config").notNull().default("{}"), // Geovana: servidor Evolution (chave selada) + IA (chave Gemini selada, modelo) // Asaas: ambiente, chave da conta principal (selada), walletId, token do webhook, split padrão
  odConfig: text("od_config").notNull().default("{}"),
  gwBotConfig: text("gw_bot_config").notNull().default("{}"),
  waGuardConfig: text("wa_guard_config").notNull().default("{}"), // proteção da Geovana: limites de envio e de IA (core/wa-guard.ts)
  igConfig: text("ig_config").notNull().default("{}"), // Instagram: app da Meta (id, secret selado, verify token)
  advisoryConfig: text("advisory_config").notNull().default("{}"), // Assessoria GoWeb: preços, liga/desliga, publicação automática (core/advisory.ts)
  contentIdeas: text("content_ideas"), // última geração de ideias de posts/Reels (JSON) — core/content-ideas.ts // Geovana da GoWeb (WhatsApp da própria GoWeb) — core/goweb-bot.ts // Apps de delivery (Open Delivery): credenciais padrão da GoWeb por app (segredo selado)
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
  intelligence: boolean("intelligence").notNull().default(false), // inclui GoInteligence (recursos pro)
  modules: text("modules"), // plano personalizado: JSON ModuleKey[]; null = plano fechado (tudo)
  isCustom: boolean("is_custom").notNull().default(false), // plano montado pelo cliente (1 por contratação; não aparece na lista)
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
    affiliateId: text("affiliate_id"), // afiliado que trouxe o cliente (só Brasil)
    affiliateLeadId: text("affiliate_lead_id"),
    // Asaas: o lojista como cliente da conta principal (implantação + saldo residual) e cartão salvo
    asaasCustomerId: text("asaas_customer_id"),
    cardTokenSealed: text("card_token_sealed"),
    cardLabel: text("card_label"), // "VISA •••• 1234"
    preferredBilling: text("preferred_billing").$type<"PIX" | "CREDIT_CARD">().notNull().default("PIX"),
    createdAt: createdAt(),
  },
  (t) => [index("customers_status_idx").on(t.status), index("customers_affiliate_idx").on(t.affiliateId)],
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
    // Aceite do resumo/contrato antes de pagar (Decreto 7.962/2013 e CDC art. 46)
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedIp: text("accepted_ip"),
    acceptedUa: text("accepted_ua"),
    createdAt: createdAt(),
  },
  (t) => [index("invoices_customer_idx").on(t.customerId), index("invoices_status_idx").on(t.status, t.dueAt)],
);

// Contratos aceitos pelos clientes contratantes (cópia fiel do texto aceito)
export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id"),
    number: text("number").notNull(), // ex.: GW-2026-000123
    version: text("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(), // texto completo, congelado no momento do aceite
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    acceptedIp: text("accepted_ip"),
    acceptedUa: text("accepted_ua"),
    accessKey: text("access_key").notNull(), // link privado para o cliente baixar/imprimir
    createdAt: createdAt(),
  },
  (t) => [index("contracts_customer_idx").on(t.customerId, t.createdAt)],
);

// Nota fiscal de serviço (NFS-e) ou, enquanto não houver PJ, recibo de pagamento
export const serviceInvoices = pgTable(
  "service_invoices",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id"),
    kind: text("kind").$type<"RECEIPT" | "NFSE">().notNull(), // RECIBO (sem PJ) | NFS-e
    status: text("status").$type<"ISSUED" | "PENDING" | "ERROR">().notNull(),
    number: text("number").notNull(),
    description: text("description").notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    amountMinor: integer("amount_minor").notNull(),
    takerName: text("taker_name").notNull(),
    takerDoc: text("taker_doc"),
    externalId: text("external_id"), // id/chave da NFS-e no provedor
    pdfUrl: text("pdf_url"),
    error: text("error"),
    accessKey: text("access_key").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("service_invoices_customer_idx").on(t.customerId, t.createdAt)],
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
// =============================================================================
// GoInteligence: cupons, carrinhos abandonados, agenda e equipe
// =============================================================================
export const coupons = pgTable(
  "coupons",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // MAIUSCULO
    kind: text("kind").$type<"PERCENT" | "FIXED">().notNull(),
    value: integer("value").notNull(), // % (1-90) ou valor em unidade menor da base
    minSubtotal: integer("min_subtotal").notNull().default(0),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    // Cupom pessoal (recompensa): só vale para este cliente da loja
    shopperId: text("shopper_id"),
    purpose: text("purpose"), // loyalty | cashback | referral | birthday | campaign | null (manual)
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("coupons_tenant_code_uq").on(t.tenantId, t.code)],
);

// =============================================================================
// Crescimento: carteira de clientes da loja e campanhas
// =============================================================================
export const shoppers = pgTable(
  "shoppers",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(), // E.164
    name: text("name").notNull(),
    birthday: text("birthday"), // MM-DD
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    optInAt: timestamp("opt_in_at", { withTimezone: true }),
    refCode: text("ref_code").notNull(),
    referredBy: text("referred_by"),
    stamps: integer("stamps").notNull().default(0),
    lastBirthdayYear: integer("last_birthday_year"),
    lastReviewAskAt: timestamp("last_review_ask_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("shoppers_tenant_phone_uq").on(t.tenantId, t.phone), uniqueIndex("shoppers_tenant_ref_uq").on(t.tenantId, t.refCode)],
);

export const campaigns = pgTable("campaigns", {
  id: id(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  message: text("message").notNull(),
  couponCode: text("coupon_code"),
  recipients: text("recipients").notNull().default("[]"), // JSON [{id,name,phone}]
  sentCount: integer("sent_count").notNull().default(0),
  createdAt: createdAt(),
});

export const carts = pgTable(
  "carts",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone").notNull(), // E.164
    items: text("items").notNull(), // JSON [{productId,name,quantity,unitPricePyg}]
    subtotalPyg: integer("subtotal_pyg").notNull(),
    status: text("status").$type<"OPEN" | "CONTACTED" | "RECOVERED">().notNull().default("OPEN"),
    ownerNotifiedAt: timestamp("owner_notified_at", { withTimezone: true }),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    recoveredOrderId: text("recovered_order_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("carts_tenant_idx").on(t.tenantId, t.updatedAt)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    serviceName: text("service_name").notNull(),
    pricePyg: integer("price_pyg").notNull().default(0),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull(),
    status: text("status").$type<"PENDING" | "CONFIRMED" | "CANCELLED" | "DONE">().notNull().default("PENDING"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("appointments_tenant_idx").on(t.tenantId, t.startsAt)],
);

export const staff = pgTable(
  "staff",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    username: text("username").notNull(), // login (minúsculo)
    passwordHash: text("password_hash").notNull(),
    permissions: text("permissions").notNull().default("[]"), // JSON PanelArea[]
    active: boolean("active").notNull().default(true),
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_tenant_user_uq").on(t.tenantId, t.username)],
);

// =============================================================================
// Segurança: registro de atividades e limites de tentativas
// =============================================================================
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // null = plataforma
    actor: text("actor").notNull(), // "dono", "admin", "equipe:ana", "cliente", "sistema"
    action: text("action").notNull(), // ex: login.fail, order.paid, cash.close
    detail: text("detail"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

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
  contracts: many(contracts),
  serviceInvoices: many(serviceInvoices),
}));
export const contractsRelations = relations(contracts, ({ one }) => ({
  customer: one(customers, { fields: [contracts.customerId], references: [customers.id] }),
}));
export const serviceInvoicesRelations = relations(serviceInvoices, ({ one }) => ({
  customer: one(customers, { fields: [serviceInvoices.customerId], references: [customers.id] }),
}));
export const invoicesRelations = relations(invoices, ({ one }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
}));
export const adminTasksRelations = relations(adminTasks, ({ one }) => ({
  customer: one(customers, { fields: [adminTasks.customerId], references: [customers.id] }),
}));

// =============================================================================
// Administradores da plataforma (além da senha-mestra) e motoboys dos lojistas
// =============================================================================
export const platformAdmins = pgTable(
  "platform_admins",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(), // minúsculo; também usado no login com Google
    passwordHash: text("password_hash"), // null = só entra com Google
    role: text("role").$type<"owner" | "admin">().notNull().default("admin"), // owner pode cadastrar admins
    active: boolean("active").notNull().default(true),
    sessionVersion: integer("session_version").notNull().default(1),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("platform_admins_email_uq").on(t.email)],
);

export const couriers = pgTable(
  "couriers",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(), // E.164
    vehicle: text("vehicle"), // "Moto Honda CG — placa ABC1D23"
    pixKey: text("pix_key"), // para o lojista pagar as entregas
    feePerDelivery: integer("fee_per_delivery").notNull().default(0), // valor combinado por entrega (unidade menor da moeda base)
    lang: text("lang"), // idioma do app do entregador: pt | es | en (null = idioma da loja) — core/courier-i18n.ts
    active: boolean("active").notNull().default(true),
    // App do entregador (/entregador): link de acesso (hash p/ busca + selado p/ reenviar), online e última posição
    accessHash: text("access_hash"),
    accessSealed: text("access_sealed"),
    online: boolean("online").notNull().default(false),
    onlineSince: timestamp("online_since", { withTimezone: true }),
    lastLat: doublePrecision("last_lat"),
    lastLng: doublePrecision("last_lng"),
    lastAccuracy: doublePrecision("last_accuracy"),
    lastHeading: doublePrecision("last_heading"),
    lastSpeed: doublePrecision("last_speed"), // m/s
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("couriers_tenant_phone_uq").on(t.tenantId, t.phone), uniqueIndex("couriers_access_uq").on(t.accessHash)],
);

// Chamados de suporte do lojista para a GoWeb (protocolo + SLA)
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    protocol: text("protocol").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    openedBy: text("opened_by").notNull(), // nome de quem abriu (dono ou funcionário)
    contactEmail: text("contact_email"),
    contactWhatsapp: text("contact_whatsapp"),
    category: text("category").notNull(),
    priority: text("priority").$type<"urgente" | "alta" | "normal" | "baixa">().notNull().default("normal"),
    subject: text("subject").notNull(),
    status: text("status").$type<"OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED">().notNull().default("OPEN"),
    assignedTo: text("assigned_to"),
    firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }).notNull(),
    resolutionDueAt: timestamp("resolution_due_at", { withTimezone: true }).notNull(),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    unreadByCustomer: boolean("unread_by_customer").notNull().default(false),
    unreadByAdmin: boolean("unread_by_admin").notNull().default(true),
    rating: integer("rating"), // 1 a 5, depois de resolvido
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("support_tickets_protocol_uq").on(t.protocol), index("support_tickets_tenant_idx").on(t.tenantId)],
);

export const supportMessages = pgTable("support_messages", {
  id: id(),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  author: text("author").$type<"cliente" | "suporte">().notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  internal: boolean("internal").notNull().default(false), // nota interna da equipe (o cliente não vê)
  createdAt: createdAt(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type Courier = typeof couriers.$inferSelect;
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
export type Coupon = typeof coupons.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ServiceInvoice = typeof serviceInvoices.$inferSelect;
export type Shopper = typeof shoppers.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  tenant: one(tenants, { fields: [supportTickets.tenantId], references: [tenants.id] }),
  messages: many(supportMessages),
}));
export const supportMessagesRelations = relations(supportMessages, ({ one }) => ({
  ticket: one(supportTickets, { fields: [supportMessages.ticketId], references: [supportTickets.id] }),
}));

// ---------------------------------------------------------------- programa de afiliados (só Brasil)
// Turmas da live de boas-vindas (quinzenal). O afiliado se cadastra, entra na fila da próxima turma
// e só é liberado (status ACTIVE) depois da live.
export const affiliateCohorts = pgTable("affiliate_cohorts", {
  id: id(),
  title: text("title").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  liveUrl: text("live_url"), // link da live (liberado para os inscritos)
  notes: text("notes"),
  createdAt: createdAt(),
});

export const affiliates = pgTable(
  "affiliates",
  {
    id: id(),
    code: text("code").notNull(), // usado no link /a/CODE
    name: text("name").notNull(),
    email: text("email").notNull(),
    whatsapp: text("whatsapp").notNull(),
    cpfHash: text("cpf_hash").notNull(), // para evitar cadastro duplicado
    cpfSealed: text("cpf_sealed").notNull(), // CPF criptografado (lib/secrets)
    city: text("city"),
    passwordHash: text("password_hash").notNull(),
    sessionVersion: integer("session_version").notNull().default(1),
    pixKeyType: text("pix_key_type").$type<"cpf" | "email" | "phone" | "random">().notNull(),
    pixKey: text("pix_key").notNull(),
    status: text("status").$type<"PENDING" | "ACTIVE" | "SUSPENDED">().notNull().default("PENDING"),
    cohortId: text("cohort_id").references(() => affiliateCohorts.id, { onDelete: "set null" }),
    referredById: text("referred_by_id"), // afiliado que indicou este afiliado (ganha 3% das vendas dele)
    acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true }).notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    adminNote: text("admin_note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("affiliates_code_uq").on(t.code),
    uniqueIndex("affiliates_email_uq").on(t.email),
    uniqueIndex("affiliates_cpf_uq").on(t.cpfHash),
    index("affiliates_ref_idx").on(t.referredById),
  ],
);

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: id(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    visitor: text("visitor").notNull(), // hash do visitante (conta clique único por dia)
    source: text("source"), // ?origem= (whatsapp, instagram…)
    createdAt: createdAt(),
  },
  (t) => [index("affiliate_clicks_aff_idx").on(t.affiliateId, t.createdAt)],
);

export const affiliateLeads = pgTable(
  "affiliate_leads",
  {
    id: id(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    contactName: text("contact_name").notNull(),
    whatsapp: text("whatsapp").notNull(),
    email: text("email"),
    city: text("city"),
    segment: text("segment"),
    note: text("note"),
    source: text("source").$type<"link" | "manual">().notNull().default("link"),
    status: text("status").$type<"NEW" | "SCHEDULED" | "NOT_SCHEDULED" | "SIGNED" | "WON" | "LOST">().notNull().default("NEW"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    adminNote: text("admin_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("affiliate_leads_aff_idx").on(t.affiliateId, t.status), index("affiliate_leads_wa_idx").on(t.whatsapp)],
);

export const affiliateCommissions = pgTable(
  "affiliate_commissions",
  {
    id: id(),
    affiliateId: text("affiliate_id")
      .notNull()
      .references(() => affiliates.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    level: integer("level").notNull().default(1), // 1 = venda própria · 2 = venda de quem ele indicou
    kind: text("kind").$type<"SETUP" | "ANNUAL">().notNull(),
    tierName: text("tier_name"),
    baseMinor: integer("base_minor").notNull(), // centavos de R$
    pctBp: integer("pct_bp").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    status: text("status").$type<"PENDING" | "PAID" | "CANCELLED">().notNull().default("PENDING"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: text("paid_by"),
    paidRef: text("paid_ref"), // identificador do Pix enviado
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("affiliate_commissions_uq").on(t.invoiceId, t.affiliateId, t.level),
    index("affiliate_commissions_aff_idx").on(t.affiliateId, t.status),
  ],
);

export const affiliateMaterials = pgTable("affiliate_materials", {
  id: id(),
  kind: text("kind").$type<"video" | "live" | "arquivo" | "texto" | "link">().notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  body: text("body"), // texto pronto para copiar (scripts de abordagem)
  liveAt: timestamp("live_at", { withTimezone: true }),
  pinned: boolean("pinned").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export type Affiliate = typeof affiliates.$inferSelect;
export type AffiliateLead = typeof affiliateLeads.$inferSelect;
export type AffiliateCommission = typeof affiliateCommissions.$inferSelect;
export type AffiliateCohort = typeof affiliateCohorts.$inferSelect;
export type AffiliateMaterial = typeof affiliateMaterials.$inferSelect;

export const affiliatesRelations = relations(affiliates, ({ one, many }) => ({
  cohort: one(affiliateCohorts, { fields: [affiliates.cohortId], references: [affiliateCohorts.id] }),
  leads: many(affiliateLeads),
  commissions: many(affiliateCommissions),
}));
export const affiliateCohortsRelations = relations(affiliateCohorts, ({ many }) => ({ affiliates: many(affiliates) }));
export const affiliateLeadsRelations = relations(affiliateLeads, ({ one }) => ({
  affiliate: one(affiliates, { fields: [affiliateLeads.affiliateId], references: [affiliates.id] }),
  customer: one(customers, { fields: [affiliateLeads.customerId], references: [customers.id] }),
}));
export const affiliateCommissionsRelations = relations(affiliateCommissions, ({ one }) => ({
  affiliate: one(affiliates, { fields: [affiliateCommissions.affiliateId], references: [affiliates.id] }),
  customer: one(customers, { fields: [affiliateCommissions.customerId], references: [customers.id] }),
  invoice: one(invoices, { fields: [affiliateCommissions.invoiceId], references: [invoices.id] }),
}));

// ---------------------------------------------------------------- CRM de prospecção (sócios/admins da plataforma)
// actorId = id do platform_admin, ou "platform" para a senha-mestra.
export const crmLeads = pgTable(
  "crm_leads",
  {
    id: id(),
    code: text("code").notNull(), // LEAD-001
    name: text("name").notNull(),
    category: text("category"),
    neighborhood: text("neighborhood"),
    city: text("city"), // "João Pessoa - PB"
    address: text("address"),
    phone: text("phone"), // E.164 (+55…)
    instagram: text("instagram"),
    email: text("email"),
    website: text("website"),
    rating: integer("rating_x10"), // 4.8 → 48
    reviews: integer("reviews"),
    pain: text("pain"),
    pitch: text("pitch"),
    score: text("score").$type<"OURO" | "PRATA" | "BRONZE" | "DESQ">().notNull().default("BRONZE"),
    scoreNotes: text("score_notes"), // motivos do score (JSON)
    linkKind: text("link_kind"), // competitor | ifood | manual | own_site | none
    competitor: text("competitor"),
    status: text("status").$type<"NEW" | "CONTACT" | "DEMO" | "PROPOSAL" | "WON" | "LOST">().notNull().default("NEW"),
    ownerId: text("owner_id"),
    source: text("source").$type<"hunter" | "import" | "manual" | "affiliate" | "site" | "whatsapp" | "instagram">().notNull().default("manual"),
    dedupeKey: text("dedupe_key").notNull(),
    contactAt: timestamp("contact_at", { withTimezone: true }), // 1º contato
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    followUpNotifiedAt: timestamp("follow_up_notified_at", { withTimezone: true }),
    demoAt: timestamp("demo_at", { withTimezone: true }),
    lostReason: text("lost_reason"),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "set null" }),
    affiliateLeadId: text("affiliate_lead_id"),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("crm_leads_dedupe_uq").on(t.dedupeKey),
    uniqueIndex("crm_leads_code_uq").on(t.code),
    index("crm_leads_status_idx").on(t.status),
    index("crm_leads_owner_idx").on(t.ownerId),
    index("crm_leads_follow_idx").on(t.followUpAt),
  ],
);

export const crmActivities = pgTable(
  "crm_activities",
  {
    id: id(),
    leadId: text("lead_id").references(() => crmLeads.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    // contact = contato feito (conta na meta) · note · status · followup · demo · won · lost · system
    kind: text("kind").$type<"contact" | "note" | "status" | "followup" | "demo" | "won" | "lost" | "system" | "implant">().notNull(),
    channel: text("channel").$type<"whatsapp" | "call" | "instagram" | "visit" | "email" | null>(),
    body: text("body"),
    createdAt: createdAt(),
  },
  (t) => [index("crm_act_actor_idx").on(t.actorId, t.createdAt), index("crm_act_lead_idx").on(t.leadId, t.createdAt)],
);

export const crmJourneys = pgTable(
  "crm_journeys",
  {
    id: id(),
    actorId: text("actor_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    pauseStartedAt: timestamp("pause_started_at", { withTimezone: true }),
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    summary: text("summary"), // JSON do resumo ao encerrar
  },
  (t) => [index("crm_journeys_actor_idx").on(t.actorId, t.startedAt)],
);

export const crmPushSubs = pgTable(
  "crm_push_subs",
  {
    id: id(),
    actorId: text("actor_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    device: text("device"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("crm_push_endpoint_uq").on(t.endpoint)],
);

/** Central de avisos do CRM (/crm/avisos) — tudo que vai por push fica aqui, por sócio. O app Android busca daqui a cada 15 min. */
export const crmNotifications = pgTable(
  "crm_notifications",
  {
    id: id(),
    actorId: text("actor_id").notNull(),
    category: text("category"), // core/crm-notify.ts#NotifyCategory
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("crm_notifications_actor_idx").on(t.actorId, t.createdAt)],
);

/** Preferências de notificação de cada sócio (JSON de core/crm-notify.ts#NotifyPrefs). */
export const crmNotifyPrefs = pgTable("crm_notify_prefs", {
  actorId: text("actor_id").primaryKey(),
  prefs: text("prefs").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Acessos ao site oficial e à página de afiliados: 1 linha por visitante por área por dia (core/visits.ts). */
export const siteVisits = pgTable(
  "site_visits",
  {
    id: id(),
    day: text("day").notNull(), // "2026-11-11" (Brasília)
    area: text("area").notNull(), // site | afiliados | link
    visitor: text("visitor").notNull(), // hash de IP + navegador + dia
    path: text("path").notNull(), // primeira página vista
    source: text("source").notNull().default("Direto"),
    device: text("device").notNull().default("celular"),
    country: text("country"),
    views: integer("views").notNull().default(1),
    createdAt: createdAt(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("site_visits_uq").on(t.day, t.area, t.visitor), index("site_visits_day_idx").on(t.day, t.area)],
);

/** Pesquisa da Geovana para montar uma demonstração (Admin → Demonstrações → Montar com a Geovana). */
export const demoDrafts = pgTable("demo_drafts", {
  id: id(),
  input: text("input").notNull(), // JSON core/store-research.ts#ResearchInput
  profile: text("profile"), // JSON core/store-research.ts#StoreProfile (null = falhou)
  error: text("error"),
  leadId: text("lead_id"), // lead do CRM de onde veio (recebe a nota com o link da demo)
  createdBy: text("created_by").notNull(),
  tenantId: text("tenant_id"), // demo criada a partir deste rascunho
  createdAt: createdAt(),
});

export const crmHuntRuns = pgTable("crm_hunt_runs", {
  id: id(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  trigger: text("trigger").notNull().default("cron"), // cron | manual
  query: text("query"),
  found: integer("found").notNull().default(0),
  added: integer("added").notNull().default(0),
  error: text("error"),
});

export type CrmLead = typeof crmLeads.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
export type CrmJourney = typeof crmJourneys.$inferSelect;

export const crmLeadsRelations = relations(crmLeads, ({ many, one }) => ({
  activities: many(crmActivities),
  customer: one(customers, { fields: [crmLeads.customerId], references: [customers.id] }),
}));
export const crmActivitiesRelations = relations(crmActivities, ({ one }) => ({ lead: one(crmLeads, { fields: [crmActivities.leadId], references: [crmLeads.id] }) }));

// Billing híbrido (Asaas): ciclo de 30 dias em que o split das vendas abate a mensalidade;
// no fim, cobra só o saldo residual (cartão salvo ou Pix); 7 dias sem pagar = suspensão.
export const billingCycles = pgTable(
  "billing_cycles",
  {
    id: id(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    graceEndAt: timestamp("grace_end_at", { withTimezone: true }).notNull(),
    targetMinor: integer("target_minor").notNull(), // mensalidade do ciclo em centavos
    amortizedMinor: integer("amortized_minor").notNull().default(0), // split confirmado nas vendas
    residualMinor: integer("residual_minor"), // calculado no fechamento
    invoiceId: text("invoice_id"), // fatura do saldo residual (tabela invoices)
    residualPaymentId: text("residual_payment_id"), // cobrança no Asaas
    status: text("status").$type<"ACCUMULATING" | "PAID_BY_SPLIT" | "AWAITING_RESIDUAL" | "PAID_RESIDUAL" | "OVERDUE_SUSPENDED">().notNull().default("ACCUMULATING"),
    createdAt: createdAt(),
  },
  (t) => [index("billing_cycles_customer_idx").on(t.customerId, t.startAt), index("billing_cycles_status_idx").on(t.status)],
);
export type BillingCycle = typeof billingCycles.$inferSelect;

// Eventos de webhook do Asaas já processados (idempotência)
export const asaasEvents = pgTable("asaas_events", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  createdAt: createdAt(),
});

// Geovana: conversas do WhatsApp da loja (uma por número) e mensagens recentes (contexto da IA)
export const waChats = pgTable(
  "wa_chats",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(), // E.164
    name: text("name"),
    pausedUntil: timestamp("paused_until", { withTimezone: true }), // humano assumiu: IA quieta até
    needsHuman: boolean("needs_human").notNull().default(false),
    closedNoticeAt: timestamp("closed_notice_at", { withTimezone: true }), // último aviso "estamos fechados"
    optOut: boolean("opt_out").notNull().default(false), // cliente pediu para não receber mensagens (avisos param; escrever de novo libera)
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wa_chats_tenant_phone_uq").on(t.tenantId, t.phone), index("wa_chats_tenant_last_idx").on(t.tenantId, t.lastAt)],
);

export const waMessages = pgTable(
  "wa_messages",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => waChats.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "ai" | "staff" | "system">().notNull(),
    text: text("text").notNull(),
    externalId: text("external_id"), // id da mensagem no WhatsApp (evita duplicar)
    createdAt: createdAt(),
  },
  (t) => [index("wa_messages_chat_idx").on(t.chatId, t.createdAt), uniqueIndex("wa_messages_ext_uq").on(t.tenantId, t.externalId)],
);

// Apps de delivery pelo padrão Open Delivery (Abrasel): 99Food, Keeta… — um canal por loja e app.
export const odChannels = pgTable(
  "od_channels",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // core/opendelivery.ts#OD_PLATFORMS
    merchantId: text("merchant_id").notNull(), // id da loja no padrão (gerado pela GoWeb, igual em todos os apps da loja)
    orderingAppMerchantId: text("ordering_app_merchant_id"), // id da loja dentro do app (se o app informar)
    baseUrl: text("base_url").notNull(), // API do app
    clientId: text("client_id").notNull(),
    clientSecretSealed: text("client_secret_sealed").notNull(),
    appId: text("app_id"), // X-App-Id esperado no webhook (opcional)
    hookToken: text("hook_token").notNull().unique(), // parte da URL pública da loja (cardápio + webhook)
    apiKeySealed: text("api_key_sealed").notNull(), // X-API-KEY que o app usa no GET /merchant
    signRequests: boolean("sign_requests").notNull().default(false), // Keeta: X-App-Signature em toda chamada
    autoConfirm: boolean("auto_confirm").notNull().default(true), // aceita o pedido no app assim que chega
    enabled: boolean("enabled").notNull().default(true),
    merchantInfo: text("merchant_info").notNull().default("{}"), // JSON OdMerchantInfo + endereço (CNPJ, razão social, categorias…)
    tokenSealed: text("token_sealed"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }), // cadastro enviado ao app (PUT merchantOnboarding)
    lastPollAt: timestamp("last_poll_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastMenuAt: timestamp("last_menu_at", { withTimezone: true }), // última vez que o app leu o cardápio
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("od_channels_tenant_platform_uq").on(t.tenantId, t.platform)],
);

// Eventos do Open Delivery já processados (o mesmo evento pode chegar por webhook e por polling)
export const odEvents = pgTable("od_events", {
  id: text("id").primaryKey(), // channelId:eventId
  channelId: text("channel_id").notNull(),
  eventType: text("event_type").notNull(),
  orderId: text("order_id"),
  createdAt: createdAt(),
});
export type OdChannel = typeof odChannels.$inferSelect;

// Geovana da GoWeb: conversas no WhatsApp da própria GoWeb (vendas, suporte, afiliados)
export const gwChats = pgTable("gw_chats", {
  id: id(),
  phone: text("phone").notNull().unique(), // E.164
  name: text("name"), // nome no WhatsApp
  leadId: text("lead_id"), // crm_leads.id
  tenantId: text("tenant_id"), // é lojista cliente
  affiliateId: text("affiliate_id"), // é afiliado
  flyer: text("flyer"), // origem (panfleto) — core/goweb-bot.ts#FLYERS
  pausedUntil: timestamp("paused_until", { withTimezone: true }), // sócio assumiu
  needsHuman: boolean("needs_human").notNull().default(false),
  heat: integer("heat").notNull().default(0), // 0–100 (leads esquentando)
  hotNotifiedAt: timestamp("hot_notified_at", { withTimezone: true }),
  lastUserAt: timestamp("last_user_at", { withTimezone: true }),
  lastBotAt: timestamp("last_bot_at", { withTimezone: true }),
  followUpsSent: integer("follow_ups_sent").notNull().default(0),
  optOut: boolean("opt_out").notNull().default(false), // pediu para não receber mensagens
  createdAt: createdAt(),
});
// ---------------------------------------------------------------- proteção da Geovana (core/wa-guard.ts + services/wa-guard.ts)
/** Registro de tudo que passa pela proteção: mensagens recebidas/enviadas/com falha/seguradas e chamadas à IA.
 *  Os limites contam daqui (janelas móveis). channel = "goweb" | "store:<tenantId>". Limpo após 40 dias. */
export const geovanaLog = pgTable(
  "geovana_log",
  {
    id: id(),
    channel: text("channel").notNull(),
    tenantId: text("tenant_id"),
    type: text("type").$type<"in" | "out" | "fail" | "blocked" | "queued" | "ai">().notNull(),
    kind: text("kind"), // reply | staff | support | notice | internal | proactive
    contact: text("contact"), // E.164
    textHash: text("text_hash"),
    reason: text("reason"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("geovana_log_ch_idx").on(t.channel, t.type, t.createdAt), index("geovana_log_contact_idx").on(t.contact, t.createdAt), index("geovana_log_type_idx").on(t.type, t.createdAt)],
);

/** Fila de envio: o que não pôde sair na hora (limite, horário, número pausado) ou falhou de forma passageira. */
export const waOutbox = pgTable(
  "wa_outbox",
  {
    id: id(),
    channel: text("channel").notNull(),
    tenantId: text("tenant_id"),
    to: text("to").notNull(),
    text: text("text").notNull(),
    kind: text("kind").notNull(),
    priority: integer("priority").notNull().default(1), // 0 = resposta em conversa, 1 = aviso, 2 = iniciada pela empresa
    dedupeKey: text("dedupe_key"),
    status: text("status").$type<"pending" | "sending" | "sent" | "failed" | "cancelled">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("wa_outbox_dedupe_uq").on(t.dedupeKey), index("wa_outbox_due_idx").on(t.status, t.nextAt)],
);

/** Estado do circuit breaker / pausa por número ("goweb", "store:<id>") e geral ("*", com a emergência). JSON de BreakerState. */
export const waGuardState = pgTable("wa_guard_state", {
  channel: text("channel").primaryKey(),
  state: text("state").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gwMessages = pgTable(
  "gw_messages",
  {
    id: id(),
    chatId: text("chat_id").notNull().references(() => gwChats.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "ai" | "staff" | "system">().notNull(),
    text: text("text").notNull(),
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("gw_messages_ext_uq").on(t.externalId), index("gw_messages_chat_idx").on(t.chatId, t.createdAt)],
);
export type GwChat = typeof gwChats.$inferSelect;

// ---------------------------------------------------------------- Central de Homologação (core/homolog.ts + services/homolog.ts)
/** Histórico de decisões: quem aprovou/reprovou/reverteu qual PR, quando e por quê. */
export const homologEvents = pgTable(
  "homolog_events",
  {
    id: id(),
    prNumber: integer("pr_number").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    action: text("action").$type<"approved" | "rejected" | "revert_opened" | "merge_failed">().notNull(),
    sha: text("sha"),
    by: text("by").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("homolog_events_pr_idx").on(t.prNumber, t.createdAt)],
);

// Lembretes automáticos já enviados (passo a passo, loja parada, cobrança gentil…) — evita repetir
export const nudgeLog = pgTable("nudge_log", {
  key: text("key").primaryKey(), // ex.: setup:<tenantId>:<dia> · idle:<tenantId>:<semana> · inv:<invoiceId>:<etapa>
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- Instagram (core/instagram.ts + services/instagram.ts)
/** Conta do Instagram conectada pelo login oficial da Meta: a da GoWeb (tenantId null) ou de uma loja GoInteligence. */
export const igAccounts = pgTable(
  "ig_accounts",
  {
    id: id(),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // null = conta institucional da GoWeb
    igUserId: text("ig_user_id").notNull(), // = entry.id dos webhooks
    username: text("username"),
    tokenSealed: text("token_sealed").notNull(), // token de 60 dias, criptografado (lib/secrets)
    tokenIssuedAt: timestamp("token_issued_at", { withTimezone: true }),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: text("status").$type<"active" | "paused" | "error">().notNull().default("active"),
    aiEnabled: boolean("ai_enabled").notNull().default(true), // Geovana responde (desligado = só caixa de entrada)
    canPublish: boolean("can_publish").notNull().default(false), // login deu instagram_business_content_publish (Assessoria: autonomia)
    lastError: text("last_error"),
    connectedBy: text("connected_by"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ig_accounts_user_uq").on(t.igUserId), uniqueIndex("ig_accounts_tenant_uq").on(t.tenantId)],
);

export const igChats = pgTable(
  "ig_chats",
  {
    id: id(),
    accountId: text("account_id").notNull().references(() => igAccounts.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id"), // null = GoWeb
    igsid: text("igsid").notNull(), // id do cliente no Instagram (por conta)
    name: text("name"),
    username: text("username"),
    leadId: text("lead_id"), // GoWeb: crm_leads.id
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }), // janela de 24 h
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    needsHuman: boolean("needs_human").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ig_chats_account_igsid_uq").on(t.accountId, t.igsid), index("ig_chats_tenant_idx").on(t.tenantId, t.lastAt)],
);

export const igMessages = pgTable(
  "ig_messages",
  {
    id: id(),
    chatId: text("chat_id").notNull().references(() => igChats.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "ai" | "staff" | "system">().notNull(),
    text: text("text").notNull(),
    externalId: text("external_id"), // mid da Meta (idempotência)
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ig_messages_ext_uq").on(t.externalId), index("ig_messages_chat_idx").on(t.chatId, t.createdAt)],
);
export type IgAccount = typeof igAccounts.$inferSelect;
export type IgChat = typeof igChats.$inferSelect;

// =============================================================================
// Assessoria GoWeb (complemento de crescimento) — core/advisory.ts + services/advisory.ts
// =============================================================================
export const advisoryPlans = pgTable(
  "advisory_plans",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // simulated = só a prévia salva · requested = pediu para contratar · active · paused · ended · cancelled
    status: text("status").$type<"simulated" | "requested" | "active" | "paused" | "ended" | "cancelled">().notNull().default("simulated"),
    currency: text("currency").notNull(),
    objectives: text("objectives").notNull().default("[]"), // JSON Objective[]
    selfReport: text("self_report").notNull().default("{}"), // JSON SelfReport
    monthlyTotal: integer("monthly_total").notNull(), // investimento total por mês (unidade menor da moeda base)
    months: integer("months").notNull(),
    fee: integer("fee").notNull(), // assessoria por mês (com desconto de prazo)
    ads: integer("ads").notNull(), // verba sugerida de anúncios por mês (paga direto à Meta/Google)
    diagnosis: text("diagnosis").notNull().default("{}"), // JSON Diagnosis (no momento da simulação)
    baseline: text("baseline"), // JSON Period dos 90 dias antes da ativação ("antes")
    plan: text("plan").notNull().default("[]"), // JSON MonthPlan[]
    autonomy: text("autonomy").$type<"off" | "approved" | "all">().notNull().default("off"), // publicação automática
    calendarToken: text("calendar_token"), // link .ics privado
    leadId: text("lead_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    activatedBy: text("activated_by"),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("advisory_plans_tenant_idx").on(t.tenantId, t.createdAt), index("advisory_plans_status_idx").on(t.status), uniqueIndex("advisory_plans_cal_uq").on(t.calendarToken)],
);

export const advisoryPosts = pgTable(
  "advisory_posts",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => advisoryPlans.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    theme: text("theme").notNull(),
    productId: text("product_id").references(() => products.id, { onDelete: "set null" }),
    imageUrl: text("image_url"), // foto escolhida (catálogo ou enviada)
    jpegUrl: text("jpeg_url"), // cópia JPEG para a Meta (gerada no navegador na aprovação)
    caption: text("caption").notNull().default(""),
    code: text("code").notNull(), // ?origem=post-…
    status: text("status").$type<"draft" | "approved" | "publishing" | "published" | "failed" | "done_manual" | "skipped">().notNull().default("draft"),
    igMediaId: text("ig_media_id"),
    error: text("error"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("advisory_posts_tenant_idx").on(t.tenantId, t.scheduledAt), index("advisory_posts_due_idx").on(t.status, t.scheduledAt)],
);

export const advisoryTasks = pgTable(
  "advisory_tasks",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => advisoryPlans.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"ad" | "action">().notNull(),
    action: text("action"), // Action (core/advisory.ts) para kind = action
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    data: text("data").notNull().default("{}"), // JSON AdTask + textos
    code: text("code"), // ?origem=anuncio-…
    status: text("status").$type<"todo" | "done" | "skipped">().notNull().default("todo"),
    spent: integer("spent"), // quanto o lojista gastou no anúncio (informado)
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("advisory_tasks_tenant_idx").on(t.tenantId, t.dueAt)],
);

export type AdvisoryPlan = typeof advisoryPlans.$inferSelect;
export type AdvisoryPost = typeof advisoryPosts.$inferSelect;
export type AdvisoryTask = typeof advisoryTasks.$inferSelect;

// =============================================================================
// CRM — agenda, bloco de notas e lembretes dos sócios (core/crm-planner.ts + services/crm-planner.ts)
// =============================================================================
export const crmEvents = pgTable(
  "crm_events",
  {
    id: id(),
    ownerId: text("owner_id").notNull(), // ator do CRM (id do admin ou "platform")
    shared: boolean("shared").notNull().default(false), // aparece para todos os sócios
    kind: text("kind").$type<"meeting" | "demo" | "call" | "visit" | "task" | "personal">().notNull().default("meeting"),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(30),
    location: text("location"), // endereço ou link da chamada
    notes: text("notes"),
    leadId: text("lead_id").references(() => crmLeads.id, { onDelete: "set null" }),
    remindMin: integer("remind_min"), // avisar X min antes (null = sem aviso)
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_events_owner_idx").on(t.ownerId, t.startsAt), index("crm_events_start_idx").on(t.startsAt)],
);

export const crmNotes = pgTable(
  "crm_notes",
  {
    id: id(),
    ownerId: text("owner_id").notNull(),
    shared: boolean("shared").notNull().default(false),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""), // texto livre; linhas "- [ ]" / "- [x]" viram checklist
    color: text("color").notNull().default("ivory"),
    pinned: boolean("pinned").notNull().default(false),
    leadId: text("lead_id").references(() => crmLeads.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("crm_notes_owner_idx").on(t.ownerId, t.updatedAt)],
);

export const crmReminders = pgTable(
  "crm_reminders",
  {
    id: id(),
    ownerId: text("owner_id").notNull(),
    text: text("text").notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    repeat: text("repeat").$type<"none" | "daily" | "weekdays" | "weekly" | "monthly">().notNull().default("none"),
    leadId: text("lead_id").references(() => crmLeads.id, { onDelete: "set null" }),
    firedAt: timestamp("fired_at", { withTimezone: true }), // último aviso disparado
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("crm_reminders_due_idx").on(t.doneAt, t.remindAt), index("crm_reminders_owner_idx").on(t.ownerId, t.remindAt)],
);

export type CrmEvent = typeof crmEvents.$inferSelect;
export type CrmNote = typeof crmNotes.$inferSelect;
export type CrmReminder = typeof crmReminders.$inferSelect;
