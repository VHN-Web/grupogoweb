// Popula o banco com lojas de demonstração (uma por modelo) + planos da plataforma.
// Uso: npm run db:setup  (ou npm run db:seed)
// Senha de todos os painéis demo: demo1234
import "dotenv/config";
import { sealCredentials } from "../lib/secrets";
import { planToPt, withGrowthFeatures } from "../core/plans";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { hashPassword } from "@/lib/password";
import { createDb, type DB } from "./client";
import * as schema from "./schema";
import { provisionTenant } from "@/services/provision";
import type { ThemeId } from "@/core/themes";

type P = { name: string; desc?: string; price: number; ill?: string; stock?: number };
type Store = {
  slug: string;
  name: string;
  theme: ThemeId;
  color: string;
  tagline: string;
  address: string;
  banner: { tag?: string; title: string; subtitle?: string; highlight?: string; ill: string };
  menu: Record<string, P[]>;
  payments?: object;
  country?: "PY" | "BR";
  lat?: number;
  lng?: number;
  phone?: string;
};

const PAYMENTS_BR = {
  options: [
    { method: "PIX", provider: "pix_manual", enabled: true, currencies: ["BRL"] },
    { method: "CARD", provider: "mock_online", enabled: true, currencies: ["BRL"] },
    { method: "CASH", provider: "cash", enabled: true, currencies: ["BRL"] },
    { method: "TRANSFER", provider: "transfer_manual", enabled: false, currencies: ["BRL"] },
  ],
  pixKey: "suporte@goweboficial.com",
  pixHolder: "Demo GoWeb",
  credentials: {},
};

const PAYMENTS = {
  options: [
    { method: "CASH", provider: "cash", enabled: true, currencies: ["PYG", "USD", "BRL"] },
    { method: "CARD", provider: "mock_online", enabled: true, currencies: ["PYG", "USD"] },
    { method: "PIX", provider: "pix_manual", enabled: true, currencies: ["BRL"] },
    { method: "TRANSFER", provider: "transfer_manual", enabled: false, currencies: ["PYG"] },
  ],
  pixKey: "suporte@goweboficial.com",
  pixHolder: "Demo GoWeb",
  credentials: {},
};

const STORES: Store[] = [
  {
    slug: "demo",
    name: "La Esquina Burger",
    theme: "classic",
    color: "#EA580C",
    tagline: "Hamburguesas y lomitos",
    address: "Av. San Blas, Ciudad del Este",
    banner: { tag: "Nuevo", title: "Lomito completo", highlight: "Gs. 40.000", ill: "burger" },
    menu: {
      Hamburguesas: [
        { name: "Clásica", desc: "Carne 150g, queso, lechuga, tomate", price: 35000, ill: "burger" },
        { name: "Doble Bacon", desc: "2 carnes, cheddar, bacon crocante", price: 52000, ill: "burger" },
      ],
      Lomitos: [
        { name: "Lomito Árabe", desc: "Carne, ensalada y salsa de ajo", price: 30000 },
        { name: "Lomito Completo", desc: "Carne, jamón, queso, huevo", price: 40000 },
      ],
      Acompañamientos: [{ name: "Papas fritas", price: 15000, ill: "fries" }],
      Bebidas: [
        { name: "Coca-Cola 500ml", price: 9000, ill: "soda", stock: 24 },
        { name: "Agua mineral", price: 6000, stock: 2 },
      ],
    },
  },
  {
    slug: "brasa-burger",
    name: "Brasa Burger",
    theme: "burger",
    color: "#FFC20E",
    tagline: "Delivery 25–35 min",
    address: "Asunción",
    banner: { tag: "Promo de la semana", title: "Combo doble + papas", highlight: "Gs. 59.000", ill: "burger" },
    menu: {
      Hamburguesas: [
        { name: "Doble Brasa", desc: "2 carnes smash, cheddar, bacon", price: 52000, ill: "burger" },
        { name: "Clásica", desc: "Carne 150 g, queso, lechuga, tomate", price: 35000, ill: "burger" },
        { name: "Picante", desc: "Jalapeños, pepper jack, salsa chipotle", price: 45000, ill: "burger" },
      ],
      Papas: [{ name: "Papas Brasa", desc: "Con cheddar y verdeo", price: 18000, ill: "fries" }],
      Bebidas: [{ name: "Gaseosa 500 ml", desc: "Coca-Cola, Sprite o Fanta", price: 9000, ill: "soda", stock: 30 }],
      Postres: [{ name: "Brownie", desc: "Con helado de vainilla", price: 20000, ill: "cake" }],
    },
  },
  {
    slug: "nonna-lucia",
    name: "Nonna Lucía",
    theme: "restaurant",
    color: "#B5482F",
    tagline: "Cucina italiana",
    address: "Villa Morra, Asunción",
    banner: { title: "Pizza al horno de leña", subtitle: "Masa madre · fermentación 48 h", ill: "pizza" },
    menu: {
      Pizzas: [
        { name: "Margherita", desc: "Tomate, mozzarella, albahaca", price: 65000, ill: "pizza" },
        { name: "Diavola", desc: "Salame picante, mozzarella", price: 72000, ill: "pizza" },
      ],
      Pastas: [
        { name: "Tagliatelle al ragú", desc: "Pasta fresca, ragú de carne", price: 58000, ill: "pasta" },
        { name: "Ravioles de ricota", desc: "Salsa de tomate y albahaca", price: 55000, ill: "pasta" },
      ],
      Vinos: [{ name: "Copa de vino tinto", desc: "Malbec de la casa", price: 30000, ill: "wine" }],
      Postres: [{ name: "Tiramisú", price: 28000, ill: "cake" }],
    },
  },
  {
    slug: "cafe-morena",
    name: "Café Morena",
    theme: "cafe",
    color: "#4B2E1F",
    tagline: "Café de especialidad",
    address: "Encarnación",
    banner: { title: "Desayuno completo", subtitle: "Café + medialuna + jugo", highlight: "Gs. 39.000", ill: "coffee" },
    menu: {
      Cafés: [
        { name: "Flat white", desc: "Doble espresso y leche texturizada", price: 18000, ill: "coffee" },
        { name: "Capuccino", desc: "Espresso, leche y espuma", price: 17000, ill: "coffee" },
      ],
      Panadería: [
        { name: "Croissant", desc: "De manteca", price: 12000, ill: "croissant" },
        { name: "Medialuna rellena", desc: "Jamón y queso", price: 14000, ill: "croissant" },
      ],
      Dulces: [{ name: "Torta de chocolate", price: 22000, ill: "cake" }],
      Jugos: [{ name: "Jugo natural", desc: "Naranja o frutilla", price: 15000, ill: "juice" }],
    },
  },
  {
    slug: "kira",
    name: "KIRA",
    theme: "store",
    color: "#0E0E10",
    tagline: "Envío a todo Asunción",
    address: "Asunción",
    banner: { tag: "Primavera", title: "Nueva colección", highlight: "Ver todo →", ill: "dress" },
    menu: {
      Mujer: [
        { name: "Vestido Lía", desc: "Lino, talles S a L", price: 189000, ill: "dress", stock: 6 },
        { name: "Bolso Cuero", desc: "Cuero vacuno", price: 259000, ill: "bag", stock: 3 },
      ],
      Hombre: [{ name: "Remera Basic", desc: "Algodón peinado", price: 79000, ill: "tshirt", stock: 20 }],
      Calzados: [{ name: "Zapatilla Urban", desc: "Talles 36 a 44", price: 349000, ill: "sneaker", stock: 8 }],
    },
  },
  {
    slug: "lupulo",
    name: "Lúpulo",
    theme: "bar",
    color: "#F2A900",
    tagline: "Cervecería · Bar",
    address: "Ciudad del Este",
    banner: { title: "Happy hour", highlight: "2x1 en chopp · 18 a 21 h", ill: "beer" },
    menu: {
      Chopp: [
        { name: "Chopp IPA 500 ml", desc: "Amarga, cítrica · 6,2%", price: 25000, ill: "beer" },
        { name: "Chopp Rubia 500 ml", desc: "Suave y refrescante", price: 20000, ill: "beer" },
      ],
      Tragos: [{ name: "Gin tonic", desc: "Gin, tónica, limón", price: 35000, ill: "cocktail" }],
      Picadas: [{ name: "Nachos Lúpulo", desc: "Cheddar, guacamole, jalapeño", price: 38000, ill: "nachos" }],
    },
  },
  {
    slug: "navalha",
    name: "Barbearia Navalha",
    theme: "barber",
    color: "#D4A657",
    tagline: "Cortes clássicos · Barba · Toalha quente",
    address: "Rua XV de Novembro, Curitiba",
    country: "BR",
    lat: -25.4296,
    lng: -49.2713,
    phone: "+5541900000001",
    banner: { tag: "Desde 2012", title: "Corte + Barba", subtitle: "Com toalha quente e cerveja gelada", highlight: "R$ 79,90", ill: "razor" },
    payments: PAYMENTS_BR,
    menu: {
      Cortes: [
        { name: "Corte clássico", desc: "Tesoura e máquina, lavagem inclusa", price: 4990, ill: "scissors" },
        { name: "Degradê navalhado", desc: "Fade com acabamento na navalha", price: 5990, ill: "razor" },
        { name: "Corte infantil", desc: "Até 12 anos", price: 3990, ill: "comb" },
      ],
      Barba: [
        { name: "Barba completa", desc: "Toalha quente, navalha e balm", price: 3990, ill: "razor" },
        { name: "Corte + Barba", desc: "O combo da casa", price: 7990, ill: "scissors" },
      ],
      Produtos: [
        { name: "Pomada modeladora 120 g", desc: "Efeito matte, fixação média", price: 4500, ill: "pomade", stock: 14 },
        { name: "Óleo para barba 30 ml", desc: "Cedro e sândalo", price: 3900, ill: "cream", stock: 9 },
      ],
    },
  },
  {
    slug: "tecnoplus",
    name: "TecnoPlus",
    theme: "tech",
    color: "#22D3EE",
    tagline: "Informática · Celulares · Gamer",
    address: "Av. Monseñor Rodríguez, Ciudad del Este",
    banner: { tag: "Black week", title: "Notebooks con 15% off", highlight: "Desde Gs. 3.290.000", ill: "laptop" },
    menu: {
      Notebooks: [
        { name: "Notebook Pro 14\"", desc: "Ryzen 7, 16 GB RAM, SSD 512 GB", price: 5490000, ill: "laptop", stock: 5 },
        { name: "Notebook Air 13\"", desc: "Core i5, 8 GB, SSD 256 GB", price: 3290000, ill: "laptop", stock: 7 },
      ],
      Celulares: [
        { name: "Smartphone X12 128 GB", desc: "Pantalla AMOLED 6,5\"", price: 1890000, ill: "phone", stock: 12 },
        { name: "Smartphone Lite 64 GB", desc: "Batería 5000 mAh", price: 990000, ill: "phone", stock: 3 },
      ],
      Accesorios: [
        { name: "Auriculares Bluetooth ANC", desc: "Cancelación de ruido · 30 h", price: 420000, ill: "headphones", stock: 18 },
        { name: "Mouse gamer RGB", desc: "16.000 DPI, 7 botones", price: 185000, ill: "mouse", stock: 25 },
      ],
    },
  },
  {
    slug: "essenza",
    name: "Essenza",
    theme: "perfume",
    color: "#8C3B5A",
    tagline: "Perfumaria · Cosméticos",
    address: "Rua Oscar Freire, São Paulo",
    country: "BR",
    lat: -23.5617,
    lng: -46.6702,
    phone: "+5511900000002",
    banner: { tag: "Dia das Mães", title: "Kits presenteáveis", highlight: "até 30% off", ill: "perfume" },
    payments: PAYMENTS_BR,
    menu: {
      Perfumes: [
        { name: "Eau de Parfum Rosé 100 ml", desc: "Floral · rosa, peônia e almíscar", price: 38990, ill: "perfume", stock: 8 },
        { name: "Eau de Toilette Cedro 100 ml", desc: "Amadeirado · cedro e bergamota", price: 29990, ill: "perfume", stock: 6 },
      ],
      Maquiagem: [
        { name: "Batom matte Vinho", desc: "Longa duração", price: 5990, ill: "lipstick", stock: 30 },
        { name: "Batom cremoso Nude", desc: "Com manteiga de karité", price: 5490, ill: "lipstick", stock: 2 },
      ],
      Skincare: [{ name: "Hidratante facial 50 ml", desc: "Ácido hialurônico e vitamina C", price: 8990, ill: "cream", stock: 15 }],
    },
  },
  // ---------------- Brasil (português, R$ — preços em centavos)
  {
    slug: "burguer-da-praca",
    name: "Burguer da Praça",
    theme: "burger",
    color: "#FFC20E",
    tagline: "Entrega em 25–35 min",
    address: "Boa Viagem, Recife",
    country: "BR", lat: -8.1189, lng: -34.9006, phone: "+5581900000003",
    payments: PAYMENTS_BR,
    banner: { tag: "Promo da semana", title: "Combo duplo + batata", highlight: "R$ 39,90", ill: "burger" },
    menu: {
      Hambúrgueres: [
        { name: "Duplo Smash", desc: "2 carnes smash, cheddar e bacon", price: 3490, ill: "burger" },
        { name: "Clássico", desc: "Carne 150 g, queijo, alface e tomate", price: 2690, ill: "burger" },
        { name: "Apimentado", desc: "Jalapeño, pepper jack e molho chipotle", price: 3190, ill: "burger" },
      ],
      Porções: [{ name: "Batata da Praça", desc: "Com cheddar e cebolinha", price: 1890, ill: "fries" }],
      Bebidas: [{ name: "Refrigerante lata", desc: "Coca-Cola, Guaraná ou Sprite", price: 700, ill: "soda", stock: 40 }],
      Sobremesas: [{ name: "Brownie", desc: "Com sorvete de baunilha", price: 1590, ill: "cake" }],
    },
  },
  {
    slug: "cantina-da-nonna",
    name: "Cantina da Nonna",
    theme: "restaurant",
    color: "#B5482F",
    tagline: "Cozinha italiana",
    address: "Casa Forte, Recife",
    country: "BR", lat: -8.0346, lng: -34.9196, phone: "+5581900000004",
    payments: PAYMENTS_BR,
    banner: { title: "Pizza no forno a lenha", subtitle: "Massa de fermentação natural · 48 h", ill: "pizza" },
    menu: {
      Pizzas: [
        { name: "Margherita", desc: "Tomate, muçarela e manjericão", price: 5490, ill: "pizza" },
        { name: "Calabresa", desc: "Calabresa, cebola roxa e muçarela", price: 5890, ill: "pizza" },
      ],
      Massas: [
        { name: "Talharim à bolonhesa", desc: "Massa fresca com ragu de carne", price: 4890, ill: "pasta" },
        { name: "Ravióli de ricota", desc: "Molho de tomate e manjericão", price: 4590, ill: "pasta" },
      ],
      Vinhos: [{ name: "Taça de vinho tinto", desc: "Malbec da casa", price: 2400, ill: "wine" }],
      Sobremesas: [{ name: "Tiramisù", price: 2290, ill: "cake" }],
    },
  },
  {
    slug: "padaria-aurora",
    name: "Padaria Aurora",
    theme: "cafe",
    color: "#4B2E1F",
    tagline: "Café especial e pães artesanais",
    address: "Olinda",
    country: "BR", lat: -8.0089, lng: -34.8553, phone: "+5581900000005",
    payments: PAYMENTS_BR,
    banner: { title: "Café da manhã completo", subtitle: "Café + croissant + suco", highlight: "R$ 24,90", ill: "coffee" },
    menu: {
      Cafés: [
        { name: "Espresso", desc: "Grãos especiais do Cerrado Mineiro", price: 690, ill: "coffee" },
        { name: "Cappuccino", desc: "Com canela e cacau", price: 1190, ill: "coffee" },
      ],
      Padaria: [
        { name: "Croissant de manteiga", price: 990, ill: "croissant" },
        { name: "Pão de queijo (6 un.)", price: 1290, ill: "croissant" },
      ],
      Doces: [{ name: "Bolo de rolo (fatia)", desc: "Receita pernambucana", price: 1190, ill: "cake" }],
      Sucos: [{ name: "Suco de laranja", desc: "Natural, 400 ml", price: 990, ill: "juice" }],
    },
  },
  {
    slug: "kira-br",
    name: "KIRA",
    theme: "store",
    color: "#0E0E10",
    tagline: "Frete grátis acima de R$ 299",
    address: "Recife",
    country: "BR", lat: -8.0476, lng: -34.877, phone: "+5581900000006",
    payments: PAYMENTS_BR,
    banner: { tag: "Primavera", title: "Nova coleção", highlight: "Ver tudo →", ill: "dress" },
    menu: {
      Feminino: [
        { name: "Vestido Lia", desc: "Linho, tamanhos P a G", price: 18990, ill: "dress", stock: 6 },
        { name: "Bolsa de couro", desc: "Couro legítimo", price: 25990, ill: "bag", stock: 3 },
      ],
      Masculino: [{ name: "Camiseta Basic", desc: "Algodão penteado", price: 7990, ill: "tshirt", stock: 20 }],
      Calçados: [{ name: "Tênis Urban", desc: "Numeração 34 a 44", price: 34990, ill: "sneaker", stock: 8 }],
    },
  },
  {
    slug: "boteco-lupulo",
    name: "Boteco Lúpulo",
    theme: "bar",
    color: "#F2A900",
    tagline: "Cervejaria · Petiscos",
    address: "Recife Antigo",
    country: "BR", lat: -8.0631, lng: -34.8711, phone: "+5581900000007",
    payments: PAYMENTS_BR,
    banner: { title: "Happy hour", highlight: "Chopp em dobro · 18h às 21h", ill: "beer" },
    menu: {
      Chopp: [
        { name: "Chopp IPA 500 ml", desc: "Amargo e cítrico · 6,2%", price: 2290, ill: "beer" },
        { name: "Chopp Pilsen 500 ml", desc: "Leve e refrescante", price: 1690, ill: "beer" },
      ],
      Drinks: [{ name: "Caipirinha", desc: "Cachaça, limão e açúcar", price: 2490, ill: "cocktail" }],
      Petiscos: [{ name: "Nachos do Boteco", desc: "Cheddar, guacamole e jalapeño", price: 3490, ill: "nachos" }],
    },
  },
  {
    slug: "byte-store",
    name: "Byte Store",
    theme: "tech",
    color: "#22D3EE",
    tagline: "Informática · Celulares · Games",
    address: "Shopping Recife",
    country: "BR", lat: -8.1185, lng: -34.9049, phone: "+5581900000008",
    payments: PAYMENTS_BR,
    banner: { tag: "Black Friday", title: "Notebooks com 15% off", highlight: "A partir de R$ 2.999", ill: "laptop" },
    menu: {
      Notebooks: [
        { name: "Notebook Pro 14\"", desc: "Ryzen 7, 16 GB RAM, SSD 512 GB", price: 459900, ill: "laptop", stock: 5 },
        { name: "Notebook Air 13\"", desc: "Core i5, 8 GB, SSD 256 GB", price: 299900, ill: "laptop", stock: 7 },
      ],
      Celulares: [
        { name: "Smartphone X12 128 GB", desc: "Tela AMOLED 6,5\"", price: 189900, ill: "phone", stock: 12 },
        { name: "Smartphone Lite 64 GB", desc: "Bateria 5000 mAh", price: 99900, ill: "phone", stock: 3 },
      ],
      Acessórios: [
        { name: "Fone Bluetooth ANC", desc: "Cancelamento de ruído · 30 h", price: 39900, ill: "headphones", stock: 18 },
        { name: "Mouse gamer RGB", desc: "16.000 DPI, 7 botões", price: 14990, ill: "mouse", stock: 25 },
      ],
    },
  },
  // ---------------- Paraguai: versões dos novos modelos
  {
    slug: "barberia-filo",
    name: "Barbería Filo",
    theme: "barber",
    color: "#D4A657",
    tagline: "Cortes clásicos · Barba · Toalla caliente",
    address: "Villa Morra, Asunción",
    banner: { tag: "Desde 2015", title: "Corte + Barba", subtitle: "Con toalla caliente y cerveza fría", highlight: "Gs. 90.000", ill: "razor" },
    menu: {
      Cortes: [
        { name: "Corte clásico", desc: "Tijera y máquina, lavado incluido", price: 60000, ill: "scissors" },
        { name: "Degradé a navaja", desc: "Fade con terminación a navaja", price: 70000, ill: "razor" },
      ],
      Barba: [{ name: "Barba completa", desc: "Toalla caliente, navaja y bálsamo", price: 45000, ill: "razor" }],
      Productos: [{ name: "Pomada modeladora 120 g", desc: "Efecto mate", price: 55000, ill: "pomade", stock: 14 }],
    },
  },
  {
    slug: "esencia",
    name: "Esencia",
    theme: "perfume",
    color: "#8C3B5A",
    tagline: "Perfumería · Cosméticos",
    address: "Ciudad del Este",
    banner: { tag: "Día de la Madre", title: "Kits de regalo", highlight: "hasta 30% off", ill: "perfume" },
    menu: {
      Perfumes: [
        { name: "Eau de Parfum Rosé 100 ml", desc: "Floral · rosa, peonía y almizcle", price: 520000, ill: "perfume", stock: 8 },
        { name: "Eau de Toilette Cedro 100 ml", desc: "Amaderado · cedro y bergamota", price: 410000, ill: "perfume", stock: 6 },
      ],
      Maquillaje: [{ name: "Labial mate Vino", desc: "Larga duración", price: 85000, ill: "lipstick", stock: 30 }],
      Skincare: [{ name: "Crema facial 50 ml", desc: "Ácido hialurónico y vitamina C", price: 130000, ill: "cream", stock: 15 }],
    },
  },
];

async function seedStore(db: DB, s: Store) {
  const tenant = await provisionTenant(db, { name: s.name, slug: s.slug, password: "demo1234", theme: s.theme, primaryColor: s.color, tables: 8, lat: s.lat ?? -25.5097, lng: s.lng ?? -54.6111, country: s.country ?? "PY" });
  const br = s.country === "BR";
  await db
    .update(schema.tenants)
    .set({
      isOpen: true,
      tagline: s.tagline,
      address: s.address,
      phone: s.phone ?? "+595900000000",
      deliveryFreeOverPyg: br ? 15000 : 200000,
      bannerTag: s.banner.tag ?? null,
      bannerTitle: s.banner.title,
      bannerSubtitle: s.banner.subtitle ?? null,
      bannerHighlight: s.banner.highlight ?? null,
      bannerIllustration: s.banner.ill,
      paymentConfig: JSON.stringify(s.payments ?? PAYMENTS),
    })
    .where(eq(schema.tenants.id, tenant.id));
  let order = 1;
  for (const [cat, items] of Object.entries(s.menu)) {
    const [c] = await db.insert(schema.categories).values({ tenantId: tenant.id, name: cat, sortOrder: order++ }).returning();
    await db.insert(schema.products).values(
      items.map((p, i) => ({
        tenantId: tenant.id,
        categoryId: c.id,
        name: p.name,
        description: p.desc ?? null,
        pricePyg: p.price,
        illustration: p.ill ?? null,
        trackStock: p.stock != null,
        stock: p.stock ?? 0,
        sortOrder: i,
      })),
    );
  }
  return tenant;
}

// ---------------- GoInteligence: plano e dados de demonstração (idempotente — roda a cada deploy)
const GOI_FEATURES = [
  "Todo del plan Mensual",
  "Sugerencias inteligentes de venta",
  "Carritos abandonados + cupones",
  "Ofertas relámpago",
  "Agenda con confirmación por WhatsApp",
  "Equipo con login y permisos",
  "Informe de cierre de caja por e-mail/WhatsApp",
].join("\n");

async function ensureGoInteligencePlan(db: DB) {
  const has = await db.query.plans.findFirst({ where: eq(schema.plans.intelligence, true) });
  if (has) return;
  await db.insert(schema.plans).values({
    name: "GoInteligence",
    interval: "MONTHLY",
    pricePyg: 450000,
    priceUsdMinor: 6500,
    priceBrlMinor: 29900,
    setupPyg: 500000,
    setupUsdMinor: 7000,
    setupBrlMinor: 35000,
    includesDomain: false,
    intelligence: true,
    features: GOI_FEATURES,
    sortOrder: 3,
  });
}

const BARBER_SLUGS = ["navalha", "barberia-filo"];

/** Segurança: criptografa tokens de gateway que ainda estejam em texto puro. */
async function sealStoredCredentials(db: DB) {
  const all = await db.query.tenants.findMany({ columns: { id: true, paymentConfig: true } });
  for (const t of all) {
    try {
      const cfg = JSON.parse(t.paymentConfig || "{}") as { credentials?: Record<string, Record<string, string>> };
      if (!cfg.credentials) continue;
      let changed = false;
      for (const [k, v] of Object.entries(cfg.credentials)) {
        const sealed = sealCredentials(v ?? {});
        if (JSON.stringify(sealed) !== JSON.stringify(v)) {
          cfg.credentials[k] = sealed;
          changed = true;
        }
      }
      if (changed) await db.update(schema.tenants).set({ paymentConfig: JSON.stringify(cfg) }).where(eq(schema.tenants.id, t.id));
    } catch {}
  }
}

/** Admin em português: nomes e recursos dos planos cadastrados em espanhol passam para PT (o site do Paraguai traduz de volta). */
async function plansToPortuguese(db: DB) {
  for (const p of await db.query.plans.findMany()) {
    const pt = planToPt(p);
    if (pt.name !== p.name || pt.features !== p.features) await db.update(schema.plans).set(pt).where(eq(schema.plans.id, p.id));
  }
}

/** Crescimento: base ganha carteira/origem/kit/SEO (+ avaliações e vitrine opcionais); GoInteligence ganha campanhas, indicação, fidelidade e aniversário. */
async function growthPlanFeatures(db: DB) {
  for (const p of await db.query.plans.findMany({ where: eq(schema.plans.isCustom, false) })) {
    const next = withGrowthFeatures(p.features, p.intelligence);
    if (next !== (p.features ?? "")) await db.update(schema.plans).set({ features: next }).where(eq(schema.plans.id, p.id));
  }
}

async function demoExtras(db: DB) {
  await sealStoredCredentials(db);
  await plansToPortuguese(db);
  await growthPlanFeatures(db);
  const demos = await db.query.tenants.findMany({ where: inArray(schema.tenants.slug, STORES.map((s) => s.slug)) });
  for (const t of demos) {
    const pt = t.country === "BR";
    // Contatos SEMPRE fictícios nas demos (nunca número/perfil de pessoa real) — os botões não abrem nada
    const idx = String(demos.indexOf(t) + 1).padStart(2, "0");
    const fakePhone = pt ? `+55819000000${idx}` : `+5959000000${idx}`;
    await db
      .update(schema.tenants)
      .set({
        demo: true, tier: "pro", phone: fakePhone, whatsapp: fakePhone, instagram: pt ? "sualoja" : "tutienda", reportTo: null, reportChannel: "none",
        // chave Pix de exemplo (nada de chave/nome de pessoa real nem a marca antiga)
        paymentConfig: (() => {
          try {
            const cfg = JSON.parse(t.paymentConfig || "{}");
            return JSON.stringify({ ...cfg, pixKey: "pix@exemplo.com.br", pixHolder: pt ? "Loja de exemplo" : "Tienda de ejemplo" });
          } catch {
            return t.paymentConfig;
          }
        })(),
      })
      .where(eq(schema.tenants.id, t.id));
    // cupom de boas-vindas
    const code = pt ? "BEMVINDO10" : "BIENVENIDO10";
    const c = await db.query.coupons.findFirst({ where: and(eq(schema.coupons.tenantId, t.id), eq(schema.coupons.code, code)) });
    if (!c) await db.insert(schema.coupons).values({ tenantId: t.id, code, kind: "PERCENT", value: 10 });
    // oferta relâmpago sempre ativa nas demos (renova a cada deploy)
    const prods = await db.query.products.findMany({ where: eq(schema.products.tenantId, t.id) });
    const offer = prods.find((p) => !p.durationMin && p.promoEndsAt && p.promoEndsAt > new Date());
    if (!offer) {
      const target = BARBER_SLUGS.includes(t.slug) ? prods.find((p) => /pomad/i.test(p.name)) : prods[0];
      if (target) {
        const step = t.currency === "PYG" ? 1000 : 10;
        const promo = Math.floor((target.pricePyg * 0.8) / step) * step;
        await db.update(schema.products).set({ promoPricePyg: promo, promoEndsAt: new Date(Date.now() + 5 * 864e5) }).where(eq(schema.products.id, target.id));
      }
    }
    // barbearias: agenda ativa e serviços com duração
    if (BARBER_SLUGS.includes(t.slug)) {
      const cfg = JSON.parse(t.bookingConfig || "{}");
      if (!cfg.enabled) {
        await db
          .update(schema.tenants)
          .set({ bookingConfig: JSON.stringify({ enabled: true, slotMin: 30, leadMin: 60, daysAhead: 14, hours: ["", "09:00-19:00", "09:00-19:00", "09:00-19:00", "09:00-20:00", "09:00-20:00", "08:00-14:00"] }) })
          .where(eq(schema.tenants.id, t.id));
      }
      for (const p of prods) {
        if (p.durationMin || /pomad|óleo|aceite|oleo/i.test(p.name)) continue;
        const d = /barba \+|\+ barba|combo/i.test(p.name) ? 60 : /barba/i.test(p.name) ? 30 : /infantil/i.test(p.name) ? 30 : 40;
        await db.update(schema.products).set({ durationMin: d }).where(eq(schema.products.id, p.id));
      }
    }
    // funcionário de exemplo
    const st = await db.query.staff.findFirst({ where: eq(schema.staff.tenantId, t.id) });
    if (!st) {
      await db.insert(schema.staff).values({
        tenantId: t.id,
        name: pt ? "Caixa (demo)" : "Caja (demo)",
        username: pt ? "caixa" : "caja",
        passwordHash: hashPassword("demo1234"),
        permissions: JSON.stringify(["orders", "cash", "agenda"]),
      });
    }
  }
}

async function main() {
  const db = createDb();
  // --if-empty: usado no deploy — só cria as lojas demo se o banco ainda não tiver nenhum estabelecimento
  // Rebrand Atlas -> GoWeb em bancos já existentes (idempotente)
  await db
    .update(schema.platformSettings)
    .set({ companyName: "GoWeb" })
    .where(eq(schema.platformSettings.companyName, "Atlas"));
  await db
    .update(schema.platformSettings)
    .set({ supportEmail: "suporte@goweboficial.com" })
    .where(isNull(schema.platformSettings.supportEmail));

  // --if-empty (deploy): NÃO apaga nada; só cria as lojas demo que ainda não existem.
  if (process.argv.includes("--if-empty")) {
    const existing = new Set((await db.query.tenants.findMany({ columns: { slug: true } })).map((t) => t.slug));
    if (existing.size > 0) {
      const missing = STORES.filter((s) => !existing.has(s.slug));
      for (const s of missing) await seedStore(db, s);
      await ensureGoInteligencePlan(db);
      await demoExtras(db);
      console.log(missing.length ? `Lojas demo adicionadas: ${missing.map((s) => s.slug).join(", ")}` : "Banco já tem dados — seed ignorado.");
      process.exit(0);
    }
  }
  const slugs = STORES.map((s) => s.slug);
  await db.delete(schema.customers).where(eq(schema.customers.email, "demo@example.com"));
  await db.delete(schema.tenants).where(inArray(schema.tenants.slug, slugs));

  const tenants = [];
  for (const s of STORES) tenants.push(await seedStore(db, s));

  // ---------- Plataforma: configurações, planos e o demo como cliente ativo
  await db
    .insert(schema.platformSettings)
    .values({
      id: "default",
      companyName: "GoWeb",
      supportEmail: "suporte@goweboficial.com",
      // Em dev tudo usa o gateway SIMULADO. Em produção troque BRL para "mercadopago" em /admin/config.
      gatewayByCurrency: JSON.stringify({ PYG: "mock", USD: "mock", BRL: "mock" }),
      manualInstructions: "Pix ou transferência para a conta da GoWeb.\nEnvie o comprovante pelo WhatsApp do suporte.",
    })
    .onConflictDoNothing();

  if ((await db.query.plans.findMany()).length === 0) {
    await db.insert(schema.plans).values([
      {
        name: "Mensual",
        interval: "MONTHLY",
        pricePyg: 250000, priceUsdMinor: 3500, priceBrlMinor: 17900,
        setupPyg: 500000, setupUsdMinor: 7000, setupBrlMinor: 35000,
        includesDomain: false,
        features: "Menú QR y pedidos ilimitados\nCaja, stock y comprobantes\nPagos en Gs., US$ y R$\nDominio propio opcional (adicional)",
        sortOrder: 1,
      },
      {
        name: "Anual Completo",
        interval: "YEARLY",
        pricePyg: 2500000, priceUsdMinor: 35000, priceBrlMinor: 179000,
        setupPyg: 500000, setupUsdMinor: 7000, setupBrlMinor: 35000,
        includesDomain: true,
        features: "100% de las funciones\nImplementación prioritaria\nSoporte por WhatsApp",
        sortOrder: 2,
      },
    ]);
  }
  await ensureGoInteligencePlan(db);
  await demoExtras(db);
  const monthly = (await db.query.plans.findMany()).find((p) => p.interval === "MONTHLY" && !p.intelligence)!;
  const now = new Date();
  await db.insert(schema.customers).values({
    businessName: "La Esquina Burger",
    contactName: "Dueño Demo",
    email: "demo@example.com",
    desiredSlug: "demo",
    planId: monthly.id,
    status: "ACTIVE",
    tenantId: tenants[0].id,
    deliveredAt: now,
    nextBillingAt: new Date(now.getTime() + 20 * 864e5),
  });

  const table = await db.query.diningTables.findFirst({ where: eq(schema.diningTables.tenantId, tenants[1].id) });
  console.log(`\n✅ Lojas demo criadas (senha dos painéis: demo1234):`);
  for (const s of STORES) console.log(`   http://localhost:3000/${s.slug}   painel: /painel/${s.slug}`);
  console.log(`   Exemplo de mesa: http://localhost:3000/brasa-burger?mesa=${table?.code}  (${table?.label})`);
  console.log(`   Página de vendas: http://localhost:3000`);
  console.log(`   Admin da plataforma: http://localhost:3000/admin  (senha: PLATFORM_ADMIN_PASSWORD do .env)\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
