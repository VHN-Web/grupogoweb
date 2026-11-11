import "server-only";
// Notificações (Web Push) do app CRM dos sócios e do app do entregador. As chaves VAPID são criadas sozinhas no 1º uso
// e ficam em platform_settings.crmConfig (a privada criptografada com lib/secrets).
import webpush from "web-push";
import { eq, inArray, notLike } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCrmConfig } from "@/core/crm";
import { openSecret, sealSecret } from "@/lib/secrets";
import { fcmConfigured, sendFcm } from "@/adapters/push/fcm";
import { DEFAULT_NOTIFY, parseNotifyPrefs, shouldPush, type NotifyCategory } from "@/core/crm-notify";
import { sandboxBlocks } from "@/lib/sandbox";

/** Aparelhos do app Android (Firebase) ficam na mesma tabela, com endpoint "fcm:<token>". */
export const FCM_PREFIX = "fcm:";
export { fcmConfigured };

let cached: { pub: string; priv: string } | null = null;

export async function vapidKeys() {
  if (cached) return cached;
  const s = await db.query.platformSettings.findFirst();
  const cfg = parseCrmConfig(s?.crmConfig);
  if (cfg.vapidPublic && cfg.vapidPrivateSealed) {
    cached = { pub: cfg.vapidPublic, priv: openSecret(cfg.vapidPrivateSealed) };
    return cached;
  }
  const k = webpush.generateVAPIDKeys();
  const next = { ...cfg, vapidPublic: k.publicKey, vapidPrivateSealed: sealSecret(k.privateKey) };
  await db
    .insert(schema.platformSettings)
    .values({ id: "default", crmConfig: JSON.stringify(next) })
    .onConflictDoUpdate({ target: schema.platformSettings.id, set: { crmConfig: JSON.stringify(next), updatedAt: new Date() } });
  cached = { pub: k.publicKey, priv: k.privateKey };
  return cached;
}

export async function savePushSub(actorId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, device?: string | null) {
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("inscrição inválida");
  await db
    .insert(schema.crmPushSubs)
    .values({ actorId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: device?.slice(0, 80) ?? null })
    .onConflictDoUpdate({ target: schema.crmPushSubs.endpoint, set: { actorId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: device?.slice(0, 80) ?? null } });
}

/** Token do Firebase do app Android do entregador. */
export async function saveFcmSub(actorId: string, fcmToken: string, device?: string | null) {
  if (!/^[A-Za-z0-9:_\-.]{20,4096}$/.test(fcmToken)) throw new Error("token inválido");
  const endpoint = `${FCM_PREFIX}${fcmToken}`;
  const dev = device?.slice(0, 80) ?? "Android (app)";
  await db
    .insert(schema.crmPushSubs)
    .values({ actorId, endpoint, p256dh: "fcm", auth: "fcm", device: dev })
    .onConflictDoUpdate({ target: schema.crmPushSubs.endpoint, set: { actorId, device: dev } });
}

export async function removePushSub(endpoint: string) {
  await db.delete(schema.crmPushSubs).where(eq(schema.crmPushSubs.endpoint, endpoint));
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  /** só app Android (Firebase): ex. oferta de corrida */
  data?: Record<string, string>;
  /** categoria do CRM (core/crm-notify.ts): respeita as preferências e o silêncio de cada sócio */
  category?: NotifyCategory;
  /** ignora preferências/silêncio (botão "Testar") */
  force?: boolean;
};

/** Sócios do CRM: "platform" (senha-mestra) + admins ativos. */
async function crmActorIds() {
  const admins = await db.query.platformAdmins.findMany({ where: eq(schema.platformAdmins.active, true), columns: { id: true } });
  return ["platform", ...admins.map((a) => a.id)];
}

/** Envia para alguns sócios (ids) ou para todos ("all"). Nunca lança erro. */
export async function sendPush(to: string[] | "all", p: PushPayload) {
  try {
    // central de avisos do CRM: tudo fica guardado, mesmo o que não toca (categoria desligada ou silêncio)
    const crmTargets = to === "all" ? await crmActorIds() : to.filter((id) => !id.startsWith("courier:"));
    const nid = new Map<string, string>();
    if (crmTargets.length) {
      const rows = await db
        .insert(schema.crmNotifications)
        .values(crmTargets.map((actorId) => ({ actorId, category: p.category ?? null, title: p.title.slice(0, 140), body: p.body.slice(0, 400), url: p.url ?? "/crm" })))
        .returning({ id: schema.crmNotifications.id, actorId: schema.crmNotifications.actorId })
        .catch((e) => {
          console.error("[push] central", e);
          return [] as { id: string; actorId: string }[];
        });
      for (const r of rows) nid.set(r.actorId, r.id);
    }
    const prefRows = crmTargets.length ? await db.query.crmNotifyPrefs.findMany({ where: inArray(schema.crmNotifyPrefs.actorId, crmTargets) }) : [];
    const prefs = new Map(prefRows.map((r) => [r.actorId, parseNotifyPrefs(r.prefs)]));
    const muted = (actorId: string) => !p.force && !actorId.startsWith("courier:") && !shouldPush(prefs.get(actorId) ?? DEFAULT_NOTIFY, p.category);

    // "all" = todos os sócios do CRM (aparelhos de entregadores usam actorId "courier:<id>")
    const all = to === "all" ? await db.query.crmPushSubs.findMany({ where: notLike(schema.crmPushSubs.actorId, "courier:%") }) : to.length ? await db.query.crmPushSubs.findMany({ where: inArray(schema.crmPushSubs.actorId, to) }) : [];
    const subs = all.filter((s) => !muted(s.actorId));
    if (!subs.length) return 0;
    const k = await vapidKeys();
    webpush.setVapidDetails("mailto:suporte@goweboficial.com", k.pub, k.priv);
    const payload = JSON.stringify({ title: p.title, body: p.body, url: p.url ?? "/crm", tag: p.tag, icon: p.icon });
    let ok = 0;
    await Promise.all(
      subs.map(async (s) => {
        if (s.endpoint.startsWith(FCM_PREFIX)) {
          const r = await sendFcm(s.endpoint.slice(FCM_PREFIX.length), { ...p.data, title: p.title, body: p.body, url: p.url ?? "/crm", tag: p.tag ?? "", category: p.category ?? "", nid: nid.get(s.actorId) ?? "" });
          if (r === "ok") ok++;
          else if (r === "gone") await removePushSub(s.endpoint);
          return;
        }
        if (sandboxBlocks("push", null, p.title)) return void ok++; // prévia: aparelhos reais não tocam
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 * 12 });
          ok++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await removePushSub(s.endpoint); // aparelho desinstalou/expirou
        }
      }),
    );
    return ok;
  } catch (e) {
    console.error("[push]", e);
    return 0;
  }
}
