"use client";
// "Sair" do CRM: no app Android, antes de sair desliga os avisos deste aparelho e limpa os widgets.
import { nativeApp } from "@/lib/native-bridge";

export function CrmLogoutForm({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      className="text-center"
      onSubmit={() => {
        try {
          nativeApp()?.beforeLogout();
        } catch {}
      }}
    >
      <button className="text-sm font-semibold text-red-600 dark:text-red-300">Sair</button>
    </form>
  );
}
