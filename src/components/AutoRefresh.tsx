"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Atualiza a página do servidor periodicamente (pedidos em tempo "quase real"). */
export function AutoRefresh({ ms = 5000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
// TODO(evolução): trocar polling por SSE/WebSocket (ou Supabase Realtime) quando houver volume.
