"use client";
// GPS ao vivo do entregador: envia a posição enquanto ele está online e mantém a tela acesa.
// Observação: navegadores (principalmente iPhone) pausam o GPS com o app fechado/tela bloqueada —
// por isso pedimos a tela ligada (Wake Lock) durante as entregas.
// Dentro do app Android (window.AtlasApp) o GPS é nativo: um serviço em primeiro plano envia a posição
// com o app fechado e a tela bloqueada; aqui só ligamos/desligamos e mostramos o estado.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nativeApp, nativeStatus, type NativeStatus } from "@/lib/native-bridge";

type Txt = {
  waiting: string; ok: string; denied: string; unsupported: string; ago: string; screen: string; screenOn: string; weak: string;
  /** só no app Android */
  background?: string; settings?: string; battery?: string; offlineNet?: string;
};

export function CourierTracker({ online, sig, t }: { online: boolean; sig: string; t: Txt }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "waiting" | "ok" | "denied" | "unsupported">("idle");
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [acc, setAcc] = useState<number | null>(null);
  const [wake, setWake] = useState(false);
  const [, force] = useState(0);
  const [nst, setNst] = useState<NativeStatus | null>(null);
  const sigRef = useRef(sig);
  sigRef.current = sig;

  // app Android: liga/desliga o serviço nativo e acompanha o estado dele
  useEffect(() => {
    const nb = nativeApp();
    if (!nb) return;
    if (online) nb.startTracking();
    else nb.stopTracking();
    let prevSig: string | null = null;
    let prevTracking: boolean | null = null;
    const tick = () => {
      const st = nativeStatus();
      if (!st) return;
      setNst(st);
      if (!online) setState("idle");
      else if (st.permission === "denied") setState("denied");
      else if (st.tracking && st.lastSentAt) {
        setState("ok");
        setLastSent(st.lastSentAt);
        if (st.accuracy) setAcc(Math.round(st.accuracy));
      } else setState("waiting");
      // chegou/saiu entrega desde o último envio do serviço → recarrega a lista
      if (prevSig !== null && st.sig !== prevSig && st.sig !== sigRef.current) router.refresh();
      prevSig = st.sig;
      // o serviço parou sozinho (ficou offline pela notificação ou a sessão caiu) → atualiza a tela
      if (online && prevTracking === true && !st.tracking) router.refresh();
      prevTracking = st.tracking;
      force((n) => n + 1);
    };
    tick();
    const i = setInterval(tick, 3000);
    const now = () => tick();
    window.addEventListener("atlas:status", now);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        tick();
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(i);
      window.removeEventListener("atlas:status", now);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [online, router]);

  useEffect(() => {
    if (nativeApp()) return; // no app Android quem envia é o serviço nativo
    if (!online) return setState("idle");
    if (!("geolocation" in navigator)) return setState("unsupported");
    setState("waiting");
    let last: { lat: number; lng: number; at: number } | null = null;
    let pos: GeolocationPosition | null = null;
    let busy = false;
    let lock: { release: () => Promise<void> } | null = null;

    const send = async (p: GeolocationPosition) => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch("/api/entregador/ping", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed }),
        });
        if (r.ok) {
          const d = await r.json();
          last = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() };
          setLastSent(Date.now());
          setState("ok");
          if (typeof d.deliveries === "string" && d.deliveries !== sigRef.current) router.refresh();
          if (d.online === false) router.refresh();
        } else if (r.status === 401) router.refresh();
      } catch {}
      busy = false;
    };

    const moved = (p: GeolocationPosition) => {
      if (!last) return Infinity;
      const dLat = (p.coords.latitude - last.lat) * 111_000;
      const dLng = (p.coords.longitude - last.lng) * 111_000 * Math.cos((last.lat * Math.PI) / 180);
      return Math.hypot(dLat, dLng);
    };

    const watch = navigator.geolocation.watchPosition(
      (p) => {
        pos = p;
        setAcc(Math.round(p.coords.accuracy));
        // manda quando andou 20 m ou a cada 8 s
        if (!last || moved(p) > 20 || Date.now() - last.at > 8000) send(p);
      },
      (e) => setState(e.code === e.PERMISSION_DENIED ? "denied" : "waiting"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    // parado no semáforo também conta: reenvia a última posição a cada 20 s
    const keep = setInterval(() => {
      if (pos && (!last || Date.now() - last.at > 20000)) send(pos);
      force((n) => n + 1);
    }, 5000);

    const getLock = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void>; addEventListener: (e: string, f: () => void) => void }> } }).wakeLock;
        if (!wl || document.visibilityState !== "visible") return;
        const l = await wl.request("screen");
        lock = l;
        setWake(true);
        l.addEventListener("release", () => setWake(false));
      } catch {
        setWake(false);
      }
    };
    getLock();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        getLock();
        if (pos) send(pos);
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(keep);
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => null);
    };
  }, [online, router]);

  // offline: só confere de tempos em tempos se a loja mandou entrega
  useEffect(() => {
    if (online) return;
    const i = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(i);
  }, [online, router]);

  if (!online) return null;
  const secs = lastSent ? Math.max(0, Math.round((Date.now() - lastSent) / 1000)) : null;
  const tone = state === "ok" ? "bg-[var(--s-good-bg)] text-[var(--s-good-fg)]" : state === "denied" || state === "unsupported" ? "bg-red-500/15 text-red-500" : "bg-amber-400/15 text-amber-500";
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm font-semibold ${tone}`} role="status">
      <span className="relative flex h-2.5 w-2.5">
        {state === "ok" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
      </span>
      <span className="min-w-0 flex-1">
        {state === "ok" ? `${t.ok}${secs != null ? ` · ${t.ago.replace("{s}", String(secs))}` : ""}` : state === "denied" ? t.denied : state === "unsupported" ? t.unsupported : t.waiting}
        {state === "ok" && acc != null && acc > 150 && <span className="block text-xs font-normal opacity-80">{t.weak}</span>}
      </span>
      {nst ? (
        <span className="w-full space-y-2 pl-5 text-xs font-normal opacity-80">
          <span className="block">{nst.error === "network" && t.offlineNet ? t.offlineNet : t.background ?? t.screen}</span>
          {(state === "denied" || !nst.notifications) && t.settings && (
            <button type="button" onClick={() => nativeApp()?.openAppSettings()} className="mr-2 rounded-full bg-current/10 px-3 py-1 font-bold underline">{t.settings}</button>
          )}
          {!nst.battery && t.battery && (
            <button type="button" onClick={() => nativeApp()?.requestBatteryExemption()} className="rounded-full px-3 py-1 font-bold underline">{t.battery}</button>
          )}
        </span>
      ) : (
        <span className="w-full pl-5 text-xs font-normal opacity-80">{wake ? t.screenOn : t.screen}</span>
      )}
    </div>
  );
}
