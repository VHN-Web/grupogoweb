"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { testPushAction } from "@/app/crm/actions";

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Liga as notificações neste aparelho (precisa do app instalado no iPhone). */
export function PushSetup() {
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "denied" | "off" | "on">("loading");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/crm-sw.js", { scope: "/crm" });
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = async () => {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/crm/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const device = /iphone|ipad/i.test(navigator.userAgent) ? "iPhone" : /android/i.test(navigator.userAgent) ? "Android" : /mac/i.test(navigator.userAgent) ? "Mac" : /windows/i.test(navigator.userAgent) ? "Windows" : "Navegador";
      const r = await fetch("/api/crm/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), device }) });
      if (!r.ok) throw new Error();
      setState("on");
      await testPushAction();
      setMsg("Pronto! Enviamos uma notificação de teste.");
    } catch {
      setMsg("Não deu para ligar as notificações neste aparelho.");
    }
  };
  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/crm/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  };

  return (
    <div>
      {state === "loading" && <p className="text-sm text-[var(--s-muted)]">Verificando…</p>}
      {state === "ios-install" && <p className="rounded-2xl bg-[#F2C14E]/15 p-3 text-sm">No iPhone, as notificações só funcionam com o app instalado: Safari → <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. Depois abra pelo ícone e volte aqui.</p>}
      {state === "unsupported" && <p className="text-sm text-[var(--s-muted)]">Este navegador não aceita notificações. Use Chrome, Edge ou Safari atualizado.</p>}
      {state === "denied" && <p className="rounded-2xl bg-red-500/10 p-3 text-sm">As notificações foram bloqueadas. Libere nas configurações do navegador/aparelho para o site goweboficial.com e recarregue.</p>}
      {state === "off" && (
        <button onClick={enable} className="btn-brand"><Icon name="bell" size={16} /> Ligar notificações neste aparelho</button>
      )}
      {state === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 text-sm font-bold text-[var(--s-good-fg)]"><Icon name="check" size={16} /> Notificações ligadas</span>
          <button onClick={async () => { await testPushAction(); setMsg("Notificação de teste enviada."); }} className="btn-ghost py-2 text-sm">Enviar teste</button>
          <button onClick={disable} className="text-sm text-[var(--s-muted)] underline">Desligar</button>
        </div>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </div>
  );
}
