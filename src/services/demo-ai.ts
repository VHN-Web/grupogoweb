import "server-only";
// Demonstração montada pela Geovana: pesquisa o estabelecimento (Google Maps, Instagram, Facebook, iFood, site)
// com a busca do Google no Gemini, guarda um rascunho para o vendedor conferir e cria a loja demo a partir dele.
// Regras puras em core/store-research.ts. A demo segue as regras de sempre: contatos fictícios, nada de disparo real.
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { geminiSearch, geminiVision } from "@/adapters/ai/gemini";
import { GEOVANA_PRESETS } from "@/core/geovana";
import { formatMoney } from "@/core/money";
import { menuPrompt, parseMenuJson, type MenuItem } from "@/core/menu-import";
import {
  demoBanner,
  demoSlug,
  geovanaAbout,
  MIN_REAL_MENU,
  nicheOf,
  parseProfile,
  pickTemplate,
  researchPrompt,
  validColor,
  type Niche,
  type ResearchInput,
  type StoreProfile,
} from "@/core/store-research";
import type { Currency } from "@/core/types";
import { openSecret } from "@/lib/secrets";
import { tenantPublicUrl } from "@/lib/urls";
import { addNote, crmConfig } from "@/services/crm";
import { createDemoStore } from "@/services/demo";
import { saveGeovana, whatsappPlatform } from "@/services/geovana";
import { importMenu } from "@/services/menu-import";

export class DemoAiError extends Error {}

const currencyOf = (country: string): Currency => (country === "BR" ? "BRL" : "PYG");

/** Chave da Geovana da GoWeb (Admin → Configurações → Geovana); sem ela, a do CRM ou a do ambiente. */
async function aiKey() {
  const p = await whatsappPlatform();
  let key = p.geminiKeySealed ? openSecret(p.geminiKeySealed) : "";
  if (!key) {
    const c = await crmConfig();
    key = c.geminiKeySealed ? openSecret(c.geminiKeySealed) : "";
  }
  key ||= process.env.GEMINI_API_KEY ?? "";
  if (!key) throw new DemoAiError("Cadastre a chave do Gemini em Admin → Configurações → Geovana (ou no CRM).");
  return { key, model: p.model };
}

export type DraftInput = ResearchInput & { leadId?: string | null };

/** Pesquisa e guarda o rascunho (devolve o id). Fotos do cardápio, se vierem, valem mais que o que achou na internet. */
export async function researchDraft(input: DraftInput, createdBy: string, photos: { base64: string; mime: string }[] = []) {
  const { key, model } = await aiKey();
  const currency = currencyOf(input.country);
  let profile: StoreProfile | null = null;
  let error: string | null = null;
  try {
    const r = await geminiSearch({ key, model, prompt: researchPrompt(input), maxTokens: 8192 });
    profile = parseProfile(r.text, input, currency, r.sources);
    if (!profile) error = "A Geovana respondeu num formato que não deu para ler. Tente de novo.";
  } catch (e) {
    error = e instanceof Error ? e.message : "Falha na pesquisa.";
  }
  // cardápio por foto (mesma leitura do Painel → Produtos → Importar)
  const fromPhotos: MenuItem[] = [];
  for (const ph of photos.slice(0, 3)) {
    try {
      const raw = await geminiVision({ key, model, prompt: menuPrompt(input.country === "BR", currency), imageBase64: ph.base64, mime: ph.mime });
      fromPhotos.push(...parseMenuJson(raw, currency, input.country === "BR" ? "Cardápio" : "Menú"));
    } catch {}
  }
  if (fromPhotos.length) {
    profile ??= {
      found: true, name: input.name, niche: "outro", tagline: "", description: "", address: "", city: input.city ?? "", hours: "", rating: null, reviews: null,
      delivery: true, pickup: true, dineIn: false, color: null, highlights: [], instagram: "", website: "", menu: [], menuSource: "nenhum", sources: [],
    };
    profile.menu = fromPhotos.slice(0, 200);
    profile.menuSource = "foto";
    error = null;
  }
  const [d] = await db
    .insert(schema.demoDrafts)
    .values({ input: JSON.stringify(input), profile: profile ? JSON.stringify(profile) : null, error, leadId: input.leadId ?? null, createdBy })
    .returning({ id: schema.demoDrafts.id });
  return d.id;
}

export async function getDraft(id: string) {
  const d = await db.query.demoDrafts.findFirst({ where: eq(schema.demoDrafts.id, id) });
  if (!d) return null;
  let input: DraftInput;
  let profile: StoreProfile | null = null;
  try {
    input = JSON.parse(d.input) as DraftInput;
    profile = d.profile ? (JSON.parse(d.profile) as StoreProfile) : null;
  } catch {
    return null;
  }
  return { ...d, input, profile };
}

/** Rascunho → loja demo (com o que o vendedor corrigiu na prévia). */
export async function createDemoFromDraft(
  id: string,
  edit: { name: string; niche: Niche; tagline: string; address: string; color: string; hours: string; useMenu: boolean; note: string },
  actor: { id: string; name: string },
) {
  const d = await getDraft(id);
  if (!d?.profile) throw new DemoAiError("Pesquisa não encontrada. Faça de novo.");
  if (d.tenantId) throw new DemoAiError("Esta pesquisa já virou uma demonstração.");
  const p: StoreProfile = { ...d.profile, name: edit.name || d.profile.name, niche: edit.niche, tagline: edit.tagline, address: edit.address, hours: edit.hours, color: validColor(edit.color) ?? d.profile.color };
  const country = d.input.country;
  const pt = country === "BR";
  // só os modelos do sistema (as demos criadas pelo admin têm demoNote)
  const templates = await db.query.tenants.findMany({ where: and(eq(schema.tenants.demo, true), isNull(schema.tenants.demoNote)), columns: { slug: true, theme: true, country: true } });
  const template = pickTemplate(templates, p.niche, country);
  if (!template) throw new DemoAiError("Nenhum modelo de demonstração no sistema (rode o seed).");

  // endereço livre: pizzaria-do-joao-demo, -2, -3…
  let slug = demoSlug(p.name);
  for (let n = 2; await db.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug), columns: { id: true } }); n++) slug = `${demoSlug(p.name).replace(/-demo$/, "")}-${n}-demo`;

  const { tenant, password } = await createDemoStore({ templateSlug: template.slug, name: p.name.slice(0, 60), slug, note: (edit.note || `Montada pela Geovana para ${p.name}`).slice(0, 120) });
  const currency = currencyOf(country);
  const banner = demoBanner(p, pt, (m) => formatMoney(m, currency));
  const anyMode = p.delivery || p.pickup || p.dineIn;
  await db
    .update(schema.tenants)
    .set({
      theme: nicheOf(p.niche).theme,
      ...(p.color ? { primaryColor: p.color } : {}),
      ...(p.tagline ? { tagline: p.tagline } : {}),
      ...(p.address ? { address: p.address } : {}),
      ...banner,
      bannerImageUrl: null, // a foto do modelo era de outra loja
      logoUrl: null,
      ...(anyMode ? { acceptsDelivery: p.delivery, acceptsPickup: p.pickup, acceptsDineIn: p.dineIn } : {}),
    })
    .where(eq(schema.tenants.id, tenant.id));

  // cardápio real no lugar do de exemplo
  let menuItems = 0;
  if (edit.useMenu && p.menu.length >= MIN_REAL_MENU) {
    await db.delete(schema.products).where(eq(schema.products.tenantId, tenant.id));
    await db.delete(schema.categories).where(eq(schema.categories.tenantId, tenant.id));
    const row = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenant.id) });
    if (row) menuItems = (await importMenu(row, p.menu, { hidden: false })).created;
  }

  // a Geovana já atende como esta loja no simulador do painel (demo nunca conecta WhatsApp)
  const preset = GEOVANA_PRESETS.find((x) => x.id === nicheOf(p.niche).preset) ?? GEOVANA_PRESETS[0];
  const fresh = await db.query.tenants.findFirst({ where: eq(schema.tenants.id, tenant.id) });
  if (fresh) {
    await saveGeovana(fresh, {
      enabled: true,
      name: "Geovana",
      about: geovanaAbout(p, pt) || preset.about,
      hours: p.hours,
      rules: preset.rules,
      faq: preset.faq,
      greeting: preset.greeting,
      takeOrders: true,
    });
  }

  await db.update(schema.demoDrafts).set({ tenantId: tenant.id }).where(eq(schema.demoDrafts.id, id));
  const url = tenantPublicUrl({ slug: tenant.slug, customDomain: null });
  if (d.leadId) {
    await addNote(actor, d.leadId, `Demo montada pela Geovana: ${url} · painel /painel/${tenant.slug}${menuItems ? ` · ${menuItems} produtos do cardápio real` : ""}`).catch(() => null);
  }
  return { tenant, password, url, menuItems };
}
