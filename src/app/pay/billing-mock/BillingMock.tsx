"use client";
import { useState } from "react";
import { formatMinor } from "@/core/money";

export function BillingMock(p: { invoiceId: string; amount: number; currency: "PYG" | "USD" | "BRL"; returnUrl: string }) {
  const [busy, setBusy] = useState(false);
  const pay = async (approved: boolean) => {
    setBusy(true);
    await fetch("/api/billing/webhook/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invoiceId: p.invoiceId, approved, currency: p.currency, amount: p.amount }),
    });
    window.location.href = p.returnUrl;
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6">
      <div className="rounded-xl bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900">GATEWAY SIMULADO (testes)</div>
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">Valor</p>
        <p className="mt-1 text-3xl font-bold">{formatMinor(p.amount, p.currency)}</p>
      </div>
      <button disabled={busy} onClick={() => pay(true)} className="btn-primary py-4">Aprovar pagamento</button>
      <button disabled={busy} onClick={() => pay(false)} className="btn-ghost">Recusar</button>
    </main>
  );
}
