// Geovana — atendente com IA no WhatsApp da loja. Regras puras (sem I/O): configuração da loja,
// predefinições sugeridas por nicho, montagem do prompt e leitura das ações na resposta da IA.
// Testado em geovana.test.ts.

export type GeovanaChannel = "none" | "evolution" | "cloud";
export type GeovanaTone = "amigavel" | "profissional" | "descontraido";
export type GeovanaFaq = { q: string; a: string };

export type GeovanaConfig = {
  enabled: boolean; // IA respondendo
  name: string; // nome da atendente
  tone: GeovanaTone;
  emojis: boolean;
  greeting: string; // 1ª mensagem do dia
  about: string; // o que a loja é / diferenciais
  hours: string; // horário de atendimento (texto livre)
  rules: string; // o que NUNCA fazer / políticas
  promos: string; // promoções da semana
  faq: GeovanaFaq[];
  handoffWords: string[]; // palavras que chamam um humano
  onlyWhenClosed: boolean; // IA só fora do horário (loja fechada)
  pauseMinutes: number; // atendente humano respondeu → IA pausa nessa conversa
  takeOrders: boolean; // monta o carrinho e manda o link
  orderNotices: boolean; // avisos automáticos do pedido ao cliente
  // canal (segredos selados)
  channel: GeovanaChannel;
  instance: string; // Evolution: nome da instância
  instanceKeySealed: string; // Evolution: token da instância
  cloudPhoneId: string; // API oficial: phone number id
  cloudTokenSealed: string; // API oficial: token permanente
  cloudAppSecretSealed: string; // API oficial: app secret (assinatura do webhook)
  cloudVerifyToken: string; // API oficial: verify token do webhook
  hookToken: string; // segredo na URL do webhook desta loja
  ownKeySealed: string; // chave Gemini da própria loja (opcional)
};

export const DEFAULT_GEOVANA: GeovanaConfig = {
  enabled: false,
  name: "Geovana",
  tone: "amigavel",
  emojis: true,
  greeting: "",
  about: "",
  hours: "",
  rules: "",
  promos: "",
  faq: [],
  handoffWords: ["atendente", "humano", "pessoa", "gerente", "reclamação"],
  onlyWhenClosed: false,
  pauseMinutes: 60,
  takeOrders: true,
  orderNotices: true,
  channel: "none",
  instance: "",
  instanceKeySealed: "",
  cloudPhoneId: "",
  cloudTokenSealed: "",
  cloudAppSecretSealed: "",
  cloudVerifyToken: "",
  hookToken: "",
  ownKeySealed: "",
};

const s = (v: unknown, d: string, max = 2000) => (typeof v === "string" ? v.slice(0, max) : d);

export function parseGeovana(raw: string | null | undefined): GeovanaConfig {
  let o: Record<string, unknown> = {};
  try {
    o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {}
  const d = DEFAULT_GEOVANA;
  const faq = Array.isArray(o.faq)
    ? (o.faq as unknown[])
        .map((x) => (x && typeof x === "object" ? { q: s((x as GeovanaFaq).q, "", 200).trim(), a: s((x as GeovanaFaq).a, "", 600).trim() } : null))
        .filter((x): x is GeovanaFaq => !!x && !!x.q && !!x.a)
        .slice(0, 30)
    : d.faq;
  const words = Array.isArray(o.handoffWords) ? (o.handoffWords as unknown[]).filter((w): w is string => typeof w === "string" && !!w.trim()).map((w) => w.trim().toLowerCase().slice(0, 30)).slice(0, 15) : d.handoffWords;
  const pm = Number(o.pauseMinutes);
  return {
    enabled: o.enabled === true,
    name: s(o.name, d.name, 30).trim() || d.name,
    tone: o.tone === "profissional" || o.tone === "descontraido" ? o.tone : "amigavel",
    emojis: o.emojis !== false,
    greeting: s(o.greeting, d.greeting, 500),
    about: s(o.about, d.about, 1500),
    hours: s(o.hours, d.hours, 300),
    rules: s(o.rules, d.rules, 1500),
    promos: s(o.promos, d.promos, 800),
    faq,
    handoffWords: words,
    onlyWhenClosed: o.onlyWhenClosed === true,
    pauseMinutes: Number.isFinite(pm) && pm >= 5 && pm <= 1440 ? Math.round(pm) : d.pauseMinutes,
    takeOrders: o.takeOrders !== false,
    orderNotices: o.orderNotices !== false,
    channel: o.channel === "evolution" || o.channel === "cloud" ? o.channel : "none",
    instance: s(o.instance, "", 80),
    instanceKeySealed: s(o.instanceKeySealed, "", 500),
    cloudPhoneId: s(o.cloudPhoneId, "", 40).replace(/\D/g, ""),
    cloudTokenSealed: s(o.cloudTokenSealed, "", 1500),
    cloudAppSecretSealed: s(o.cloudAppSecretSealed, "", 500),
    cloudVerifyToken: s(o.cloudVerifyToken, "", 100),
    hookToken: s(o.hookToken, "", 100),
    ownKeySealed: s(o.ownKeySealed, "", 500),
  };
}

/** Predefinições sugeridas por tipo de negócio (o lojista escolhe e ajusta). */
export const GEOVANA_PRESETS: { id: string; label: string; about: string; rules: string; faq: GeovanaFaq[]; greeting: string }[] = [
  {
    id: "lanchonete",
    label: "Hamburgueria / lanchonete",
    greeting: "Oi! Aqui é a {nome}, da {loja} 🍔 Quer ver o cardápio ou já sabe o que vai pedir?",
    about: "Lanches artesanais feitos na hora. Entrega e retirada.",
    rules: "Não prometa tempo de entrega exato; diga a média. Não dê descontos que não estejam nas promoções. Pedidos só pelo link do site.",
    faq: [
      { q: "Qual o tempo de entrega?", a: "Em média 40 a 60 minutos, dependendo da distância e do movimento." },
      { q: "Tem opção vegetariana?", a: "Temos! Confira os itens marcados como vegetarianos no cardápio." },
      { q: "Posso tirar algum ingrediente?", a: "Pode sim, é só escrever na observação do item no site." },
    ],
  },
  {
    id: "pizzaria",
    label: "Pizzaria",
    greeting: "Boa noite! Sou a {nome}, da {loja} 🍕 Vai de pizza hoje?",
    about: "Pizzas assadas na hora, massa de fermentação longa. Meio a meio disponível.",
    rules: "Pizza meio a meio cobra o valor do sabor mais caro. Não confirme sabores que não estão no cardápio.",
    faq: [
      { q: "Faz meio a meio?", a: "Faz sim! O valor é o do sabor mais caro." },
      { q: "Qual o tamanho da grande?", a: "A grande tem 8 fatias e serve bem 3 pessoas." },
      { q: "Tem borda recheada?", a: "Tem, escolha nas opções da pizza no site." },
    ],
  },
  {
    id: "restaurante",
    label: "Restaurante / marmitaria",
    greeting: "Olá! Aqui é a {nome}, do {loja}. Posso te mandar o cardápio do dia?",
    about: "Comida caseira, prato do dia e marmitas.",
    rules: "O prato do dia muda diariamente; consulte o cardápio do site. Não aceite reservas sem confirmar com a equipe.",
    faq: [
      { q: "Qual o prato do dia?", a: "O prato do dia está em destaque no topo do cardápio do site." },
      { q: "Fazem marmita fitness?", a: "Temos opções leves no cardápio; confira a seção Fit." },
    ],
  },
  {
    id: "acai",
    label: "Açaí / sorveteria / doceria",
    greeting: "Oii! Sou a {nome}, da {loja} 💜 Bora montar seu açaí?",
    about: "Açaí cremoso com adicionais à vontade, sorvetes e sobremesas.",
    rules: "Adicionais são cobrados à parte conforme o cardápio.",
    faq: [{ q: "Quais os adicionais?", a: "Todos os adicionais aparecem ao escolher o tamanho no site." }],
  },
  {
    id: "loja",
    label: "Loja / varejo",
    greeting: "Olá! Sou a {nome}, assistente da {loja}. Procura algum produto?",
    about: "Produtos de qualidade com entrega rápida na cidade.",
    rules: "Trocas em até 7 dias com nota/comprovante. Não confirme estoque de itens que não estão no catálogo.",
    faq: [
      { q: "Vocês fazem troca?", a: "Sim, em até 7 dias com o comprovante e o produto sem uso." },
      { q: "Parcelam no cartão?", a: "Sim, as condições aparecem no pagamento pelo site." },
    ],
  },
  {
    id: "servicos",
    label: "Salão / barbearia / serviços com agenda",
    greeting: "Olá! Aqui é a {nome}, da {loja} ✂️ Quer agendar um horário?",
    about: "Atendimento com hora marcada.",
    rules: "Agendamentos só pelo link da agenda. Cancelamentos com 2 horas de antecedência.",
    faq: [{ q: "Como cancelo?", a: "Responda aqui com pelo menos 2 horas de antecedência que a equipe cancela para você." }],
  },
];

const TONE: Record<GeovanaTone, string> = {
  amigavel: "simpática, acolhedora e objetiva",
  profissional: "educada, formal e objetiva",
  descontraido: "descontraída, bem-humorada e leve, sem exageros",
};

export type GeovanaContext = {
  storeName: string;
  storeUrl: string;
  isOpen: boolean;
  address: string | null;
  delivery: string; // ex.: "Entrega até 8 km, taxa a partir de R$ 5,00"
  payments: string; // ex.: "Pix, cartão, dinheiro"
  bookingUrl: string | null;
  catalog: { id: string; name: string; price: string; category?: string | null; description?: string | null }[];
  customerName: string | null;
  customerOrders: { number: string; status: string; when: string; total: string; trackUrl: string }[];
  locale: "pt" | "es";
};

/** Instruções do sistema (prompt) com tudo que a IA pode usar — e o que ela não pode inventar. */
export function buildSystemPrompt(cfg: GeovanaConfig, c: GeovanaContext) {
  const es = c.locale === "es";
  const lines = [
    `Você é ${cfg.name}, atendente virtual da loja "${c.storeName}" no WhatsApp. Personalidade: ${TONE[cfg.tone]}. ${cfg.emojis ? "Use poucos emojis." : "Não use emojis."}`,
    es ? "Responda SEMPRE em espanhol (Paraguai)." : "Responda SEMPRE em português do Brasil.",
    "Mensagens curtas (até 4 linhas), como uma pessoa no WhatsApp. Nunca use markdown com # ou tabelas; *negrito* do WhatsApp pode.",
    "Use SOMENTE as informações abaixo. Se não souber, diga que vai confirmar com a equipe e inclua [[HUMANO]]. Nunca invente preço, produto, prazo, desconto ou política.",
    "Nunca peça dados de cartão, senhas ou documentos pelo chat. Pagamentos só pelo link do site.",
    `Site da loja (cardápio, pedidos e pagamento): ${c.storeUrl}`,
    `Situação agora: ${c.isOpen ? "loja ABERTA, recebendo pedidos" : "loja FECHADA no momento (pedidos ficam para quando abrir, se o site permitir)"}.`,
    c.address ? `Endereço: ${c.address}` : "",
    cfg.hours ? `Horário de atendimento: ${cfg.hours}` : "",
    c.delivery ? `Entrega: ${c.delivery}` : "",
    c.payments ? `Formas de pagamento: ${c.payments}` : "",
    cfg.greeting ? `Saudação para quem chega (adapte): ${cfg.greeting.replaceAll("{nome}", cfg.name).replaceAll("{loja}", c.storeName)}` : "",
    cfg.about ? `Sobre a loja: ${cfg.about}` : "",
    cfg.promos ? `Promoções vigentes: ${cfg.promos}` : "",
    cfg.rules ? `Regras da loja (obedeça): ${cfg.rules}` : "",
    cfg.faq.length ? `Perguntas frequentes:\n${cfg.faq.map((f) => `- ${f.q} → ${f.a}`).join("\n")}` : "",
    c.bookingUrl ? `Agendamentos: envie este link ${c.bookingUrl}` : "",
    c.catalog.length
      ? `Cardápio/catálogo (id | nome | preço):\n${c.catalog.map((p) => `${p.id} | ${p.name}${p.category ? ` (${p.category})` : ""} | ${p.price}${p.description ? ` — ${p.description.slice(0, 80)}` : ""}`).join("\n")}`
      : "",
    c.customerName ? `Nome do cliente: ${c.customerName}` : "",
    c.customerOrders.length
      ? `Pedidos recentes deste cliente (use para "cadê meu pedido"):\n${c.customerOrders.map((o) => `#${o.number} — ${o.status} — ${o.when} — ${o.total} — acompanhar: ${o.trackUrl}`).join("\n")}`
      : "Este cliente não tem pedidos recentes.",
    cfg.takeOrders
      ? `Para fazer um pedido: confirme os itens e quantidades com o cliente e, quando ele confirmar, escreva no FIM da resposta a marcação [[CARRINHO: id:quantidade, id:quantidade]] usando os ids do catálogo. O sistema troca isso por um link do site com o carrinho pronto para ele finalizar e pagar. Não diga o total final (a taxa de entrega é calculada no site).`
      : "Pedidos: mande o link do site para o cliente montar o pedido.",
    `Se o cliente pedir para falar com uma pessoa, reclamar, ou o assunto fugir do que você sabe, responda com gentileza e inclua [[HUMANO]] no fim.`,
  ];
  return lines.filter(Boolean).join("\n");
}

export type ParsedReply = { text: string; cart: { productId: string; quantity: number }[]; handoff: boolean };

/** Lê as marcações da resposta da IA e devolve o texto limpo + ações. */
export function parseReply(raw: string, validIds: Set<string>): ParsedReply {
  let handoff = /\[\[\s*HUMANO\s*\]\]/i.test(raw);
  const cart: { productId: string; quantity: number }[] = [];
  const m = raw.match(/\[\[\s*CARRINHO\s*:([^\]]*)\]\]/i);
  if (m) {
    for (const part of m[1].split(",")) {
      const [id, q] = part.split(":").map((x) => x.trim());
      const quantity = Math.max(1, Math.min(99, Math.round(Number(q) || 1)));
      if (id && validIds.has(id)) {
        const cur = cart.find((c) => c.productId === id);
        if (cur) cur.quantity = Math.min(99, cur.quantity + quantity);
        else cart.push({ productId: id, quantity });
      }
    }
  }
  const text = raw
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text && !cart.length) handoff = true;
  return { text, cart, handoff };
}

/** Cliente pediu um humano por palavra-chave? */
export function wantsHuman(msg: string, words: string[]) {
  const t = msg.toLowerCase();
  return words.some((w) => w && t.includes(w));
}

/** Número do WhatsApp (jid "5581999990000@s.whatsapp.net" ou "5581999990000") → E.164; grupos = null. */
export function jidToE164(jid: string) {
  if (!jid || /@g\.us$|@broadcast|status@/.test(jid)) return null;
  const d = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
}

/** Aviso automático ao cliente quando o pedido muda de situação. */
export function orderNotice(status: string, o: { number: string; storeName: string; trackUrl: string; type: string }, locale: "pt" | "es") {
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  switch (status) {
    case "PREPARING":
      return T(`¡Tu pedido #${o.number} de ${o.storeName} está en preparación! 👨‍🍳 Seguilo acá: ${o.trackUrl}`, `Seu pedido #${o.number} da ${o.storeName} está em preparo! 👨‍🍳 Acompanhe: ${o.trackUrl}`);
    case "READY":
      return o.type === "DELIVERY" ? null : T(`Tu pedido #${o.number} está listo para retirar ✅`, `Seu pedido #${o.number} está pronto para retirar ✅`);
    case "OUT_FOR_DELIVERY":
      return T(`Tu pedido #${o.number} salió para entrega 🛵 Seguí al repartidor en el mapa: ${o.trackUrl}`, `Seu pedido #${o.number} saiu para entrega 🛵 Acompanhe o motoboy no mapa: ${o.trackUrl}`);
    case "COMPLETED":
      return T(`Pedido #${o.number} entregado. ¡Gracias por elegir ${o.storeName}! 💛`, `Pedido #${o.number} entregue. Obrigado por escolher a ${o.storeName}! 💛`);
    case "CANCELLED":
      return T(`Tu pedido #${o.number} fue cancelado. Si tenés dudas, respondé este mensaje.`, `Seu pedido #${o.number} foi cancelado. Se tiver dúvidas, é só responder aqui.`);
    default:
      return null;
  }
}

/** FAQ em texto ("Pergunta | Resposta" por linha) ↔ lista. */
export function faqFromText(raw: string): GeovanaFaq[] {
  return raw
    .split(/\n+/)
    .map((l) => l.split("|"))
    .filter((p) => p.length >= 2 && p[0].trim() && p.slice(1).join("|").trim())
    .map((p) => ({ q: p[0].trim().slice(0, 200), a: p.slice(1).join("|").trim().slice(0, 600) }))
    .slice(0, 30);
}
export const faqToText = (f: GeovanaFaq[]) => f.map((x) => `${x.q} | ${x.a}`).join("\n");
