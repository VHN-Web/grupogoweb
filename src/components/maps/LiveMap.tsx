"use client";
// Mapa ao vivo (Leaflet + OpenStreetMap, sem chave nem custo). Busca `url` a cada `ms` e redesenha os pontos.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MapMarker = { id: string; kind: "courier" | "store" | "dest"; lat: number; lng: number; label?: string; heading?: number | null; muted?: boolean };

const SVG = {
  courier:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/><path d="M8.5 17.5h6l2-6h-4l-2-4H8"/><path d="M15 7h3l1 4"/></svg>',
  store:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M10 20v-6h4v6"/></svg>',
  dest: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
};

function iconHtml(m: MapMarker) {
  const bg = m.kind === "courier" ? (m.muted ? "#8a857b" : "#2FAE5F") : m.kind === "store" ? "#0E0E10" : "#E04848";
  const arrow =
    m.kind === "courier" && m.heading != null && !m.muted
      ? `<span style="position:absolute;left:50%;top:-9px;width:0;height:0;margin-left:-6px;border:6px solid transparent;border-bottom:9px solid ${bg};transform-origin:6px 27px;transform:rotate(${Math.round(m.heading)}deg)"></span>`
      : "";
  const label = m.label ? `<span style="position:absolute;top:44px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#fff;color:#0E0E10;font:600 11px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.25)">${m.label.replace(/[<>&"]/g, "")}</span>` : "";
  const pulse = m.kind === "courier" && !m.muted ? `<span class="gw-pulse" style="position:absolute;inset:-6px;border-radius:999px;background:${bg};opacity:.25"></span>` : "";
  return `<div style="position:relative;width:40px;height:40px">${pulse}${arrow}<span style="position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:${m.kind === "store" ? "12px" : "999px"};background:${bg};color:#fff;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)">${SVG[m.kind]}</span>${label}</div>`;
}

export function LiveMap({ url, ms = 5000, onData, className = "h-72", initial }: { url: string; ms?: number; onData?: (d: unknown) => void; className?: string; initial?: MapMarker[] }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onData);
  cb.current = onData;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let map: Leaflet.Map | null = null;
    const layers = new Map<string, Leaflet.Marker>();
    let fitted = false;
    let touched = false;

    (async () => {
      const L = await import("leaflet");
      if (stop || !box.current) return;
      map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([-15.8, -47.9], 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      map.on("dragstart zoomstart", (e) => {
        if ((e as unknown as { originalEvent?: Event }).originalEvent || e.type === "dragstart") touched = true;
      });

      const draw = (markers: MapMarker[]) => {
        if (!map) return;
        const seen = new Set<string>();
        for (const m of markers) {
          seen.add(m.id);
          const icon = L.divIcon({ html: iconHtml(m), className: "gw-mk", iconSize: [40, 40], iconAnchor: [20, 20] });
          const cur = layers.get(m.id);
          if (cur) {
            cur.setLatLng([m.lat, m.lng]);
            cur.setIcon(icon);
          } else {
            layers.set(m.id, L.marker([m.lat, m.lng], { icon, zIndexOffset: m.kind === "courier" ? 1000 : 0 }).addTo(map));
          }
        }
        for (const [id, mk] of layers) if (!seen.has(id)) (mk.remove(), layers.delete(id));
        if (!markers.length) return;
        const b = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        if (!fitted || !touched) {
          if (markers.length === 1) map.setView([markers[0].lat, markers[0].lng], fitted ? map.getZoom() : 15);
          else map.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
          fitted = true;
        }
      };

      if (initial?.length) draw(initial);
      const tick = async () => {
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (r.ok) {
            const d = await r.json();
            if (!stop) {
              draw((d?.markers as MapMarker[]) ?? []);
              cb.current?.(d);
            }
          }
        } catch {}
        if (!stop) timer = setTimeout(tick, document.hidden ? ms * 3 : ms);
      };
      tick();
    })();

    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ms]);

  return <div ref={box} className={`keep-light relative z-0 w-full overflow-hidden rounded-2xl border border-black/10 ${className}`} />;
}
