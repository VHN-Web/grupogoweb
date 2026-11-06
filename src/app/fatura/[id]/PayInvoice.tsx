"use client";
import { useState } from "react";

type Opt = { currency: "PYG" | "USD" | "BRL"; label: string; amount: string; available: boolean; via: string };

export function PayInvoice({ invoiceId, options, defaultCurrency, locale = "es" }: { invoiceId: string; options: Opt[]; defaultCurrency: Opt["currency"]; locale?: "es" | "pt" }) {
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  const first = options.find((o) => o.available && o.currency === defaultCurrency) ?? options.find((o) => o.available);
  const [cur, setCur] = useState(first?.currency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<{ text: string; amount: string } | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceId, currency: cur }),
    });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      setBusy(false);
      return;
    }
    if (j.kind === "redirect") window.location.href = j.url;
    else {
      setManual({ text: j.text, amount: j.amount });
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-3">
      {options.length > 1 && <p className="label !mb-0">{T("¿En qué moneda querés pagar?", "Em qual moeda você quer pagar?")}</p>}
      {options.map((o) => (
        <button
          key={o.currency}
          disabled={!o.available}
          onClick={() => {
            setCur(o.currency);
            setManual(null);
          }}
          className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left ring-1 transition disabled:opacity-40 ${
            cur === o.currency ? "bg-ink text-white ring-ink" : "bg-white ring-line"
          }`}
        >
          <span>
            <span className="block font-semibold">{o.label}</span>
            <span className={`text-xs ${cur === o.currency ? "text-white/70" : "text-muted"}`}>{o.available ? o.via : T("No disponible", "Indisponível")}</span>
          </span>
          <span className="text-lg font-bold">{o.amount}</span>
        </button>
      ))}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {manual ? (
        <div className="card whitespace-pre-line p-4 text-sm">
          <p className="font-semibold">{T("Pagá", "Pague")} {manual.amount}</p>
          <p className="mt-1 text-muted">{manual.text}</p>
          <p className="mt-2 text-xs text-muted">{T("Confirmamos manualmente y esta página se actualiza sola.", "Confirmamos manualmente e esta página se atualiza sozinha.")}</p>
        </div>
      ) : (
        <button onClick={pay} disabled={!cur || busy} className="btn-primary w-full py-4 text-[15px]">
          {busy ? T("Abriendo pago…", "Abrindo pagamento…") : T("Pagar ahora", "Pagar agora")}
        </button>
      )}
    </div>
  );
}
