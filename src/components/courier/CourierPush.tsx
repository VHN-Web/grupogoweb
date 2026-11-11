"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { nativeApp, nativeStatus } from "@/lib/native-bridge";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Txt = {
  enable: string; on: string; off: string; ios: string; unsupported: string; denied: string; fail: string;
  /** só no app Android */
  settings?: string; onlineOnly?: string;
};

/** Liga as notificações de entregas neste celular (no iPhone, só com o app instalado). */
export function CourierPush({ t }: { t: Txt }) {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "native-off" | "native-on">("loading");
  const [fcm, setFcm] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // app Android: notificações nativas (Firebase com o app fechado; sem Firebase, avisos enquanto online)
  useEffect(() => {
    if (!nativeApp()) return;
    const read = () => {
      const st = nativeStatus();
      if (!st) return;
      setState(st.notifications ? "native-on" : "native-off");
      setFcm(st.push);
    };
    read();
    const i = setInterval(read, 2000);
    window.addEventListener("atlas:status", read);
    return () => {
      clearInterval(i);
      window.removeEventListener("atlas:status", read);
    };
  }, []);

  useEffect(() => {
    if (nativeApp()) return;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/entregador-sw.js", { scope: "/entregador" });
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = async () => {
    setMsg(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/entregador/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const device = /iphone|ipad/i.test(navigator.userAgent) ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : "Navegador";
      const r = await fetch("/api/entregador/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device }) });
      if (!r.ok) throw new Error();
      setState("on");
    } catch {
      setMsg(t.fail);
    }
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/entregador/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  };

  return (
    <div>
      {state === "ios-install" && <p className="rounded-2xl bg-[#F2C14E]/15 p-3 text-sm">{t.ios}</p>}
      {state === "unsupported" && <p className="text-sm text-[var(--s-muted)]">{t.unsupported}</p>}
      {state === "denied" && <p className="rounded-2xl bg-red-500/10 p-3 text-sm">{t.denied}</p>}
      {state === "native-off" && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => nativeApp()?.requestNotifications()} className="btn-brand"><Icon name="bell" size={16} /> {t.enable}</button>
          {t.settings && <button onClick={() => nativeApp()?.openAppSettings()} className="text-sm text-[var(--s-muted)] underline">{t.settings}</button>}
        </div>
      )}
      {state === "native-on" && (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 text-sm font-bold text-[var(--s-good-fg)]"><Icon name="check" size={16} /> {t.on}</span>
          {!fcm && t.onlineOnly && <p className="mt-2 text-xs text-[var(--s-muted)]">{t.onlineOnly}</p>}
        </div>
      )}
      {state === "off" && <button onClick={enable} className="btn-brand"><Icon name="bell" size={16} /> {t.enable}</button>}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 text-sm font-bold text-[var(--s-good-fg)]"><Icon name="check" size={16} /> {t.on}</span>
          <button onClick={disable} className="text-sm text-[var(--s-muted)] underline">{t.off}</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </div>
  );
}
