// Kit do afiliado: guia de divulgação, textos prontos e modelos de arte (conteúdo fixo, sem I/O).
// Placeholders trocados no portal: {link} (link do afiliado), {nome} (primeiro nome), {convite} (link de convite de afiliados).

export type KitTip = { title: string; icon: string; points: string[] };

export const KIT_GUIDE: KitTip[] = [
  {
    title: "Onde estão os clientes",
    icon: "store",
    points: [
      "Lanchonetes, hamburguerias, pizzarias, açaí, padarias, docerias e restaurantes de bairro.",
      "Quem já vende pelo WhatsApp ou Instagram e anota pedido no papel ou no caderno.",
      "Quem usa aplicativo de entrega e reclama da comissão por pedido.",
      "Barbearias, salões e estúdios (a GoWeb tem agenda online) e lojas que vendem por catálogo.",
      "Comece pela sua rua, pelo seu bairro e pelos lugares onde você já é cliente.",
    ],
  },
  {
    title: "Visita presencial (a que mais fecha)",
    icon: "pin",
    points: [
      "Vá fora do horário de pico: entre 14h e 17h o dono tem tempo para conversar.",
      "Peça para falar com o dono ou com quem decide. Seja breve: 2 minutos de conversa.",
      "Mostre no seu celular uma loja de exemplo no Shopping GoWeb (goweboficial.com/shopping).",
      "Deixe o seu flyer com QR Code. Melhor ainda: agende a demonstração ali mesmo, pelo seu link.",
      "Anote o contato no portal (Indicações → Nova indicação) para a venda ficar registrada no seu nome.",
    ],
  },
  {
    title: "WhatsApp sem virar spam",
    icon: "chat",
    points: [
      "Mande mensagem individual, com o nome da pessoa e do negócio. Nada de lista de transmissão para desconhecidos.",
      "Faça uma pergunta só e termine com o link da demonstração.",
      "Sem resposta? Um lembrete depois de 2 dias e outro depois de uma semana. Depois disso, pare.",
      "Use o botão “Enviar no WhatsApp” do portal: ele já marca que o clique veio do WhatsApp.",
    ],
  },
  {
    title: "Instagram e status",
    icon: "megaphone",
    points: [
      "Poste a arte de story 2 a 3 vezes por semana, com o link no adesivo de link.",
      "Coloque o seu link na bio enquanto estiver divulgando.",
      "Conte casos reais: “ajudei a pizzaria X a sair do caderno”. Prova vende mais que propaganda.",
      "Responda quem perguntar no direct com o texto pronto e o seu link.",
    ],
  },
  {
    title: "Respostas para as objeções mais comuns",
    icon: "sparkle",
    points: [
      "“Já uso aplicativo de entrega.” → A GoWeb não substitui, complementa: o cliente que já te conhece pede direto pelo seu link, sem comissão por pedido.",
      "“É caro.” → Na contratação paga só a implantação. A primeira mensalidade vence 30 dias depois que o sistema é entregue. Compare com o que paga hoje de comissão.",
      "“Não tenho tempo para montar.” → A equipe GoWeb monta o cardápio, a marca e as mesas na implantação.",
      "“Não sei mexer com sistema.” → O painel é simples, tem assistente com IA e suporte com protocolo e prazo de resposta.",
      "“Vou pensar.” → Ofereça a demonstração gratuita: são 20 minutos, sem compromisso.",
    ],
  },
  {
    title: "O que não fazer",
    icon: "alert",
    points: [
      "Não prometa preço, desconto ou função que não estejam no site oficial.",
      "Não se apresente como funcionário da GoWeb: você é parceiro/afiliado.",
      "Não mande mensagens em massa nem use listas compradas (LGPD).",
      "Não contrate para você mesmo pelo seu link: autoindicação não gera comissão.",
    ],
  },
  {
    title: "Rotina que dá resultado",
    icon: "calendar",
    points: [
      "Por semana: 5 visitas, 10 conversas no WhatsApp e 3 demonstrações agendadas (são as missões do portal).",
      "Toda segunda, confira em Indicações quem ficou sem agendar e mande o lembrete.",
      "Participe das lives: lá saem novidades, campanhas e prêmios do ranking.",
    ],
  },
];

export type KitScript = { id: string; title: string; when: string; body: string };

export const KIT_SCRIPTS: KitScript[] = [
  {
    id: "primeira-conhecido",
    title: "Primeira mensagem (comércio que você conhece)",
    when: "Para o dono de um lugar onde você já é cliente.",
    body: "Oi, [nome do dono]! Tudo bem? Aqui é {nome}.\n\nEstou trabalhando com a GoWeb, um sistema que coloca o cardápio de vocês no celular do cliente: ele pede pelo link ou pelo QR na mesa, o pedido chega organizado e vocês não pagam comissão por pedido.\n\nPosso te mostrar funcionando? É uma demonstração gratuita de uns 20 minutos, você escolhe o horário aqui: {link}",
  },
  {
    id: "primeira-fria",
    title: "Primeira mensagem (comércio que você não conhece)",
    when: "Para um negócio que você achou no Instagram ou no Google.",
    body: "Olá! Vi o perfil de vocês e gostei muito do cardápio. Me chamo {nome}, sou parceiro da GoWeb.\n\nUma pergunta rápida: hoje os pedidos chegam pelo WhatsApp e são anotados à mão? A GoWeb organiza isso com cardápio digital, pedidos, delivery e caixa num sistema só, com a marca de vocês.\n\nSe fizer sentido, dá para agendar uma demonstração gratuita por aqui: {link}",
  },
  {
    id: "lembrete",
    title: "Lembrete (2 dias depois)",
    when: "Para quem não respondeu.",
    body: "Oi! Passando só para não deixar passar: a demonstração da GoWeb é gratuita e rápida, e mostra o sistema com um cardápio parecido com o de vocês. Se quiser, é só escolher um horário: {link}\n\nSe agora não for o momento, sem problema!",
  },
  {
    id: "pos-visita",
    title: "Depois da visita presencial",
    when: "No mesmo dia em que você passou no comércio.",
    body: "Oi, [nome]! Foi um prazer conversar com você hoje. Como combinamos, aqui está o link para marcar a demonstração da GoWeb no melhor horário: {link}\n\nQualquer dúvida, me chama por aqui.",
  },
  {
    id: "confirmar-demo",
    title: "Confirmação da demonstração",
    when: "Na véspera da demonstração agendada.",
    body: "Oi, [nome]! Só confirmando a demonstração da GoWeb amanhã às [horário]. A equipe vai te chamar por aqui no horário. Se precisar mudar, me avisa que eu remarco.",
  },
  {
    id: "pos-demo",
    title: "Depois da demonstração",
    when: "Para quem assistiu mas ainda não contratou.",
    body: "Oi, [nome]! O que achou da demonstração? Lembrando que na contratação vocês pagam só a implantação, e a primeira mensalidade vence 30 dias depois que o sistema estiver pronto. Os planos estão aqui: goweboficial.com/planos\n\nSe quiser seguir, posso te ajudar com o cadastro: {link}",
  },
  {
    id: "story",
    title: "Legenda para story ou status",
    when: "Junto com a arte de story.",
    body: "Tem lanchonete, restaurante ou loja? Seu cliente pede pelo celular, o pedido chega organizado e você não paga comissão por pedido. Demonstração grátis 👉 {link}",
  },
  {
    id: "feed",
    title: "Legenda para post no feed",
    when: "Junto com a arte de post.",
    body: "Ainda anotando pedido no caderno? 📒\n\nCom a GoWeb o seu negócio ganha cardápio digital com QR, pedidos pelo WhatsApp, delivery com taxa por distância e caixa — tudo com a sua marca e sem comissão por pedido.\n\nAgende uma demonstração gratuita pelo link: {link}\n\n#cardapiodigital #delivery #pequenosnegocios",
  },
  {
    id: "convite-afiliado",
    title: "Convidar alguém para ser afiliado",
    when: "Para amigos que conhecem muitos comerciantes (você ganha 3% das vendas deles).",
    body: "Oi! Estou no programa de afiliados da GoWeb: indico o sistema para comércios e recebo comissão por Pix a cada venda, sem taxa e sem meta. Acho que tem tudo a ver com você. Cadastro pelo meu convite: {convite}",
  },
];

export type ArtModel = { id: string; title: string; desc: string };
export const ART_MODELS: ArtModel[] = [
  { id: "caderno", title: "Saia do caderno", desc: "Para quem ainda anota pedido no papel." },
  { id: "comissao", title: "Sem comissão por pedido", desc: "Para quem usa aplicativo de entrega." },
  { id: "demo", title: "Demonstração grátis", desc: "Convite direto, com QR grande." },
];
export const ART_FORMATS = [
  { id: "story", title: "Story / status", w: 1080, h: 1920 },
  { id: "post", title: "Post (feed)", w: 1080, h: 1350 },
  { id: "flyer", title: "Flyer para imprimir (A5)", w: 1240, h: 1748 },
] as const;
export type ArtFormat = (typeof ART_FORMATS)[number]["id"];

export function fillKit(text: string, v: { link: string; nome: string; convite: string }) {
  return text.replaceAll("{link}", v.link).replaceAll("{nome}", v.nome).replaceAll("{convite}", v.convite);
}
