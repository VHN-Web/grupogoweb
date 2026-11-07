// Assistente do painel: conversa com o lojista, leva até a tela certa e, quando pedido,
// prepara ações dentro do que o plano e o acesso dele permitem. Toda ação só acontece depois
// que a pessoa toca em "Confirmar" (o pedido de ação vai assinado e criptografado ao navegador).
import "server-only";
import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, ilike, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { aiConfigured, chat, type AiBlock, type AiMessage } from "@/adapters/ai/anthropic";
import { allowedPages, allowedTools, describeAction, matchPages, type Locale, type ToolName } from "@/core/assistant";
import { MODULE_INFO, MODULES, parseModules } from "@/core/modules";
import { formatMoney, parseMajorToMinor } from "@/core/money";
import { getRegion, isValidE164, isValidName, sanitizePhone, PHONE_RULES } from "@/core/region";
import { normalizeCode } from "@/core/intelligence";
import type { Currency, OrderStatus } from "@/core/types";
import type { PanelAccess } from "@/lib/auth";
import { audit } from "@/lib/security";
import { openSecret, sealSecret } from "@/lib/secrets";
import { setOrderStatus } from "./orders";

export const assistantEnabled = () => true; // guia sempre; IA quando houver chave

export type Reply = { text: string; links: { label: string; href: string }[]; pending: { token: string; summary: string }[]; ai: boolean };

function ctx(acc: PanelAccess) {
  const t = acc.tenant;
  const locale = getRegion(t.country).locale as Locale;
  const cur = t.currency as Currency;
  const mods = parseModules(t.modules);
  const pro = t.tier === "pro";
  return { t, locale, cur, mods, pro, T: (es: string, pt: string) => (locale === "pt" ? pt : es), money: (major: number) => formatMoney(Math.round(major * (cur === "PYG" ? 1 : 100)), cur) };
}

/** Guia sem IA: aponta as telas certas. */
function guide(acc: PanelAccess, text: string): Reply {
  const c = ctx(acc);
  const pages = allowedPages(acc.areas, c.mods, c.pro);
  const hits = matchPages(text, pages);
  const base = `/painel/${c.t.slug}`;
  if (!hits.length)
    return {
      ai: false,
      text: c.T("Puedo llevarte a cualquier parte del panel. Probá preguntar, por ejemplo: «¿cómo cambio un precio?», «¿dónde imprimo el QR de las mesas?» o «¿cómo creo un cupón?».", "Posso te levar a qualquer parte do painel. Tente perguntar, por exemplo: «como mudo um preço?», «onde imprimo o QR das mesas?» ou «como crio um cupom?»."),
      links: [],
      pending: [],
    };
  return {
    ai: false,
    text: hits.map((p) => `${c.locale === "pt" ? p.title.pt : p.title.es}: ${c.locale === "pt" ? p.help.pt : p.help.es}`).join("\n\n"),
    links: hits.map((p) => ({ label: c.locale === "pt" ? p.title.pt : p.title.es, href: base + p.href })),
    pending: [],
  };
}

function systemPrompt(acc: PanelAccess) {
  const c = ctx(acc);
  const pages = allowedPages(acc.areas, c.mods, c.pro);
  const missing = c.mods === null ? [] : MODULES.filter((m) => !c.mods!.includes(m)).map((m) => MODULE_INFO[m].pt);
  return [
    `Você é o assistente do painel GoWeb da loja "${c.t.name}". Responda SEMPRE em ${c.locale === "pt" ? "português do Brasil" : "espanhol do Paraguai"}, em frases curtas e simples, sem emojis.`,
    `Quem fala com você é ${acc.role === "staff" ? `um funcionário (${acc.staffName})` : "o dono da loja"}. Moeda da loja: ${c.cur}. Plano: ${c.pro ? "com GoInteligence" : "sem GoInteligence"}.`,
    "Telas que esta pessoa pode usar (id — título — o que faz):",
    ...pages.map((p) => `- ${p.id} — ${p.title.pt} — ${p.help.pt}`),
    missing.length ? `Módulos que a loja NÃO contratou (diga que pode adicionar em Meu plano): ${missing.join(", ")}.` : "",
    "Regras:",
    "- Para ensinar a usar algo, explique em até 3 passos e use go_to_page para mostrar o botão da tela.",
    "- Para fazer algo, use a ferramenta certa. As ações NÃO são feitas na hora: a pessoa confirma num botão. Diga isso em uma frase curta.",
    "- Antes de alterar um produto, use find_products para achar o id certo. Se houver mais de um parecido, pergunte qual.",
    "- Preços em unidades da moeda (ex.: 25.90 em reais; em guaranis, número inteiro).",
    "- Se pedirem algo fora das ferramentas e telas listadas, diga que não está disponível no plano/acesso atual e, se for um módulo não contratado, indique Meu plano.",
    "- Nunca invente números de vendas: use sales_summary. Não fale de assuntos fora da loja.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ----------------------------------------------------------------- ferramentas de leitura
async function readTool(acc: PanelAccess, name: ToolName, input: Record<string, unknown>, out: Reply): Promise<string> {
  const c = ctx(acc);
  const base = `/painel/${c.t.slug}`;
  if (name === "go_to_page") {
    const p = allowedPages(acc.areas, c.mods, c.pro).find((x) => x.id === input.page);
    if (!p) return "Tela indisponível para esta pessoa.";
    if (!out.links.some((l) => l.href === base + p.href)) out.links.push({ label: c.locale === "pt" ? p.title.pt : p.title.es, href: base + p.href });
    return `Botão para ${p.title.pt} mostrado.`;
  }
  if (name === "sales_summary") {
    const days = [1, 7, 30].includes(Number(input.days)) ? Number(input.days) : 1;
    const since = new Date(Date.now() - days * 864e5);
    const os = await db.query.orders.findMany({ where: and(eq(schema.orders.tenantId, c.t.id), gte(schema.orders.createdAt, since)), columns: { totalPyg: true, status: true, paymentStatus: true } });
    const ok = os.filter((o) => o.status !== "CANCELLED");
    const sum = (l: typeof ok) => formatMoney(l.reduce((a, o) => a + o.totalPyg, 0), c.cur);
    return JSON.stringify({ dias: days, pedidos: ok.length, cancelados: os.length - ok.length, vendido: sum(ok), recebido: sum(ok.filter((o) => o.paymentStatus === "PAID")), a_receber: sum(ok.filter((o) => o.paymentStatus !== "PAID")) });
  }
  if (name === "find_products") {
    const q = String(input.query ?? "").trim().slice(0, 60);
    const ps = await db.query.products.findMany({
      where: q ? and(eq(schema.products.tenantId, c.t.id), ilike(schema.products.name, `%${q.replace(/[%_]/g, "")}%`)) : eq(schema.products.tenantId, c.t.id),
      columns: { id: true, name: true, pricePyg: true, active: true, stock: true, trackStock: true },
      limit: 15,
    });
    return JSON.stringify(ps.map((p) => ({ id: p.id, nome: p.name, preco: formatMoney(p.pricePyg, c.cur), ativo: p.active, estoque: p.trackStock ? p.stock : "sem controle" })));
  }
  if (name === "open_orders") {
    const os = await db.query.orders.findMany({
      where: and(eq(schema.orders.tenantId, c.t.id), inArray(schema.orders.status, ["RECEIVED", "PREPARING", "READY", "OUT_FOR_DELIVERY"])),
      columns: { number: true, customerName: true, status: true, totalPyg: true, type: true },
      orderBy: desc(schema.orders.createdAt),
      limit: 20,
    });
    return JSON.stringify(os.map((o) => ({ numero: o.number, cliente: o.customerName, status: o.status, tipo: o.type, total: formatMoney(o.totalPyg, c.cur) })));
  }
  return "Ferramenta desconhecida.";
}

// ----------------------------------------------------------------- ações (com confirmação)
type Pending = { v: 1; tenantId: string; who: string; tool: ToolName; input: Record<string, unknown>; exp: number };

async function prepareAction(acc: PanelAccess, who: string, name: ToolName, input: Record<string, unknown>, out: Reply): Promise<string> {
  const c = ctx(acc);
  let productName: string | undefined;
  if (input.productId) {
    const p = await db.query.products.findFirst({ where: and(eq(schema.products.id, String(input.productId)), eq(schema.products.tenantId, c.t.id)), columns: { name: true } });
    if (!p) return "Produto não encontrado. Use find_products para pegar o id.";
    productName = p.name;
  }
  const summary = describeAction(name, input, { locale: c.locale, money: c.money, productName });
  const token = sealSecret(JSON.stringify({ v: 1, tenantId: c.t.id, who, tool: name, input, exp: Date.now() + 10 * 60_000 } satisfies Pending));
  out.pending.push({ token, summary });
  return `Ação preparada e aguardando o botão Confirmar: ${summary}`;
}

export async function runAssistant(acc: PanelAccess, who: string, history: { role: "user" | "assistant"; text: string }[]): Promise<Reply> {
  const last = history.at(-1)?.text ?? "";
  if (!aiConfigured()) return guide(acc, last);
  const c = ctx(acc);
  const tools = allowedTools(acc.areas, c.mods, c.pro);
  const out: Reply = { text: "", links: [], pending: [], ai: true };
  const messages: AiMessage[] = history.slice(-12).map((m) => ({ role: m.role, content: m.text.slice(0, 2000) }));
  try {
    for (let step = 0; step < 5; step++) {
      const r = await chat({ system: systemPrompt(acc), messages, tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })) });
      const texts = r.content.filter((b): b is Extract<AiBlock, { type: "text" }> => b.type === "text").map((b) => b.text);
      if (texts.length) out.text = [out.text, ...texts].filter(Boolean).join("\n\n");
      const uses = r.content.filter((b): b is Extract<AiBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || !uses.length) break;
      messages.push({ role: "assistant", content: r.content });
      const results: AiBlock[] = [];
      for (const u of uses) {
        const def = tools.find((t) => t.name === u.name);
        let content: string;
        if (!def) content = "Ferramenta não permitida para esta pessoa/plano.";
        else content = def.action ? await prepareAction(acc, who, def.name, u.input ?? {}, out) : await readTool(acc, def.name, u.input ?? {}, out);
        results.push({ type: "tool_result", tool_use_id: u.id, content });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    console.error("[assistant]", e);
    const g = guide(acc, last);
    return { ...g, text: c.T("El asistente inteligente no respondió ahora. Mientras tanto:\n\n", "O assistente inteligente não respondeu agora. Enquanto isso:\n\n") + g.text };
  }
  if (!out.text) out.text = out.pending.length ? c.T("Revisá y confirmá abajo.", "Confira e confirme abaixo.") : c.T("Listo.", "Pronto.");
  return out;
}

/** Executa a ação confirmada — revalida tudo (loja, validade, permissão, plano) antes de mexer. */
export async function confirmAction(acc: PanelAccess, who: string, token: string): Promise<{ ok: boolean; message: string }> {
  const c = ctx(acc);
  let p: Pending;
  try {
    p = JSON.parse(openSecret(token));
  } catch {
    return { ok: false, message: c.T("Acción inválida.", "Ação inválida.") };
  }
  if (p.v !== 1 || p.tenantId !== c.t.id || p.who !== who) return { ok: false, message: c.T("Acción inválida.", "Ação inválida.") };
  if (p.exp < Date.now()) return { ok: false, message: c.T("Esta confirmación venció. Pedí de nuevo.", "Esta confirmação expirou. Peça de novo.") };
  const def = allowedTools(acc.areas, c.mods, c.pro).find((t) => t.name === p.tool && t.action);
  if (!def) return { ok: false, message: c.T("No disponible en tu plan o acceso.", "Não disponível no seu plano ou acesso.") };
  const i = p.input;
  const t = c.t;
  const minor = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 ? parseMajorToMinor(String(v), c.cur) : null);
  const done = async (action: string, detail: string, msg: string) => {
    await audit(t.id, `${who} (assistente)`, action, detail);
    revalidatePath(`/painel/${t.slug}`, "layout");
    revalidatePath(`/${t.slug}`);
    return { ok: true, message: msg };
  };
  const fail = (es: string, pt: string) => ({ ok: false, message: c.T(es, pt) });

  switch (p.tool) {
    case "set_store_open": {
      await db.update(schema.tenants).set({ isOpen: !!i.open }).where(eq(schema.tenants.id, t.id));
      return done("store.toggle", i.open ? "aberta" : "fechada", i.open ? c.T("Tienda abierta.", "Loja aberta.") : c.T("Tienda cerrada.", "Loja fechada."));
    }
    case "update_product": {
      const prod = await db.query.products.findFirst({ where: and(eq(schema.products.id, String(i.productId)), eq(schema.products.tenantId, t.id)) });
      if (!prod) return fail("Producto no encontrado.", "Produto não encontrado.");
      const set: Partial<typeof schema.products.$inferInsert> = {};
      if (i.price !== undefined) {
        const v = minor(i.price);
        if (!v) return fail("Precio inválido.", "Preço inválido.");
        set.pricePyg = v;
      }
      if (typeof i.active === "boolean") set.active = i.active;
      if (typeof i.stock === "number" && Number.isInteger(i.stock) && i.stock >= 0) set.stock = i.stock;
      if (!Object.keys(set).length) return fail("Nada para cambiar.", "Nada para alterar.");
      await db.update(schema.products).set(set).where(eq(schema.products.id, prod.id));
      return done("product.update", prod.name, c.T(`«${prod.name}» actualizado.`, `«${prod.name}» atualizado.`));
    }
    case "create_product": {
      const name = String(i.name ?? "").trim().slice(0, 80);
      const v = minor(i.price);
      if (name.length < 2 || !v) return fail("Nombre o precio inválido.", "Nome ou preço inválido.");
      await db.insert(schema.products).values({ tenantId: t.id, name, description: i.description ? String(i.description).slice(0, 300) : null, pricePyg: v, active: true });
      return done("product.create", name, c.T(`Producto «${name}» creado. Podés agregar foto en Productos.`, `Produto «${name}» criado. Você pode colocar foto em Produtos.`));
    }
    case "update_order_status": {
      const num = String(i.number ?? "").replace(/\D/g, "");
      const o = await db.query.orders.findFirst({ where: and(eq(schema.orders.tenantId, t.id), eq(schema.orders.number, num)) });
      if (!o) return fail("Pedido no encontrado.", "Pedido não encontrado.");
      try {
        await setOrderStatus(t.id, o.id, String(i.status) as OrderStatus);
      } catch {
        return fail("No se pudo cambiar este pedido.", "Não foi possível alterar este pedido.");
      }
      return done("order.status", `#${num} ${i.status}`, c.T(`Pedido #${num} actualizado.`, `Pedido #${num} atualizado.`));
    }
    case "create_coupon": {
      const code = normalizeCode(String(i.code ?? ""));
      const pct = Math.round(Number(i.percent));
      if (code.length < 3 || !(pct >= 1 && pct <= 90)) return fail("Código o porcentaje inválido.", "Código ou porcentagem inválidos.");
      const dup = await db.query.coupons.findFirst({ where: and(eq(schema.coupons.tenantId, t.id), eq(schema.coupons.code, code)) });
      if (dup) return fail("Ya existe un cupón con ese código.", "Já existe um cupom com esse código.");
      const days = Number(i.days) > 0 ? Math.min(365, Number(i.days)) : null;
      await db.insert(schema.coupons).values({ tenantId: t.id, code, kind: "PERCENT", value: pct, maxUses: Number(i.maxUses) > 0 ? Math.floor(Number(i.maxUses)) : null, expiresAt: days ? new Date(Date.now() + days * 864e5) : null });
      return done("coupon.create", `${code} ${pct}%`, c.T(`Cupón ${code} creado.`, `Cupom ${code} criado.`));
    }
    case "start_flash_offer": {
      const prod = await db.query.products.findFirst({ where: and(eq(schema.products.id, String(i.productId)), eq(schema.products.tenantId, t.id)) });
      const v = minor(i.price);
      if (!prod || !v || v >= prod.pricePyg) return fail("El precio de oferta tiene que ser menor que el normal.", "O preço da oferta precisa ser menor que o normal.");
      const hours = Math.min(336, Math.max(1, Math.round(Number(i.hours) || 2)));
      await db.update(schema.products).set({ promoPricePyg: v, promoEndsAt: new Date(Date.now() + hours * 3600e3) }).where(eq(schema.products.id, prod.id));
      return done("offer.start", `${prod.name} ${hours}h`, c.T(`Oferta activa por ${hours} h.`, `Oferta ativa por ${hours} h.`));
    }
    case "add_courier": {
      const name = String(i.name ?? "").trim().slice(0, 60);
      const rule = PHONE_RULES[t.country];
      let raw = String(i.phone ?? "").replace(/\D/g, "");
      if (rule && raw.startsWith(rule.dial) && raw.length === rule.dial.length + rule.length) raw = raw.slice(rule.dial.length);
      const phone = rule ? `+${rule.dial}${sanitizePhone(raw, t.country)}` : "";
      if (!isValidName(name) || !isValidE164(phone)) return fail("Nombre o WhatsApp inválido.", "Nome ou WhatsApp inválido.");
      const dup = await db.query.couriers.findFirst({ where: and(eq(schema.couriers.tenantId, t.id), eq(schema.couriers.phone, phone)) });
      if (dup) return fail("Ya existe ese repartidor.", "Esse motoboy já está cadastrado.");
      await db.insert(schema.couriers).values({ tenantId: t.id, name, phone });
      return done("courier.create", name, c.T(`${name} registrado.`, `${name} cadastrado.`));
    }
    case "update_banner": {
      const s = (k: string, n: number) => (i[k] ? String(i[k]).trim().slice(0, n) || null : null);
      await db.update(schema.tenants).set({ bannerTitle: s("title", 60), bannerSubtitle: s("subtitle", 90), bannerHighlight: s("highlight", 40) }).where(eq(schema.tenants.id, t.id));
      return done("appearance.banner", s("title", 60) ?? "oculto", c.T("Banner actualizado.", "Banner atualizado."));
    }
  }
  return fail("Acción no disponible.", "Ação não disponível.");
}
