"use client";
// Conta o acesso às páginas do site oficial e de afiliados (CRM → Acessos). Sem cookie: o servidor faz um hash do dia.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { visitArea } from "@/core/visits";

export function VisitBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path || !visitArea(path)) return;
    const sp = new URLSearchParams(window.location.search);
    const body = JSON.stringify({ path, ref: document.referrer || null, origem: sp.get("origem") || sp.get("ref"), utm: sp.get("utm_source") });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon("/api/visita", new Blob([body], { type: "application/json" }));
      else fetch("/api/visita", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => null);
    } catch {}
  }, [path]);
  return null;
}
