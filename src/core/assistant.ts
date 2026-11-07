// Assistente do painel — parte pura: guia das telas, ferramentas e o que cada lojista pode usar.
// O assistente só oferece ferramentas das áreas que a pessoa acessa E dos módulos do plano dela.
import type { PanelArea } from "./types";
import type { ModuleKey } from "./modules";

export type Locale = "es" | "pt";
type Txt = { es: string; pt: string };

/** Telas do painel com o que dá para fazer em cada uma (usado no guia e no prompt do modelo). */
export const PAGES: { id: string; href: string; area: PanelArea; module?: ModuleKey; pro?: boolean; title: Txt; help: Txt; words: string[] }[] = [
  { id: "orders", href: "", area: "orders", title: { es: "Pedidos", pt: "Pedidos" }, help: { es: "Ves los pedidos en vivo por columna (nuevos, en preparación, listos). Tocá el botón verde de cada pedido para avanzar y «Cobrado» cuando recibas el pago.", pt: "Você vê os pedidos ao vivo por coluna (novos, em preparo, prontos). Toque no botão verde de cada pedido para avançar e em «Recebido» quando receber o pagamento." }, words: ["pedido", "pedidos", "orden", "preparo", "pronto", "entregar", "status"] },
  { id: "cash", href: "/caixa", area: "cash", module: "caixa", title: { es: "Caja", pt: "Caixa" }, help: { es: "Abrí la caja con el fondo inicial, registrá ventas de mostrador, entradas y salidas, y cerrá al final del día para ver la diferencia.", pt: "Abra o caixa com o troco inicial, registre vendas no balcão, entradas e saídas, e feche no fim do dia para conferir a diferença." }, words: ["caixa", "caja", "pdv", "balcão", "mostrador", "troco", "fechar caixa", "sangria"] },
  { id: "tables", href: "/mesas", area: "tables", module: "mesas", title: { es: "Mesas y QR", pt: "Mesas e QR" }, help: { es: "Creá las mesas y descargá el QR de cada una para imprimir. El cliente escanea y el pedido llega con el número de mesa.", pt: "Crie as mesas e baixe o QR de cada uma para imprimir. O cliente escaneia e o pedido chega com o número da mesa." }, words: ["mesa", "mesas", "qr", "qrcode", "código"] },
  { id: "couriers", href: "/motoboys", area: "couriers", module: "delivery", title: { es: "Repartidores", pt: "Motoboys" }, help: { es: "Registrá repartidores, asignalos en cada pedido de delivery y mandá la ruta por WhatsApp. Ves cuánto pagar a cada uno.", pt: "Cadastre motoboys, atribua em cada pedido de delivery e envie a rota pelo WhatsApp. Você vê quanto pagar para cada um." }, words: ["motoboy", "entregador", "repartidor", "delivery", "entrega", "rota"] },
  { id: "agenda", href: "/agenda", area: "agenda", module: "agenda", pro: true, title: { es: "Agenda", pt: "Agenda" }, help: { es: "Configurá horarios de atención y confirmá los turnos que los clientes reservan en tu sitio.", pt: "Configure os horários de atendimento e confirme os horários que os clientes marcam no seu site." }, words: ["agenda", "horário", "turno", "agendamento", "reserva"] },
  { id: "products", href: "/produtos", area: "products", title: { es: "Productos y stock", pt: "Produtos e estoque" }, help: { es: "Agregá productos con foto, precio y categoría, pausá los que faltan y controlá el stock.", pt: "Cadastre produtos com foto, preço e categoria, pause o que acabou e controle o estoque." }, words: ["produto", "produtos", "preço", "precio", "estoque", "stock", "foto", "categoria", "cardápio", "menú", "catálogo"] },
  { id: "appearance", href: "/aparencia", area: "appearance", title: { es: "Apariencia del sitio", pt: "Aparência do site" }, help: { es: "Elegí el modelo del sitio, el color, el logo y el banner de promoción.", pt: "Escolha o modelo do site, a cor, o logo e o banner de promoção." }, words: ["aparência", "apariencia", "logo", "cor", "color", "banner", "tema", "modelo", "site"] },
  { id: "customers", href: "/clientes", area: "customers", module: "divulgacao", title: { es: "Clientes", pt: "Clientes" }, help: { es: "Tu cartera de clientes con compras, de dónde vienen las ventas y campañas por WhatsApp.", pt: "Sua carteira de clientes com compras, de onde vêm as vendas e campanhas pelo WhatsApp." }, words: ["cliente", "clientes", "carteira", "cartera", "campanha", "campaña", "aniversário"] },
  { id: "growth", href: "/crescimento", area: "customers", title: { es: "Crecimiento", pt: "Crescimento" }, help: { es: "Encendé reseñas en Google, Vitrina de la ciudad, recomendá y ganá, fidelidad y cumpleaños.", pt: "Ligue avaliação no Google, Vitrine da cidade, indique e ganhe, fidelidade e aniversário." }, words: ["crescimento", "crecimiento", "fidelidade", "fidelidad", "indique", "indicação", "cashback", "avaliação", "google", "vitrine"] },
  { id: "kit", href: "/divulgacao", area: "customers", title: { es: "Divulgación", pt: "Divulgação" }, help: { es: "Enlaces para cada red, QR, materiales para imprimir y artes listas para Instagram.", pt: "Links para cada rede, QR, materiais para imprimir e artes prontas para o Instagram." }, words: ["divulgação", "divulgación", "instagram", "post", "story", "arte", "panfleto", "adesivo", "link"] },
  { id: "marketing", href: "/marketing", area: "marketing", module: "marketing", pro: true, title: { es: "Marketing", pt: "Marketing" }, help: { es: "Cupones, ofertas relámpago, carritos abandonados y sugerencias de venta.", pt: "Cupons, ofertas relâmpago, carrinhos abandonados e sugestões de venda." }, words: ["cupom", "cupón", "oferta", "promoção", "promo", "desconto", "descuento", "carrinho", "marketing"] },
  { id: "fiscal", href: "/notas", area: "fiscal", module: "notas", title: { es: "Facturas", pt: "Notas fiscais" }, help: { es: "Registrá las facturas emitidas y recibidas.", pt: "Registre as notas fiscais emitidas e recebidas." }, words: ["nota", "notas", "fiscal", "factura", "facturas"] },
  { id: "team", href: "/equipe", area: "team", module: "equipe", pro: true, title: { es: "Equipo", pt: "Equipe" }, help: { es: "Creá usuarios para tus empleados y elegí qué partes del panel ve cada uno.", pt: "Crie usuários para seus funcionários e escolha o que cada um vê no painel." }, words: ["equipe", "equipo", "funcionário", "empleado", "usuário", "acesso", "permissão"] },
  { id: "settings", href: "/config", area: "settings", title: { es: "Configuración", pt: "Configurações" }, help: { es: "Horarios, tipos de pedido, delivery, medios de pago, Mercado Pago, impresora y contraseña.", pt: "Horários, tipos de pedido, delivery, formas de pagamento, Mercado Pago, impressora e senha." }, words: ["configuração", "configuración", "pagamento", "pago", "pix", "mercado pago", "senha", "contraseña", "impressora", "impresora", "horário de funcionamento", "taxa de entrega"] },
  { id: "plan", href: "/plano", area: "team", title: { es: "Mi plan", pt: "Meu plano" }, help: { es: "Tu plan, módulos, facturas, contrato y recibos.", pt: "Seu plano, módulos, faturas, contrato e recibos." }, words: ["plano", "plan", "fatura", "mensalidade", "contrato", "módulo", "assinatura"] },
];

export type ToolName =
  | "go_to_page"
  | "sales_summary"
  | "find_products"
  | "open_orders"
  | "set_store_open"
  | "update_product"
  | "create_product"
  | "update_order_status"
  | "create_coupon"
  | "start_flash_offer"
  | "add_courier"
  | "update_banner";

type ToolDef = { name: ToolName; area: PanelArea; module?: ModuleKey; pro?: boolean; action: boolean; description: string; input_schema: Record<string, unknown> };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });

export const TOOLS: ToolDef[] = [
  { name: "go_to_page", area: "orders", action: false, description: "Mostra um botão para abrir uma tela do painel. Use quando a pessoa quiser ir a algum lugar ou aprender a usar uma função.", input_schema: obj({ page: { type: "string", description: "id da tela (veja a lista de telas)" } }, ["page"]) },
  { name: "sales_summary", area: "orders", action: false, description: "Resumo de vendas (quantidade de pedidos, total vendido, recebido e a receber) de hoje, 7 ou 30 dias.", input_schema: obj({ days: { type: "integer", enum: [1, 7, 30] } }, ["days"]) },
  { name: "find_products", area: "products", action: false, description: "Busca produtos pelo nome (ou lista os primeiros) com id, preço, se está ativo e estoque.", input_schema: obj({ query: { type: "string" } }) },
  { name: "open_orders", area: "orders", action: false, description: "Lista os pedidos em aberto (novos, em preparo, prontos, saiu para entrega).", input_schema: obj({}) },
  { name: "set_store_open", area: "orders", action: true, description: "Abre ou fecha a loja para pedidos online.", input_schema: obj({ open: { type: "boolean" } }, ["open"]) },
  { name: "update_product", area: "products", action: true, description: "Altera um produto existente: preço (em unidades da moeda, ex. 25.90), ativo/pausado e/ou estoque. Use o id vindo de find_products.", input_schema: obj({ productId: { type: "string" }, price: { type: "number" }, active: { type: "boolean" }, stock: { type: "integer" } }, ["productId"]) },
  { name: "create_product", area: "products", action: true, description: "Cria um produto novo com nome, preço (em unidades da moeda) e descrição opcional.", input_schema: obj({ name: { type: "string" }, price: { type: "number" }, description: { type: "string" } }, ["name", "price"]) },
  { name: "update_order_status", area: "orders", action: true, description: "Muda o status de um pedido pelo número (#). Status: PREPARING, READY, OUT_FOR_DELIVERY, COMPLETED, CANCELLED.", input_schema: obj({ number: { type: "string" }, status: { type: "string", enum: ["PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"] } }, ["number", "status"]) },
  { name: "create_coupon", area: "marketing", module: "marketing", pro: true, action: true, description: "Cria um cupom de desconto percentual.", input_schema: obj({ code: { type: "string" }, percent: { type: "integer", minimum: 1, maximum: 90 }, days: { type: "integer", description: "validade em dias (opcional)" }, maxUses: { type: "integer" } }, ["code", "percent"]) },
  { name: "start_flash_offer", area: "marketing", module: "marketing", pro: true, action: true, description: "Coloca um produto em oferta relâmpago por algumas horas (preço menor que o normal).", input_schema: obj({ productId: { type: "string" }, price: { type: "number" }, hours: { type: "integer", minimum: 1, maximum: 336 } }, ["productId", "price", "hours"]) },
  { name: "add_courier", area: "couriers", module: "delivery", action: true, description: "Cadastra um motoboy com nome e WhatsApp (com DDD).", input_schema: obj({ name: { type: "string" }, phone: { type: "string" } }, ["name", "phone"]) },
  { name: "update_banner", area: "appearance", action: true, description: "Atualiza o banner de promoção do site (título, subtítulo e destaque). Título vazio esconde o banner.", input_schema: obj({ title: { type: "string" }, subtitle: { type: "string" }, highlight: { type: "string" } }) },
];

/** Ferramentas liberadas para esta pessoa (área de acesso + módulo do plano + GoInteligence). */
export function allowedTools(areas: Set<PanelArea>, mods: ModuleKey[] | null, pro: boolean) {
  return TOOLS.filter((t) => areas.has(t.area) && (!t.module || mods === null || mods.includes(t.module)) && (!t.pro || pro));
}

export function allowedPages(areas: Set<PanelArea>, mods: ModuleKey[] | null, pro: boolean) {
  return PAGES.filter((p) => areas.has(p.area) && (!p.module || mods === null || mods.includes(p.module)) && (!p.pro || pro));
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Guia sem IA: acha as telas mais parecidas com a pergunta. */
export function matchPages(text: string, pages: typeof PAGES, limit = 2) {
  const q = norm(text);
  return pages
    .map((p) => ({ p, score: p.words.reduce((a, w) => a + (q.includes(norm(w)) ? w.length : 0), 0) + (q.includes(norm(p.title.pt)) || q.includes(norm(p.title.es)) ? 5 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Texto curto que resume a ação para o botão de confirmação. */
export function describeAction(name: ToolName, input: Record<string, unknown>, ctx: { locale: Locale; money: (v: number) => string; productName?: string }): string {
  const T = (es: string, pt: string) => (ctx.locale === "pt" ? pt : es);
  const n = ctx.productName ?? String(input.productId ?? "");
  switch (name) {
    case "set_store_open":
      return input.open ? T("Abrir la tienda para pedidos online", "Abrir a loja para pedidos online") : T("Cerrar la tienda para pedidos online", "Fechar a loja para pedidos online");
    case "update_product": {
      const parts = [
        typeof input.price === "number" ? T(`precio ${ctx.money(input.price)}`, `preço ${ctx.money(input.price)}`) : null,
        typeof input.active === "boolean" ? (input.active ? T("activar", "ativar") : T("pausar", "pausar")) : null,
        typeof input.stock === "number" ? T(`stock ${input.stock}`, `estoque ${input.stock}`) : null,
      ].filter(Boolean);
      return T(`Cambiar «${n}»: `, `Alterar «${n}»: `) + parts.join(", ");
    }
    case "create_product":
      return T(`Crear producto «${input.name}» por ${ctx.money(Number(input.price))}`, `Criar produto «${input.name}» por ${ctx.money(Number(input.price))}`);
    case "update_order_status":
      return T(`Pedido #${input.number} → ${input.status}`, `Pedido #${input.number} → ${input.status}`);
    case "create_coupon":
      return T(`Crear cupón ${String(input.code).toUpperCase()} de ${input.percent}%`, `Criar cupom ${String(input.code).toUpperCase()} de ${input.percent}%`) + (input.days ? T(` por ${input.days} días`, ` por ${input.days} dias`) : "");
    case "start_flash_offer":
      return T(`Oferta relámpago: «${n}» por ${ctx.money(Number(input.price))} durante ${input.hours} h`, `Oferta relâmpago: «${n}» por ${ctx.money(Number(input.price))} durante ${input.hours} h`);
    case "add_courier":
      return T(`Registrar repartidor ${input.name} (${input.phone})`, `Cadastrar motoboy ${input.name} (${input.phone})`);
    case "update_banner":
      return input.title ? T(`Banner: «${input.title}»`, `Banner: «${input.title}»`) : T("Ocultar el banner", "Esconder o banner");
    default:
      return name;
  }
}
