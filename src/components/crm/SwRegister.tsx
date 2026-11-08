"use client";
import { useEffect } from "react";

/** Registra o service worker do app (instalação + notificações). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/crm-sw.js", { scope: "/crm" }).catch(() => null);
  }, []);
  return null;
}
