"use client";
import { useFormStatus } from "react-dom";

/** Botão de formulário que mostra "carregando" enquanto o servidor trabalha. */
export function SubmitButton({ children, pending, className, disabled }: { children: React.ReactNode; pending?: string; className?: string; disabled?: boolean }) {
  const s = useFormStatus();
  return (
    <button className={`${className ?? ""} disabled:opacity-60`} disabled={disabled || s.pending} aria-busy={s.pending}>
      {s.pending ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> {pending ?? "Aguarde…"}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
