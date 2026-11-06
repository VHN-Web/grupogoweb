"use client";
import { useEffect, useRef } from "react";

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
      🖨️ {label}
    </button>
  );
}

/**
 * Impressão automática: cada pedido novo que aparecer no quadro é impresso uma única vez
 * (controle no navegador, para não repetir ao recarregar).
 */
export function AutoPrinter({ slug, orderIds, enabled }: { slug: string; orderIds: string[]; enabled: boolean }) {
  const first = useRef(true);
  useEffect(() => {
    if (!enabled) return;
    const key = `gw_printed_${slug}`;
    let printed: string[] = [];
    try {
      printed = JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {}
    // na primeira carga só marca os existentes, para não imprimir o histórico
    if (first.current && printed.length === 0) {
      first.current = false;
      localStorage.setItem(key, JSON.stringify(orderIds));
      return;
    }
    first.current = false;
    const fresh = orderIds.filter((id) => !printed.includes(id));
    fresh.forEach((id, i) => setTimeout(() => printUrl(`/painel/${slug}/imprimir/${id}`), i * 2500));
    if (fresh.length) localStorage.setItem(key, JSON.stringify([...printed, ...fresh].slice(-300)));
  }, [slug, orderIds, enabled]);
  return null;
}
