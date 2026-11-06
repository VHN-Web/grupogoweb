"use client";
import { useState } from "react";
import { formatMinor } from "@/core/money";

export function MockGateway(props: { refId: string; amount: number; currency: "PYG" | "USD" | "BRL"; returnUrl: string; slug: string }) {
  const [busy, setBusy] = useState(false);
  const pay = async (approved: boolean) => {
    setBusy(true);
    await fetch(`/api/payments/mock_online/webhook?t=${encodeURIComponent(props.slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref: props.refId, approved }),
    });
    window.location.href = props.returnUrl;
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div className="rounded-xl bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900">
        GATEWAY SIMULADO — reemplazar por Bancard / Pagopar
      </div>
      <div className="card p-6 text-center">
        <p className="text-sm text-muted">Monto a pagar</p>
        <p className="mt-1 text-3xl font-bold">{formatMinor(props.amount, props.currency)}</p>
        <div className="mt-6 space-y-2 text-left">
          <input className="input" defaultValue="4111 1111 1111 1111" readOnly aria-label="Tarjeta" />
          <div className="flex gap-2">
            <input className="input" defaultValue="12/29" readOnly aria-label="Vencimiento" />
            <input className="input" defaultValue="123" readOnly aria-label="CVV" />
          </div>
        </div>
      </div>
      <button disabled={busy} onClick={() => pay(true)} className="btn-primary py-4">Aprobar pago</button>
      <button disabled={busy} onClick={() => pay(false)} className="btn-ghost">Rechazar</button>
    </main>
  );
}
