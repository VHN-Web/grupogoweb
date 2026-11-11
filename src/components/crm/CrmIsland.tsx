"use client";
// "Ilha" do CRM (estilo Dynamic Island do iPhone): uma pílula no topo, perto da câmera, que mostra o que está
// acontecendo agora (compromisso em andamento ou chegando, lembrete, jornada com cronômetro) e se abre como
// banner quando chega um aviso novo. Busca /api/crm/app a cada ~25 s com a tela aberta.
// No app Android a mesma informação vira notificação em andamento com cronômetro (ponte setLive).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { liveShort, type Live } from "@/core/crm-planner";
import { nativeApp } from "@/lib/native-bridge";
import { Icon } from "@/components/ui/Icon";

type Note = { id: string; title: string; body: string; url: string; category: string; ring: boolean };

const ICON: Record<string, string> = { agenda: "calendar", lembretes: "alarm", vendas: "wallet", suporte: "chat", leads: "customers", retornos: "clock", demos: "calendar", whatsapp: "chat", afiliados: "team", acessos: "growth", homologacao: "check" };
const LIVE_ICON: Record<Live["kind"], string> = { event_now: "calendar", event_soon: "clock", reminder_soon: "alarm", journey: "play" };
const LIVE_COLOR: Record<Live["kind"], string> = { event_now: "#3CC46B", event_soon: "#F5B301", reminder_soon: "#1F7FD8", journey: "#3CC46B" };

export function CrmIsland() {
  const router = useRouter();
  const [live, setLive] = useState<Live | null>(null);
  const [queue, setQueue] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const since = useRef<string>(new Date().toISOString());
  const nativeKey = useRef("");

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch(`/api/crm/app?since=${encodeURIComponent(since.current)}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { live: Live | null; notifications: Note[]; now: string };
      setLive(j.live);
      // app Android: notificação em andamento com cronômetro (só quando muda)
      const key = j.live ? `${j.live.kind}:${j.live.id}:${"at" in j.live ? j.live.at : j.live.since}` : "";
      if (key !== nativeKey.current) {
        nativeKey.current = key;
        nativeApp()?.setLive?.(j.live ? JSON.stringify(j.live) : "");
      }
      if (j.notifications?.length) {
        setQueue((q) => [...q, ...j.notifications.slice().reverse()]);
        if (j.notifications.some((n) => n.ring)) navigator.vibrate?.([30, 60, 30]);
        router.refresh(); // número do sininho
      }
      if (j.now) since.current = j.now;
    } catch {}
  }, [router]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 25_000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  // relógio da pílula (só quando há algo ao vivo)
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  // banner some sozinho depois de 6 s
  const banner = queue[0] ?? null;
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 6000);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner && !live) return null;
  const expanded = !!banner || open;
  const go = (url: string) => {
    setOpen(false);
    setQueue((q) => q.slice(1));
    router.push(url);
  };

  return (
    <div className="crm-island-wrap" aria-live="polite">
      <div className={`crm-island ${expanded ? "is-open" : ""}`} role="status">
        {banner ? (
          <button type="button" className="flex w-full items-start gap-3 text-left" onClick={() => go(banner.url || "/crm/avisos")}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#3CC46B] text-[#0E0E10]">
              <Icon name={ICON[banner.category] ?? "bell"} size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{banner.title}</span>
              <span className="line-clamp-2 block text-[13px] text-white/75">{banner.body}</span>
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Fechar"
              onClick={(e) => {
                e.stopPropagation();
                setQueue((q) => q.slice(1));
              }}
              className="grid h-8 w-8 place-items-center rounded-full bg-white/10"
            >
              <Icon name="close" size={14} />
            </span>
          </button>
        ) : live && open ? (
          <div className="w-full">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: LIVE_COLOR[live.kind], color: "#0E0E10" }}>
                <Icon name={LIVE_ICON[live.kind]} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{live.title}</span>
                <span className="block text-[13px] text-white/75">{liveShort(live, now)}</span>
              </span>
              <span className="font-mono text-2xl font-black tabular-nums" style={{ color: LIVE_COLOR[live.kind] }}>{liveShort(live, now).replace(/^.*?(\d[\d:]*)$/, "$1")}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => go(live.url)} className="flex-1 rounded-full bg-white py-2 text-sm font-bold text-[#0E0E10]">Abrir</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold">Recolher</button>
            </div>
          </div>
        ) : live ? (
          <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2" aria-label={`${live.title}: ${liveShort(live, now)}`}>
            <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ background: LIVE_COLOR[live.kind], color: "#0E0E10" }}>
              <Icon name={LIVE_ICON[live.kind]} size={13} />
              <span className="crm-island-ping" style={{ background: LIVE_COLOR[live.kind] }} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{live.title}</span>
            <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: LIVE_COLOR[live.kind] }}>{liveShort(live, now).replace(/^.*?(\d[\d:]*)$/, "$1")}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
