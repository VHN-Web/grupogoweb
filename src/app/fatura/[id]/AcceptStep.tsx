"use client";
import { useState } from "react";

/** Passo obrigatório antes de pagar a implantação: o cliente confirma que está ciente dos valores e do contrato. */
export function AcceptStep({ invoiceId, accepted, locale, children }: { invoiceId: string; accepted: boolean; locale: "es" | "pt"; children: React.ReactNode }) {
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  const [ok, setOk] = useState(accepted);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (ok) return <>{children}</>;
  const confirm = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/billing/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId, agree: true }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? T("No se pudo registrar.", "Não foi possível registrar."));
    setOk(true);
  };
  return (
    <div className="mt-6 space-y-3">
      <label className="flex items-start gap-3 rounded-xl bg-white p-4 text-sm ring-1 ring-line">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          {T(
            "Leí el resumen y el contrato. Estoy al tanto de los valores, de los servicios incluidos y de que la implementación no es reembolsable.",
            "Li o resumo e o contrato. Estou ciente dos valores, dos serviços incluídos e de que o valor da implantação não é reembolsável.",
          )}
        </span>
      </label>
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button onClick={confirm} disabled={!agree || busy} className="btn-primary w-full py-4 text-[15px]">
        {busy ? T("Registrando…", "Registrando…") : T("Estoy de acuerdo — continuar al pago", "Estou ciente e de acordo — continuar para o pagamento")}
      </button>
    </div>
  );
}
