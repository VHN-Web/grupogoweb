// Tipos de domínio compartilhados. Fonte única da verdade para os valores válidos
// das colunas de texto do banco (ver src/db/schema.ts).

export const CURRENCIES = ["PYG", "USD", "BRL"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const PAYMENT_METHODS = ["CASH", "CARD", "PIX", "TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_TYPES = ["DINE_IN", "PICKUP", "DELIVERY"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const FISCAL_DIRECTIONS = ["ISSUED", "RECEIVED"] as const;
export type FiscalDirection = (typeof FISCAL_DIRECTIONS)[number];

export const FISCAL_STATUSES = ["REGISTERED", "PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type FiscalStatus = (typeof FISCAL_STATUSES)[number];

export const STOCK_REASONS = ["ORDER", "ORDER_CANCEL", "ADJUSTMENT", "PURCHASE"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

// ---- Plataforma (cobrança dos seus clientes) ----
export const BILLING_INTERVALS = ["MONTHLY", "YEARLY"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const CUSTOMER_STATUSES = [
  "AWAITING_SETUP_PAYMENT", // aguardando pagamento da implantação
  "IMPLEMENTING", // pago, sistema criado, você está configurando
  "ACTIVE", // entregue e em dia
  "PAST_DUE", // mensalidade vencida (dentro da tolerância)
  "SUSPENDED", // suspenso por inadimplência
  "CANCELLED",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const INVOICE_KINDS = ["SETUP", "SUBSCRIPTION"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = ["OPEN", "PAID", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PLATFORM_LABELS = {
  interval: { MONTHLY: "Mensal", YEARLY: "Anual" },
  customerStatus: {
    AWAITING_SETUP_PAYMENT: "Aguardando pagamento",
    IMPLEMENTING: "Em implantação",
    ACTIVE: "Ativo",
    PAST_DUE: "Em atraso",
    SUSPENDED: "Suspenso",
    CANCELLED: "Cancelado",
  },
  invoiceKind: { SETUP: "Implantação", SUBSCRIPTION: "Assinatura" },
  invoiceStatus: { OPEN: "Em aberto", PAID: "Paga", CANCELLED: "Cancelada" },
} as const;

// Rótulos em espanhol (mercado PY). Centralizados para facilitar i18n depois.
export const LABELS = {
  paymentMethod: { CASH: "Efectivo", CARD: "Tarjeta", PIX: "Pix", TRANSFER: "Transferencia" },
  paymentStatus: { PENDING: "Pendiente", PAID: "Pagado", FAILED: "Fallido", REFUNDED: "Reembolsado" },
  orderType: { DINE_IN: "En mesa", PICKUP: "Retiro en local", DELIVERY: "Delivery" },
  orderStatus: {
    RECEIVED: "Recibido",
    PREPARING: "En preparación",
    READY: "Listo",
    OUT_FOR_DELIVERY: "En camino",
    COMPLETED: "Entregado",
    CANCELLED: "Cancelado",
  },
  currency: { PYG: "Guaraníes (Gs.)", USD: "Dólares (US$)", BRL: "Reales (R$)" },
} as const;
