"use client";
// Frota ao vivo no painel da loja: entregadores (online/offline) e entregas em andamento.
import { useState } from "react";
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("./LiveMap").then((m) => m.LiveMap), { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-2xl bg-black/5" /> });

type Fleet = { couriers: { id: string; name: string; online: boolean; live: boolean; seenAt: string | null; deliveries: string[] }[]; orders: { id: string; number: string; courierId: string | null }[] };
type Txt = { online: string; offline: string; noGps: string; free: string; carrying: string; none: string; waiting: string };

export function FleetMap({ slug, t }: { slug: string; t: Txt }) {
  const [f, setF] = useState<Fleet | null>(null);
  const waiting = f?.orders.filter((o) => !o.courierId) ?? [];
  return (
    <div>
      <LiveMap url={`/api/painel/${slug}/frota`} ms={6000} onData={(x) => setF(x as Fleet)} className="h-80" />
      {f && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {f.couriers.length === 0 && <span className="text-muted">{t.none}</span>}
          {f.couriers.map((c) => (
            <span key={c.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${c.online ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-muted"}`}>
              <span className={`h-2 w-2 rounded-full ${c.online ? (c.live ? "bg-emerald-500" : "bg-amber-500") : "bg-gray-400"}`} />
              {c.name.split(" ")[0]} · {c.online ? (c.live ? (c.deliveries.length ? t.carrying.replace("{n}", c.deliveries.map((n) => `#${n}`).join(", ")) : t.free) : t.noGps) : t.offline}
            </span>
          ))}
          {waiting.length > 0 && <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">{t.waiting.replace("{n}", waiting.map((o) => `#${o.number}`).join(", "))}</span>}
        </div>
      )}
    </div>
  );
}
