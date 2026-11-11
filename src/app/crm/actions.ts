"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CHANNELS, CRM_STATUSES, DEFAULT_UF_ORDER, SCORES, brDateTime, csvToRecords, huntPlan, type Channel, type CrmStatus, type Score } from "@/core/crm";
import { ALL_CATEGORIES, normalizeCity } from "@/core/br-geo";
import {
  CrmError,
  addNote,
  crmConfig,
  deleteLead,
  endJourney,
  importRecords,
  logContact,
  requireCrm,
  saveCrmConfig,
  setFollowUp,
  setOwner,
  setStatus,
  startJourney,
  syncSheet,
  togglePause,
  undoQuickContact,
  updateLeadFields,
  upsertLead,
  type LeadInput,
} from "@/services/crm";
import { aiPitch, runHunt, testGemini } from "@/services/crm-hunter";
import { sendPush } from "@/services/push";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const go = (path: string, key: "ok" | "err", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
const asChannel = (v: string): Channel => ((CHANNELS as readonly string[]).includes(v) ? (v as Channel) : "whatsapp");

async function guard<T>(fn: () => Promise<T>, back: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CrmError) go(back, "err", e.message);
    throw e;
  }
}

// ---------------------------------------------------------------- jornada e contadores (chamadas pelo app, sem recarregar)
export async function journeyAction(kind: "start" | "pause" | "end") {
  const me = await requireCrm();
  let summary = null;
  if (kind === "start") await startJourney(me);
  else if (kind === "pause") await togglePause(me);
  else summary = await endJourney(me);
  revalidatePath("/crm");
  return summary;
}

export async function quickContactAction(channel: string, undo = false) {
  const me = await requireCrm();
  if (undo) await undoQuickContact(me, asChannel(channel));
  else await logContact(me, null, asChannel(channel));
  revalidatePath("/crm");
}

/** Botão de WhatsApp/ligar/Instagram da ficha: registra o contato e o app abre o link. */
export async function leadContactAction(leadId: string, channel: string) {
  const me = await requireCrm();
  await logContact(me, leadId, asChannel(channel));
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function moveLeadAction(leadId: string, status: string) {
  const me = await requireCrm();
  if (!(CRM_STATUSES as readonly string[]).includes(status)) return;
  await setStatus(me, leadId, status as CrmStatus);
  revalidatePath("/crm/funil");
}

export async function aiPitchAction(leadId: string, channel: string) {
  const me = await requireCrm();
  const l = await db.query.crmLeads.findFirst({ where: eq(schema.crmLeads.id, leadId) });
  if (!l) return { error: "Lead não encontrado." };
  try {
    return { text: await aiPitch(l, me.name, channel) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao gerar." };
  }
}

// ---------------------------------------------------------------- ficha do lead
function leadInput(f: FormData): LeadInput {
  const rev = s(f, "reviews").replace(/\D/g, "");
  const sc = s(f, "score");
  return {
    name: s(f, "name"),
    category: s(f, "category") || null,
    neighborhood: s(f, "neighborhood") || null,
    city: s(f, "city") || null,
    address: s(f, "address") || null,
    phone: s(f, "phone") || null,
    instagram: s(f, "instagram") || null,
    email: s(f, "email") || null,
    website: s(f, "website") || null,
    reviews: rev ? Number(rev) : null,
    pain: s(f, "pain") || null,
    pitch: s(f, "pitch") || null,
    score: (SCORES as readonly string[]).includes(sc) ? (sc as Score) : null,
    notes: s(f, "notes") || null,
  };
}

export async function newLeadAction(f: FormData) {
  const me = await requireCrm();
  const { lead, created } = await guard(() => upsertLead({ ...leadInput(f), ownerId: me.id }, "manual", me.id), "/crm/leads?novo=1");
  go(`/crm/leads/${lead.id}`, "ok", created ? "Lead cadastrado." : "Esse negócio já estava no CRM — abrimos a ficha dele.");
}

export async function editLeadAction(id: string, f: FormData) {
  await requireCrm();
  await guard(() => updateLeadFields(id, leadInput(f)), `/crm/leads/${id}`);
  go(`/crm/leads/${id}`, "ok", "Dados salvos.");
}

export async function statusAction(id: string, f: FormData) {
  const me = await requireCrm();
  const st = s(f, "status");
  if (!(CRM_STATUSES as readonly string[]).includes(st)) go(`/crm/leads/${id}`, "err", "Etapa inválida.");
  const demoAt = st === "DEMO" ? brDateTime(s(f, "day"), s(f, "time")) : null;
  if (st === "DEMO" && !demoAt) go(`/crm/leads/${id}`, "err", "Informe o dia da demonstração.");
  await guard(() => setStatus(me, id, st as CrmStatus, { demoAt, lostReason: s(f, "lostReason") || null }), `/crm/leads/${id}`);
  go(`/crm/leads/${id}`, "ok", "Etapa atualizada.");
}

export async function followUpAction(id: string, f: FormData) {
  const me = await requireCrm();
  const preset = s(f, "preset");
  let at: Date | null = null;
  const now = new Date();
  if (preset === "clear") at = null;
  else if (preset) {
    const days = Number(preset);
    const base = new Date(now.getTime() + days * 86400_000);
    at = brDateTime(new Date(base.getTime() - 3 * 3600_000).toISOString().slice(0, 10), "09:00");
  } else at = brDateTime(s(f, "day"), s(f, "time"));
  if (preset !== "clear" && !at) go(`/crm/leads/${id}`, "err", "Escolha o dia do retorno.");
  await guard(() => setFollowUp(me, id, at), `/crm/leads/${id}`);
  go(`/crm/leads/${id}`, "ok", at ? "Retorno agendado. Você recebe um aviso no horário." : "Retorno removido.");
}

export async function ownerAction(id: string, f: FormData) {
  const me = await requireCrm();
  await guard(() => setOwner(me, id, s(f, "owner") || null), `/crm/leads/${id}`);
  go(`/crm/leads/${id}`, "ok", "Responsável atualizado.");
}

export async function noteAction(id: string, f: FormData) {
  const me = await requireCrm();
  const ch = s(f, "channel");
  if (ch) await guard(() => logContact(me, id, asChannel(ch), s(f, "body") || null), `/crm/leads/${id}`);
  else await guard(() => addNote(me, id, s(f, "body")), `/crm/leads/${id}`);
  go(`/crm/leads/${id}`, "ok", ch ? "Contato registrado." : "Anotação salva.");
}

export async function deleteLeadAction(id: string) {
  await requireCrm();
  await deleteLead(id);
  go("/crm/leads", "ok", "Lead excluído.");
}

// ---------------------------------------------------------------- importação
export async function importCsvAction(f: FormData) {
  await requireCrm();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) go("/crm/leads", "err", "Escolha um arquivo .csv.");
  if ((file as File).size > 2_000_000) go("/crm/leads", "err", "Arquivo grande demais (máx. 2 MB).");
  const text = Buffer.from(await (file as File).arrayBuffer()).toString("utf8");
  const r = await guard(() => importRecords(csvToRecords(text)), "/crm/leads");
  go("/crm/leads", "ok", `Importação: ${r.added} novos, ${r.updated} já existiam.`);
}

export async function syncSheetAction() {
  await requireCrm();
  const r = await guard(() => syncSheet(), "/crm/leads");
  go("/crm/leads", "ok", `Planilha sincronizada: ${r.added} novos, ${r.updated} já existiam.`);
}

// ---------------------------------------------------------------- busca automática
export async function huntNowAction(f: FormData) {
  await requireCrm();
  const cityIn = s(f, "city");
  const group = s(f, "group");
  let only: { city: string; categories: string[] } | undefined;
  if (cityIn || group) {
    const cfg = await crmConfig();
    const city = cityIn ? normalizeCity(cityIn) : null;
    if (cityIn && !city) go("/crm/busca", "err", "Cidade não encontrada. Escreva no formato “Cidade - UF”, ex.: Caruaru - PE.");
    const plan = huntPlan(cfg);
    const cats = group === "" ? plan.groups[0] : group.startsWith("cat:") ? [group.slice(4)] : plan.groups[Number(group)] ?? plan.groups[0];
    only = { city: city ?? plan.cities[0], categories: cats ?? [] };
  }
  const r = await guard(() => runHunt("manual", only), "/crm/busca");
  if (r.skipped) return go("/crm/busca", "err", "Busca desligada.");
  if (r.errors.length && !r.added) go("/crm/busca", "err", r.errors[0]);
  go("/crm/busca", "ok", `Busca concluída: ${r.found} encontrados, ${r.added} novos no CRM.`);
}

export async function saveHuntAction(f: FormData) {
  await requireCrm();
  const lines = (k: string) => s(f, k).split(/\n|;/).map((x) => x.trim()).filter(Boolean);
  const priority = lines("priority");
  const bad = priority.filter((c) => !normalizeCity(c));
  const ufs = f.getAll("ufs").map(String);
  const categories = f.getAll("categories").map(String).filter((c) => ALL_CATEGORIES.includes(c)).concat(lines("extraCategories").map((c) => c.slice(0, 60)));
  if (!ufs.length && !priority.length) go("/crm/busca", "err", "Escolha pelo menos um estado ou uma cidade prioritária.");
  if (!categories.length) go("/crm/busca", "err", "Escolha pelo menos uma categoria.");
  const ordered = DEFAULT_UF_ORDER.filter((u) => ufs.includes(u));
  await saveCrmConfig({
    priorityCities: priority.map((c) => normalizeCity(c)).filter((c): c is string => !!c),
    ufs: ordered,
    allCities: f.get("allCities") === "on",
    categories: [...new Set(categories)],
    callsPerRun: Number(s(f, "callsPerRun")) || 4,
    perRun: Number(s(f, "perRun")) || 6,
    groupSize: Number(s(f, "groupSize")) || 4,
    huntEnabled: f.get("huntEnabled") === "on",
    model: s(f, "model") || undefined,
    cursor: f.get("restart") === "on" ? 0 : undefined,
  });
  go("/crm/busca", "ok", bad.length ? `Salvo. Não encontrei estas cidades: ${bad.join(", ")} (use “Cidade - UF”).` : "Configuração da busca salva.");
}

export async function saveGeminiAction(f: FormData) {
  await requireCrm();
  const key = s(f, "key").replace(/\s+/g, "");
  if (f.get("remove") === "1") {
    await saveCrmConfig({ geminiKey: null });
    go("/crm/busca", "ok", "Chave removida.");
  }
  // O Google usa mais de um formato de chave (ex.: "AIza…" e "AQ.…"); o teste logo abaixo é que confirma se ela funciona.
  if (!/^[A-Za-z0-9._\-]{20,200}$/.test(key)) go("/crm/busca", "err", "Essa chave não parece válida. Copie a chave inteira no Google AI Studio, sem espaços.");
  await saveCrmConfig({ geminiKey: key });
  try {
    await testGemini();
  } catch (e) {
    go("/crm/busca", "err", `Chave salva, mas o teste falhou: ${e instanceof Error ? e.message : "erro"}`);
  }
  go("/crm/busca", "ok", "Chave do Gemini salva e testada. A busca automática já está ligada.");
}

// ---------------------------------------------------------------- configurações
export async function saveSettingsAction(f: FormData) {
  await requireCrm();
  const cur = await crmConfig();
  const sheet = s(f, "sheet");
  const id = sheet.match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1] ?? sheet;
  await saveCrmConfig({ goals: { contacts: Number(s(f, "contacts")) || cur.goals.contacts, demos: Number(s(f, "demos")) || 0 }, sheetId: id || null });
  go("/crm/config", "ok", "Configurações salvas.");
}

export async function testPushAction() {
  const me = await requireCrm();
  const n = await sendPush([me.id], { title: "Notificações ligadas ✅", body: "É assim que o CRM vai te avisar de retornos, leads novos e contratos.", url: "/crm/avisos", force: true });
  return n;
}

export async function crmLogout() {
  const { clearSession } = await import("@/lib/auth");
  await clearSession();
  redirect("/admin/login?next=/crm");
}

// ---------------------------------------------------------------- notificações personalizadas e central de avisos
export async function saveNotifyPrefsAction(f: FormData) {
  const me = await requireCrm();
  const { NOTIFY_CATEGORIES } = await import("@/core/crm-notify");
  const { saveNotifyPrefs } = await import("@/services/crm-notify");
  const quiet = f.get("quiet") === "on";
  await saveNotifyPrefs(me.id, {
    off: NOTIFY_CATEGORIES.filter((c) => f.get(`cat_${c.id}`) !== "on").map((c) => c.id),
    quietFrom: quiet ? String(f.get("quietFrom") ?? "") : null,
    quietTo: quiet ? String(f.get("quietTo") ?? "") : null,
    urgentInQuiet: f.get("urgentInQuiet") === "on",
  });
  revalidatePath("/crm/config");
  redirect("/crm/config?ok=" + encodeURIComponent("Preferências de notificação salvas ✓") + "#avisos");
}

export async function markAllReadAction() {
  const me = await requireCrm();
  const { markAllRead } = await import("@/services/crm-notify");
  await markAllRead(me.id);
  revalidatePath("/crm", "layout");
  redirect("/crm/avisos");
}
