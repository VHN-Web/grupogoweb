"use client";
// Envia um formulário uma vez ao abrir (atalho "+ Nota" do widget do Android abre /crm/notas?nova=1).
import { useEffect, useRef } from "react";

export function AutoSubmit({ action, fields = {} }: { action: (f: FormData) => void | Promise<void>; fields?: Record<string, string> }) {
  const ref = useRef<HTMLFormElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    ref.current?.requestSubmit();
  }, []);
  return (
    <form ref={ref} action={action} hidden>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </form>
  );
}
