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

// Rótulos por idioma. Use getLabels(locale).
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

export const LABELS_PT = {
  paymentMethod: { CASH: "Dinheiro", CARD: "Cartão", PIX: "Pix", TRANSFER: "Transferência" },
  paymentStatus: { PENDING: "Pendente", PAID: "Pago", FAILED: "Recusado", REFUNDED: "Reembolsado" },
  orderType: { DINE_IN: "Na mesa", PICKUP: "Retirada no local", DELIVERY: "Delivery" },
  orderStatus: {
    RECEIVED: "Recebido",
    PREPARING: "Em preparo",
    READY: "Pronto",
    OUT_FOR_DELIVERY: "Saiu para entrega",
    COMPLETED: "Entregue",
    CANCELLED: "Cancelado",
  },
  currency: { PYG: "Guaranis (Gs.)", USD: "Dólares (US$)", BRL: "Reais (R$)" },
} as const;

export function getLabels(locale: "es" | "pt" | string | null | undefined): typeof LABELS {
  return (locale === "pt" ? LABELS_PT : LABELS) as typeof LABELS;
}

// ---- Painel: áreas e permissões da equipe ----
export const PANEL_AREAS = ["orders", "cash", "products", "fiscal", "tables", "agenda", "marketing", "customers", "couriers", "appearance", "settings", "team"] as const;
export type PanelArea = (typeof PANEL_AREAS)[number];
export const PANEL_AREA_LABELS: Record<PanelArea, { es: string; pt: string }> = {
  orders: { es: "Pedidos", pt: "Pedidos" },
  cash: { es: "Caja", pt: "Caixa" },
  products: { es: "Productos y stock", pt: "Produtos e estoque" },
  fiscal: { es: "Facturas", pt: "Notas fiscais" },
  tables: { es: "Mesas y QR", pt: "Mesas e QR" },
  agenda: { es: "Agenda", pt: "Agenda" },
  marketing: { es: "Marketing (cupones, ofertas, carritos)", pt: "Marketing (cupons, ofertas, carrinhos)" },
  customers: { es: "Clientes y divulgación", pt: "Clientes e divulgação" },
  couriers: { es: "Repartidores", pt: "Motoboys" },
  appearance: { es: "Apariencia", pt: "Aparência" },
  settings: { es: "Configuración", pt: "Configurações" },
  team: { es: "Equipo", pt: "Equipe" },
};
