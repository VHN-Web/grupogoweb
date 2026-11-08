"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type BIP = Event & { prompt: () => Promise<void> };

/** Convite para instalar o app (some quando já está instalado). */
export function InstallHint() {
  const [show, setShow] = useState(false);
  const [evt, setEvt] = useState<BIP | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let hidden = false;
    try { hidden = localStorage.getItem("gw_crm_install_hide") === "1"; } catch {}
    if (!standalone && !hidden) setShow(true);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIP); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!show) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-4">
      <img src="/crm/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
      <p className="min-w-[200px] flex-1 text-sm"><b>Instale o app do CRM</b> no celular ou no computador para receber notificações.</p>
      {evt ? (
        <button onClick={() => evt.prompt()} className="btn-brand">Instalar</button>
      ) : (
        <Link href="/crm/config#instalar" className="btn-brand">Como instalar</Link>
      )}
      <button onClick={() => { try { localStorage.setItem("gw_crm_install_hide", "1"); } catch {} setShow(false); }} className="text-sm text-[var(--s-muted)]" aria-label="Fechar">Agora não</button>
    </div>
  );
}
