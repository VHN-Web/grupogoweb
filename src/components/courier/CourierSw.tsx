"use client";
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void> };

/** Registra o service worker do app do entregador e oferece "Instalar" quando o navegador permite. */
export function CourierSw({ label }: { label?: string }) {
  const [evt, setEvt] = useState<BIP | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/entregador-sw.js", { scope: "/entregador" }).catch(() => null);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!evt || !label) return null;
  return <button onClick={() => evt.prompt().then(() => setEvt(null))} className="btn-brand py-2 text-sm">{label}</button>;
}
