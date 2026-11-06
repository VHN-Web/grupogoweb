// Meios "manuais": o pedido nasce PENDING e o estabelecimento confirma no painel/caixa.
import type { PaymentProvider } from "./PaymentProvider";

export const cashProvider: PaymentProvider = {
  id: "cash",
  label: "Efectivo (al recibir / en caja)",
  labelPt: "Dinheiro (na entrega / no caixa)",
  methods: ["CASH"],
  currencies: ["PYG", "USD", "BRL"],
  online: false,
  available: true,
  async createPayment(ctx) {
    return {
      status: "PENDING",
      instructions: ctx.locale === "pt" ? "Você paga em dinheiro na entrega ou no caixa." : "Pagás en efectivo al recibir tu pedido o en caja.",
    };
  },
};

export const posProvider: PaymentProvider = {
  id: "pos",
  label: "Tarjeta (POS en el local / al recibir)",
  labelPt: "Cartão na maquininha (no local / na entrega)",
  methods: ["CARD"],
  currencies: ["PYG", "USD", "BRL"],
  online: false,
  available: true,
  async createPayment(ctx) {
    return {
      status: "PENDING",
      instructions: ctx.locale === "pt" ? "Você paga com cartão na maquininha, na entrega ou no caixa." : "Pagás con tarjeta en el POS al recibir o en caja.",
    };
  },
};

export const pixManualProvider: PaymentProvider = {
  id: "pix_manual",
  label: "Pix (clave del local)",
  labelPt: "Pix manual (chave do estabelecimento)",
  methods: ["PIX"],
  currencies: ["BRL"],
  online: false,
  available: true,
  async createPayment(ctx) {
    const key = ctx.credentials.pixKey;
    return {
      status: "PENDING",
      instructions:
        ctx.locale === "pt"
          ? key
            ? `Faça o Pix para a chave: ${key}. Mostre o comprovante ao atendente.`
            : "Peça a chave Pix ao atendente."
          : key
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
  labelPt: "Transferência bancária",
  methods: ["TRANSFER"],
  currencies: ["PYG", "BRL"],
  online: false,
  available: true,
  async createPayment(ctx) {
    return {
      status: "PENDING",
      instructions:
        ctx.credentials.bankInfo || (ctx.locale === "pt" ? "Peça os dados para transferência ao atendente." : "Solicitá los datos de transferencia al personal."),
    };
  },
};
