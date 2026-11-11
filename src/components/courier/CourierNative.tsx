"use client";
// Pedaços do app do entregador que só fazem algo dentro do app Android (mobile/android).
import { useEffect } from "react";
import { nativeApp } from "@/lib/native-bridge";

/** Na tela de entrar: garante que o GPS em segundo plano parou (saiu do celular / sessão trocada). */
export function NativeSignedOut() {
  useEffect(() => {
    try {
      nativeApp()?.stopTracking();
    } catch {}
  }, []);
  return null;
}

/** "Sair deste celular": antes de sair, o app apaga o aviso deste aparelho e para o GPS. */
export function CourierLogoutForm({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form
      action={action}
      className="mt-6"
      onSubmit={() => {
        try {
          nativeApp()?.beforeLogout();
        } catch {}
      }}
    >
      <button className="w-full rounded-2xl border border-[var(--s-line)] py-3 text-sm font-semibold text-red-500">{label}</button>
    </form>
  );
}

/** Passa o idioma escolhido (pt/es/en) para o app Android: avisos e tela da corrida no mesmo idioma das telas. */
export function NativeLangSync({ lang }: { lang: string }) {
  useEffect(() => {
    try {
      nativeApp()?.setLang?.(lang);
    } catch {}
  }, [lang]);
  return null;
}
