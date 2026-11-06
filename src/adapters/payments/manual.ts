// Meios "manuais": o pedido nasce PENDING e o estabelecimento confirma no painel/caixa.
import type { PaymentProvider } from "./PaymentProvider";

export const cashProvider: PaymentProvider = {
  id: "cash",
  label: "Efectivo (al recibir / en caja)",
  methods: ["CASH"],
  currencies: ["PYG", "USD", "BRL"],
  online: false,
  available: true,
  async createPayment() {
    return { status: "PENDING", instructions: "Pagás en efectivo al recibir tu pedido o en caja." };
  },
};

export const posProvider: PaymentProvider = {
  id: "pos",
  label: "Tarjeta (POS en el local / al recibir)",
  methods: ["CARD"],
  currencies: ["PYG", "USD"],
  online: false,
  available: true,
  async createPayment() {
    return { status: "PENDING", instructions: "Pagás con tarjeta en el POS al recibir o en caja." };
  },
};

export const pixManualProvider: PaymentProvider = {
  id: "pix_manual",
  label: "Pix (chave do estabelecimento)",
  methods: ["PIX"],
  currencies: ["BRL"],
  online: false,
  available: true,
  async createPayment(ctx) {
    const key = ctx.credentials.pixKey;
    return {
      status: "PENDING",
      instructions: key
        ? `Enviá el Pix a la clave: ${key}. Mostrá el comprobante al personal.`
        : "Solicitá la clave Pix al personal.",
    };
    // TODO(humano): Pix automático com QR dinâmico + webhook exige PSP brasileiro
    // (ex: Efí/Gerencianet, Mercado Pago BR, Asaas). Criar adapter "pix_psp".
  },
};

export const transferManualProvider: PaymentProvider = {
  id: "transfer_manual",
  label: "Transferencia bancaria",
  methods: ["TRANSFER"],
  currencies: ["PYG"],
  online: false,
  available: true,
  async createPayment(ctx) {
    return {
      status: "PENDING",
      instructions: ctx.credentials.bankInfo || "Solicitá los datos de transferencia al personal.",
    };
  },
};
