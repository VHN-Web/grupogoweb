"use client";
// Mapa do pedido de delivery com o entregador ao vivo (consumidor e loja).
import { useState } from "react";
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("./LiveMap").then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-black/5" /> });

type Track = { status: string; courier: { name: string; seenAt: string | null } | null; courierName: string | null; km: number | null; eta: number | null; done: boolean };
type Txt = { waiting: string; preparing: string; live: string; eta: string; noGps: string; done: string };

export function OrderTracker({ orderId, t, className }: { orderId: string; t: Txt; className?: string }) {
  const [d, setD] = useState<Track | null>(null);
  const line = !d
    ? null
    : d.done
      ? t.done
      : d.status !== "OUT_FOR_DELIVERY"
        ? d.courierName
          ? t.preparing.replace("{nome}", d.courierName)
          : t.waiting
        : d.courier
          ? `${t.live.replace("{nome}", d.courier.name)}${d.eta != null ? ` · ${t.eta.replace("{min}", String(d.eta)).replace("{km}", String(d.km))}` : ""}`
          : t.noGps.replace("{nome}", d.courierName ?? "");
  return (
    <div className={className}>
      <LiveMap url={`/api/rastreio/${orderId}`} ms={5000} onData={(x) => setD(x as Track)} />
      {line && (
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
          {d?.courier && !d.done && <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3CC46B] opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#3CC46B]" /></span>}
          {line}
        </p>
      )}
    </div>
  );
}
