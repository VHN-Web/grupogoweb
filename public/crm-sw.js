// Service worker do app CRM GoWeb (instalável + notificações).
const VERSION = "crm-v1";
const OFFLINE = "/crm/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([OFFLINE, "/crm/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Páginas: sempre da rede (dados ao vivo); sem internet, mostra a tela offline.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.mode !== "navigate") return;
  e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "GoWeb CRM", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "GoWeb CRM", {
      body: d.body || "",
      icon: "/crm/icon-192.png",
      badge: "/crm/badge-96.png",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || "/crm" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/crm", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin + "/crm") && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
