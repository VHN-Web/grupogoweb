"use server";
// Geovana (IA no WhatsApp da loja) — GoInteligence.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorName, requireTenantAdmin } from "@/lib/auth";
import { audit, rateLimit } from "@/lib/security";
import { GEOVANA_PRESETS, faqFromText, type GeovanaTone } from "@/core/geovana";
import { getRegion, tr } from "@/core/region";
import { sealSecret } from "@/lib/secrets";
import type { ChatTurn } from "@/adapters/ai/gemini";
import { AiError, CloudError, EvolutionError, GeovanaError, connectCloud, connectEvolution, disconnectChannel, geovanaOf, saveGeovana, setChatPaused, simulate } from "@/services/geovana";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const page = (slug: string) => `/painel/${slug}/geovana`;
const back = (slug: string, kind: "ok" | "err", msg: string, extra = ""): never => redirect(`${page(slug)}?${kind}=${encodeURIComponent(msg)}${extra}`);
const known = (e: unknown) => e instanceof GeovanaError || e instanceof EvolutionError || e instanceof CloudError || e instanceof AiError;

async function pro(slug: string) {
  const t = await requireTenantAdmin(slug, "customers");
  if (t.tier !== "pro") redirect(`/painel/${slug}/plano`);
  return t;
}

export async function connectEvolutionAction(slug: string) {
  const t = await pro(slug);
  try {
    await connectEvolution(t);
  } catch (e) {
    back(slug, "err", known(e) ? (e as Error).message : "Não foi possível conectar agora.");
  }
  await audit(t.id, await actorName(slug), "geovana.connect", "evolution");
  back(slug, "ok", tr(getRegion(t.country).locale)("Escaneá el QR con el WhatsApp de la tienda.", "Escaneie o QR Code com o WhatsApp da loja."), "&qr=1");
}

export async function connectCloudAction(slug: string, f: FormData) {
  const t = await pro(slug);
  let msg = "";
  try {
    const r = await connectCloud(t, { phoneId: str(f, "phoneId"), token: str(f, "token"), appSecret: str(f, "appSecret") });
    msg = `WhatsApp oficial conectado: ${r.name} ${r.phone}`.trim();
  } catch (e) {
    back(slug, "err", known(e) ? (e as Error).message : "Não foi possível validar as credenciais.");
  }
  await audit(t.id, await actorName(slug), "geovana.connect", "cloud");
  back(slug, "ok", msg);
}

export async function disconnectAction(slug: string) {
  const t = await pro(slug);
  await disconnectChannel(t);
  await audit(t.id, await actorName(slug), "geovana.disconnect", null);
  back(slug, "ok", "WhatsApp desconectado.");
}

export async function saveGeovanaAction(slug: string, f: FormData) {
  const t = await pro(slug);
  const tone = (["amigavel", "profissional", "descontraido"].includes(str(f, "tone")) ? str(f, "tone") : "amigavel") as GeovanaTone;
  const own = str(f, "ownKey").replace(/\s+/g, "");
  await saveGeovana(t, {
    enabled: f.get("enabled") === "on",
    name: str(f, "name").slice(0, 30) || "Geovana",
    tone,
    emojis: f.get("emojis") === "on",
    greeting: str(f, "greeting").slice(0, 500),
    about: str(f, "about").slice(0, 1500),
    hours: str(f, "hours").slice(0, 300),
    promos: str(f, "promos").slice(0, 800),
    rules: str(f, "rules").slice(0, 1500),
    faq: faqFromText(String(f.get("faq") ?? "")),
    handoffWords: str(f, "handoffWords").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 15),
    onlyWhenClosed: f.get("onlyWhenClosed") === "on",
    takeOrders: f.get("takeOrders") === "on",
    orderNotices: f.get("orderNotices") === "on",
    pauseMinutes: Math.min(1440, Math.max(5, Number(str(f, "pauseMinutes")) || 60)),
    ...(own ? { ownKeySealed: sealSecret(own) } : {}),
    ...(f.get("clearOwnKey") === "on" ? { ownKeySealed: "" } : {}),
  });
  await audit(t.id, await actorName(slug), "geovana.save", f.get("enabled") === "on" ? "ligada" : "desligada");
  revalidatePath(page(slug));
  back(slug, "ok", tr(getRegion(t.country).locale)("Guardado ✓", "Salvo ✓"));
}

export async function applyPresetAction(slug: string, f: FormData) {
  const t = await pro(slug);
  const p = GEOVANA_PRESETS.find((x) => x.id === str(f, "preset"));
  if (!p) back(slug, "err", "Modelo inválido.");
  const cur = geovanaOf(t);
  await saveGeovana(t, { about: p!.about, rules: p!.rules, faq: p!.faq, greeting: p!.greeting, ...(cur.name ? {} : { name: "Geovana" }) });
  back(slug, "ok", `Modelo “${p!.label}” aplicado. Ajuste os textos e salve.`);
}

export async function pauseChatAction(slug: string, chatId: string, minutes: number) {
  const t = await pro(slug);
  await setChatPaused(t.id, chatId, minutes);
  revalidatePath(page(slug));
}

/** Simulador do painel (sem WhatsApp). */
export async function simulateAction(slug: string, history: ChatTurn[]): Promise<{ text: string; handoff?: boolean; error?: string }> {
  const t = await pro(slug);
  if (!(await rateLimit(`geovana-sim:${t.id}`, 40, 3600))) return { text: "", error: "Muitas mensagens de teste. Aguarde um pouco." };
  const h = history.filter((x) => (x.role === "user" || x.role === "model") && typeof x.text === "string").slice(-14).map((x) => ({ role: x.role, text: x.text.slice(0, 1000) }));
  try {
    return await simulate(t, h);
  } catch (e) {
    return { text: "", error: known(e) ? (e as Error).message : "A IA não respondeu agora." };
  }
}
