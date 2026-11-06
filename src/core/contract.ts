// Modelo do contrato da GoWeb com o cliente contratante. Função pura (sem I/O): o texto
// é gerado no aceite e guardado congelado na tabela `contracts`.
//
// Formato do corpo: linhas simples; "## " = título de cláusula; "**...**" = destaque
// (CDC art. 54 §4º: cláusulas que limitam direitos devem vir em destaque).
//
// ⚠️ Modelo-base: recomenda-se a revisão por um advogado antes do uso em escala.

import { formatMoney } from "./money";
import type { BillingInterval, Currency } from "./types";

export const CONTRACT_VERSION = "2026.11";

export type ContractData = {
  number: string;
  locale: "es" | "pt";
  contractor: {
    brand: string; // "GoWeb"
    legalName?: string | null;
    doc?: string | null; // CNPJ ou CPF
    address?: string | null;
    city?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  };
  client: {
    businessName: string;
    contactName: string;
    doc?: string | null;
    email: string;
    whatsapp?: string | null;
  };
  plan: {
    name: string;
    interval: BillingInterval;
    features: string[];
    intelligence: boolean;
  };
  currency: Currency;
  setupMinor: number; // taxa de implantação (sem domínio)
  domainMinor: number; // domínio do 1º ano (0 = não contratado ou incluso)
  domain?: { wanted: boolean; name?: string | null; included: boolean };
  recurringMinor: number; // mensalidade ou anuidade
  graceDays: number;
  implementationDays: number;
  retentionMonths: number;
  acceptedAt: Date;
  acceptedIp?: string | null;
};

export type ContractDoc = { title: string; version: string; body: string };

export function buildContract(d: ContractData): ContractDoc {
  return d.locale === "pt" ? buildPt(d) : buildEs(d);
}

const dateBR = (x: Date) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(x);
const dateES = (x: Date) => new Intl.DateTimeFormat("es-PY", { dateStyle: "long", timeStyle: "short", timeZone: "America/Asuncion" }).format(x);

function party(lines: (string | null | undefined | false)[]) {
  return lines.filter(Boolean).join(" · ");
}

// =============================================================================
// Brasil — Código de Defesa do Consumidor e legislação correlata
// =============================================================================
function buildPt(d: ContractData): ContractDoc {
  const m = (v: number) => formatMoney(v, d.currency);
  const per = d.plan.interval === "YEARLY" ? "anuidade" : "mensalidade";
  const perAdj = d.plan.interval === "YEARLY" ? "anual" : "mensal";
  const c = d.contractor;
  const contractorName = c.legalName || c.brand;
  const L: string[] = [];
  const h = (t: string) => L.push("", `## ${t}`);
  const p = (...t: string[]) => L.push(...t);

  p(
    `Contrato nº ${d.number} · versão ${CONTRACT_VERSION}`,
    "",
    `CONTRATADA: ${party([contractorName, c.legalName && c.legalName !== c.brand ? `nome comercial ${c.brand}` : null, c.doc ? `CPF/CNPJ ${c.doc}` : null, c.address, c.email ? `e-mail ${c.email}` : null, c.whatsapp ? `WhatsApp ${c.whatsapp}` : null])}.`,
    `CONTRATANTE: ${party([d.client.businessName, `representado(a) por ${d.client.contactName}`, d.client.doc ? `CPF/CNPJ ${d.client.doc}` : null, `e-mail ${d.client.email}`, d.client.whatsapp ? `WhatsApp ${d.client.whatsapp}` : null])}.`,
    "",
    "As partes acima celebram o presente contrato, que se rege pelas cláusulas abaixo e pela legislação brasileira aplicável.",
  );

  h("1. Objeto");
  p(
    `1.1. Licença de uso, não exclusiva e intransferível, do sistema ${c.brand}, na modalidade software como serviço (SaaS), acessado pela internet, no plano ${d.plan.name} (${perAdj}).`,
    "1.2. Serviço de implantação: configuração inicial do site do CONTRATANTE, cadastro do cardápio/catálogo a partir das informações enviadas por ele, aplicação da identidade visual (logo e cores), criação das mesas com QR Code, configuração das formas de pagamento e orientação de uso do painel.",
    "1.3. Recursos incluídos no plano:",
    ...(d.plan.features.length ? d.plan.features.map((f) => `• ${f}`) : ["• Conforme a descrição do plano no site no momento da contratação."]),
    ...(d.plan.intelligence ? ["• Recursos GoInteligence (sugestões inteligentes, cupons, recuperação de carrinho, ofertas relâmpago, agenda, equipe com permissões e relatório de caixa)."] : []),
    ...(d.domain?.wanted ? [`• Domínio próprio${d.domain.name ? ` (${d.domain.name})` : ""}${d.domain.included ? ", incluso no plano" : ", 1º ano cobrado junto à implantação"}, sujeito à disponibilidade no registrador.`] : []),
    "1.4. Não estão incluídos: produção de fotos ou textos, equipamentos (computadores, impressoras), tarifas cobradas por gateways de pagamento (ex.: Mercado Pago) e a emissão de documentos fiscais das vendas do CONTRATANTE.",
  );

  h("2. Prazo de implantação");
  p(
    `2.1. A implantação será concluída em até ${d.implementationDays} dias úteis contados da confirmação do pagamento da taxa de implantação e do envio, pelo CONTRATANTE, das informações necessárias (cardápio, preços, logo etc.).`,
    "2.2. Concluída a implantação, o sistema é liberado ao CONTRATANTE (\"entrega\"), que recebe os dados de acesso ao painel.",
  );

  h("3. Preço e forma de pagamento");
  p(
    ...[
      `Taxa de implantação: ${m(d.setupMinor)}, em pagamento único e antecipado.`,
      ...(d.domainMinor > 0 ? [`Domínio próprio (1º ano): ${m(d.domainMinor)}, cobrado junto com a implantação; renovação anual pelo valor vigente, com aviso prévio.`] : []),
      `${per[0].toUpperCase() + per.slice(1)}: ${m(d.recurringMinor)}, cobrada a partir da data de entrega do sistema e renovada automaticamente a cada período.`,
      "As faturas são enviadas por e-mail (e WhatsApp, se autorizado) com link de pagamento.",
      `Em caso de atraso, incidirão multa de 2% (art. 52, §1º, do CDC) e juros de 1% ao mês. Após ${d.graceDays} dias de atraso, o site público do CONTRATANTE poderá ser suspenso até a regularização, sem perda dos dados; o acesso volta automaticamente com o pagamento.`,
      "Os valores poderão ser reajustados uma vez a cada 12 meses pelo IPCA (ou índice que o substitua), com aviso prévio mínimo de 30 dias.",
    ].map((t, i) => `3.${i + 1}. ${t}`),
  );

  h("4. Vigência e cancelamento");
  p(
    "4.1. O contrato vigora por prazo indeterminado, a partir do aceite eletrônico.",
    "4.2. **Não há fidelidade nem multa por cancelamento.** O CONTRATANTE pode cancelar a qualquer momento, pelo e-mail ou WhatsApp de suporte; o acesso permanece até o fim do período já pago e nenhuma nova cobrança será emitida.",
    "4.3. A CONTRATADA pode encerrar o contrato com aviso prévio de 30 dias, ou imediatamente em caso de uso ilícito do sistema, devolvendo proporcionalmente valores de períodos pagos e não utilizados.",
  );

  h("5. Direito de arrependimento");
  p(
    "5.1. Por se tratar de contratação feita pela internet, o CONTRATANTE pode desistir do contrato no prazo de 7 (sete) dias corridos contados do aceite ou do pagamento, o que ocorrer por último (art. 49 do CDC e art. 5º do Decreto nº 7.962/2013), pelos mesmos canais da contratação.",
    `5.2. Exercido o arrependimento, **nenhuma ${per} será cobrada** e qualquer ${per} eventualmente já paga será devolvida integralmente, pelo mesmo meio de pagamento.`,
    "5.3. **O CONTRATANTE declara estar ciente, de forma clara e destacada, de que a implantação é um serviço personalizado, iniciado imediatamente após o pagamento por sua solicitação expressa, com alocação de equipe e custos de criação e configuração. Por isso, o valor da taxa de implantação não será reembolsado em caso de arrependimento ou cancelamento, por corresponder a serviço já prestado ou em execução.**",
    "5.4. Se, no momento do pedido de arrependimento, a implantação comprovadamente ainda não tiver sido iniciada, a taxa de implantação também será devolvida.",
  );

  h("6. Obrigações da CONTRATADA");
  p(
    "6.1. Manter o sistema disponível, com meta de 99% de disponibilidade mensal, excetuadas manutenções programadas (avisadas com antecedência) e falhas de terceiros (provedores de internet, hospedagem, gateways).",
    "6.2. Prestar suporte por WhatsApp e e-mail em horário comercial, corrigir falhas e manter cópias de segurança (backup) dos dados.",
    "6.3. Adotar medidas técnicas de segurança adequadas para proteger os dados e as credenciais do CONTRATANTE.",
  );

  h("7. Obrigações do CONTRATANTE");
  p(
    "7.1. Fornecer informações verdadeiras e manter seus dados de contato atualizados.",
    "7.2. Responder pelos produtos e serviços que vende, pelos preços e ofertas publicados, pela entrega, pelo atendimento aos seus próprios clientes e pelas obrigações fiscais e consumeristas das suas vendas.",
    "7.3. Guardar com sigilo suas senhas e as credenciais de gateways cadastradas no painel.",
    "7.4. Não utilizar o sistema para fins ilícitos ou para vender produtos proibidos.",
  );

  h("8. Pagamentos dos clientes do CONTRATANTE");
  p(
    "8.1. Os valores pagos pelos clientes do CONTRATANTE (Pix, cartão etc.) são recebidos diretamente na conta do CONTRATANTE junto ao gateway por ele escolhido. A CONTRATADA não intermedeia, não recebe e não retém esses valores.",
    "8.2. As tarifas, prazos de repasse, estornos e contestações (chargebacks) seguem as regras do gateway contratado pelo CONTRATANTE.",
  );

  h("9. Proteção de dados pessoais (LGPD)");
  p(
    "9.1. Em relação aos dados dos clientes do CONTRATANTE, o CONTRATANTE é o controlador e a CONTRATADA atua como operadora, tratando os dados apenas para prestar o serviço (Lei nº 13.709/2018, arts. 5º, VI e VII, e 39).",
    "9.2. A CONTRATADA adota medidas de segurança (art. 46 da LGPD), comunicará ao CONTRATANTE incidentes de segurança relevantes e, ao término do contrato, disponibilizará a exportação dos dados por 30 dias, após o que poderá excluí-los, salvo obrigação legal de guarda.",
  );

  h("10. Propriedade intelectual");
  p(
    `10.1. O sistema ${c.brand}, seu código, layout e marca pertencem à CONTRATADA.`,
    "10.2. A marca, o logo, as fotos e o conteúdo do cardápio pertencem ao CONTRATANTE, que autoriza seu uso exclusivamente para prestação do serviço.",
  );

  h("11. Responsabilidade");
  p(
    "11.1. A CONTRATADA não responde por indisponibilidades causadas por terceiros (internet, energia, hospedagem, gateways de pagamento, operadoras de WhatsApp/e-mail), por caso fortuito ou força maior, nem por uso indevido do sistema pelo CONTRATANTE ou por quem tenha acesso às suas senhas, ressalvadas as hipóteses em que a lei não admite essa limitação.",
  );

  h("12. Documentos fiscais e recibos");
  p(
    "12.1. A cada pagamento a CONTRATADA disponibiliza comprovante de pagamento (recibo). Quando passar a emitir Nota Fiscal de Serviço Eletrônica (NFS-e), as notas serão enviadas por e-mail ao CONTRATANTE.",
  );

  h("13. Guarda e acesso a este contrato");
  p(
    "13.1. Este contrato fica disponível para leitura, download e impressão pelo link enviado ao e-mail do CONTRATANTE e no seu painel (art. 4º, IV e V, do Decreto nº 7.962/2013). Recomenda-se que o CONTRATANTE guarde a sua cópia.",
    `13.2. A CONTRATADA mantém cópia eletrônica deste contrato em seu sistema por ${d.retentionMonths} meses, sem prejuízo da cópia enviada ao CONTRATANTE.`,
  );

  h("14. Aceite eletrônico");
  p(
    "14.1. O CONTRATANTE declara ter lido este contrato e o resumo de valores e serviços antes do pagamento (art. 46 do CDC) e manifesta sua concordância pelo aceite eletrônico, que tem plena validade jurídica (art. 107 do Código Civil e art. 10, §2º, da MP nº 2.200-2/2001).",
    `14.2. Registro do aceite: ${dateBR(d.acceptedAt)} (horário de Brasília)${d.acceptedIp ? ` · IP ${d.acceptedIp}` : ""}.`,
  );

  h("15. Disposições gerais e foro");
  p(
    "15.1. Aplicam-se a este contrato, no que couber, a Lei nº 8.078/1990 (Código de Defesa do Consumidor), o Código Civil (Lei nº 10.406/2002, arts. 421 e 422 — função social e boa-fé), a Lei nº 13.709/2018 (LGPD), a Lei nº 12.965/2014 (Marco Civil da Internet) e o Decreto nº 7.962/2013.",
    "15.2. A tolerância com o descumprimento de qualquer cláusula não implica renúncia ou novação.",
    "15.3. Fica eleito o foro do domicílio do CONTRATANTE (art. 101, I, do CDC) para dirimir quaisquer questões oriundas deste contrato.",
  );

  return { title: `Contrato de prestação de serviços e licença de uso — ${c.brand}`, version: CONTRACT_VERSION, body: L.join("\n").trim() };
}

// =============================================================================
// Paraguai — Ley 1334/98 de Defensa del Consumidor y del Usuario
// =============================================================================
function buildEs(d: ContractData): ContractDoc {
  const m = (v: number) => formatMoney(v, d.currency);
  const per = d.plan.interval === "YEARLY" ? "anualidad" : "mensualidad";
  const c = d.contractor;
  const L: string[] = [];
  const h = (t: string) => L.push("", `## ${t}`);
  const p = (...t: string[]) => L.push(...t);
  p(
    `Contrato nº ${d.number} · versión ${CONTRACT_VERSION}`,
    "",
    `PRESTADORA: ${party([c.legalName || c.brand, c.doc ? `Doc. ${c.doc}` : null, c.email, c.whatsapp])}.`,
    `CLIENTE: ${party([d.client.businessName, `representado por ${d.client.contactName}`, d.client.doc ? `RUC ${d.client.doc}` : null, d.client.email, d.client.whatsapp])}.`,
  );
  h("1. Objeto");
  p(
    `1.1. Licencia de uso del sistema ${c.brand} (SaaS), plan ${d.plan.name}, y servicio de implementación (configuración del sitio, carga del menú/catálogo, identidad visual, mesas con QR y medios de pago).`,
    ...d.plan.features.map((f) => `• ${f}`),
  );
  h("2. Precio");
  p(
    ...[
      `Implementación: ${m(d.setupMinor)}, pago único y anticipado.`,
      ...(d.domainMinor > 0 ? [`Dominio propio (1er año): ${m(d.domainMinor)}.`] : []),
      `${per[0].toUpperCase() + per.slice(1)}: ${m(d.recurringMinor)}, desde la entrega del sistema, con renovación automática. Con más de ${d.graceDays} días de atraso el sitio público puede suspenderse hasta el pago.`,
    ].map((t, i) => `2.${i + 1}. ${t}`),
  );
  h("3. Vigencia y cancelación");
  p("3.1. Plazo indeterminado. **Sin permanencia mínima ni multa:** el cliente puede cancelar cuando quiera; el acceso sigue hasta el fin del período pagado.");
  h("4. Derecho de retracto");
  p(
    "4.1. Por tratarse de una contratación a distancia, el cliente puede retractarse dentro de los 7 (siete) días corridos desde la aceptación o el pago (Ley 1334/98, art. 26).",
    `4.2. En ese caso **no se cobrará ninguna ${per}** y las ya pagadas se devolverán íntegramente.`,
    "4.3. **El cliente declara conocer que la implementación es un servicio personalizado, iniciado inmediatamente después del pago a su pedido, con costos de equipo y creación; por eso el monto de la implementación no es reembolsable.** Si al pedir el retracto la implementación aún no hubiera comenzado, también se devolverá.",
  );
  h("5. Pagos de los clientes del cliente");
  p("5.1. Lo que pagan los clientes del cliente se acredita directamente en su cuenta del medio de pago elegido; la prestadora no intermedia ni retiene valores.");
  h("6. Datos personales y responsabilidad");
  p(
    "6.1. El cliente es responsable de los datos de sus clientes; la prestadora los trata solo para prestar el servicio y adopta medidas de seguridad razonables.",
    "6.2. La prestadora no responde por fallas de terceros (internet, hosting, medios de pago) ni por caso fortuito o fuerza mayor, salvo lo que la ley no permita limitar.",
  );
  h("7. Copia del contrato y aceptación");
  p(
    `7.1. El contrato queda disponible para descarga e impresión en el enlace enviado por e-mail y en el panel. La prestadora conserva una copia por ${d.retentionMonths} meses.`,
    `7.2. Aceptación electrónica: ${dateES(d.acceptedAt)}${d.acceptedIp ? ` · IP ${d.acceptedIp}` : ""} (Ley 4017/2010 de validez jurídica de la firma y documentos electrónicos).`,
  );
  return { title: `Contrato de servicios y licencia de uso — ${c.brand}`, version: CONTRACT_VERSION, body: L.join("\n").trim() };
}

/** Número legível: GW-2026-000042 */
export function contractNumber(seq: number, year = new Date().getFullYear()) {
  return `GW-${year}-${String(seq).padStart(6, "0")}`;
}
