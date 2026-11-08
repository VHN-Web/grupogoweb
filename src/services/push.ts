import "server-only";
// Notificações (Web Push) do app CRM dos sócios. As chaves VAPID são criadas sozinhas no 1º uso
// e ficam em platform_settings.crmConfig (a privada criptografada com lib/secrets).
import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseCrmConfig } from "@/core/crm";
import { openSecret, sealSecret } from "@/lib/secrets";

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

export async function removePushSub(endpoint: string) {
  await db.delete(schema.crmPushSubs).where(eq(schema.crmPushSubs.endpoint, endpoint));
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/** Envia para alguns sócios (ids) ou para todos ("all"). Nunca lança erro. */
export async function sendPush(to: string[] | "all", p: PushPayload) {
  try {
    const subs = to === "all" ? await db.query.crmPushSubs.findMany() : to.length ? await db.query.crmPushSubs.findMany({ where: inArray(schema.crmPushSubs.actorId, to) }) : [];
    if (!subs.length) return 0;
    const k = await vapidKeys();
    webpush.setVapidDetails("mailto:suporte@goweboficial.com", k.pub, k.priv);
    const payload = JSON.stringify({ title: p.title, body: p.body, url: p.url ?? "/crm", tag: p.tag });
    let ok = 0;
    await Promise.all(
      subs.map(async (s) => {
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
