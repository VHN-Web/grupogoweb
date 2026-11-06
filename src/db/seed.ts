// Popula o banco com lojas de demonstração (uma por modelo) + planos da plataforma.
// Uso: npm run db:setup  (ou npm run db:seed)
// Senha de todos os painéis demo: demo1234
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
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
  pixKey: "demo@atlas.app",
  pixHolder: "Demo Atlas",
  credentials: {},
};

const PAYMENTS = {
  options: [
    { method: "CASH", provider: "cash", enabled: true, currencies: ["PYG", "USD", "BRL"] },
    { method: "CARD", provider: "mock_online", enabled: true, currencies: ["PYG", "USD"] },
    { method: "PIX", provider: "pix_manual", enabled: true, currencies: ["BRL"] },
    { method: "TRANSFER", provider: "transfer_manual", enabled: false, currencies: ["PYG"] },
  ],
  pixKey: "demo@atlas.com.py",
  pixHolder: "Demo Atlas",
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
    phone: "+5541991234567",
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
    phone: "+5511987654321",
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
      phone: s.phone ?? "+595981000000",
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

async function main() {
  const db = createDb();
  // --if-empty: usado no deploy — só cria as lojas demo se o banco ainda não tiver nenhum estabelecimento
  // --if-empty (deploy): NÃO apaga nada; só cria as lojas demo que ainda não existem.
  if (process.argv.includes("--if-empty")) {
    const existing = new Set((await db.query.tenants.findMany({ columns: { slug: true } })).map((t) => t.slug));
    if (existing.size > 0) {
      const missing = STORES.filter((s) => !existing.has(s.slug));
      for (const s of missing) await seedStore(db, s);
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
      companyName: "Atlas",
      // Em dev tudo usa o gateway SIMULADO. Em produção troque BRL para "mercadopago" em /admin/config.
      gatewayByCurrency: JSON.stringify({ PYG: "mock", USD: "mock", BRL: "mock" }),
      manualInstructions: "Transferencia: Banco XXXX · Cuenta 000000 · Titular Atlas\nEnviá el comprobante por WhatsApp.",
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
  const monthly = (await db.query.plans.findMany()).find((p) => p.interval === "MONTHLY")!;
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
