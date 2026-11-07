"use client";
import { useEffect, useState } from "react";

/** Dispara a impressão quando a página do comprovante termina de carregar. */
export function PrintOnLoad() {
  useEffect(() => {
    const h = setTimeout(() => window.print(), 300);
    return () => clearTimeout(h);
  }, []);
  return null;
}

/** Imprime uma URL do painel numa impressora térmica sem sair da página (iframe invisível). */
export function printUrl(url: string) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  f.src = url;
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 60000);
}

export function ThermalPrintButton({ url, label, className }: { url: string; label: string; className?: string }) {
  return (
    <button type="button" onClick={() => printUrl(url)} className={className ?? "btn-ghost"}>
      {label}
    </button>
  );
}

/**
 * Impressão automática: assim que um pedido novo chega, ele é impresso (uma única vez —
 * o servidor marca o pedido como impresso). Funciona com o painel de pedidos aberto.
 * Para imprimir sem a janela de confirmação, abra o Chrome com --kiosk-printing.
 */
export function AutoPrinter({ slug, enabled, label = "Imprimir" }: { slug: string; enabled: boolean; label?: string }) {
  const [pending, setPending] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/print-claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
        const { ids } = (await r.json()) as { ids: string[] };
        if (!alive || !ids?.length) return;
        beep();
        ids.forEach((id, i) => setTimeout(() => printUrl(`/painel/${slug}/imprimir/${id}`), i * 2500));
        setPending((p) => [...p, ...ids].slice(-5));
      } catch {}
    };
    tick();
    const h = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [slug, enabled]);
  if (!enabled || pending.length === 0) return null;
  // se o navegador bloquear a impressão sem clique, o lojista reimprime aqui
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">
      <span>Pedido novo enviado para a impressora.</span>
      {pending.map((id) => (
        <button key={id} type="button" className="underline" onClick={() => printUrl(`/painel/${slug}/imprimir/${id}`)}>
          {label}
        </button>
      ))}
      <button type="button" className="ml-auto text-xs opacity-70" onClick={() => setPending([])}>
        ✕
      </button>
    </div>
  );
}

function beep() {
  try {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new C();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {}
}
