"use client";
// Galeria do produto na loja: foto principal em destaque, miniaturas, setas, gesto de arrastar no celular,
// teclado (← →), ampliação em tela cheia e vídeo com player nativo (nunca começa sozinho com som).
// Carrega só a mídia visível (lazy), com fundo de espera e aviso quando um arquivo não abre.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type GalleryItem = { kind: "image" | "video"; url: string };

type Props = { items: GalleryItem[]; alt: string; tile: string; T: (es: string, pt: string) => string; fallback: ReactNode };

export function ProductGallery({ items, alt, tile, T, fallback }: Props) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const n = items.length;
  const go = useCallback((d: number) => setI((x) => (n ? (x + d + n) % n : 0)), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!n) return <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-2xl" style={{ background: tile }}>{fallback}</div>;
  const cur = items[Math.min(i, n - 1)];

  return (
    <div className="space-y-2">
      <Stage item={cur} index={i} total={n} alt={alt} tile={tile} T={T} onPrev={() => go(-1)} onNext={() => go(1)} onZoom={() => cur.kind === "image" && setZoom(true)} />
      {n > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={T("Fotos del producto", "Fotos do produto")}>
          {items.map((it, k) => (
            <button
              key={it.url}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={`${it.kind === "video" ? T("Video", "Vídeo") : T("Foto", "Foto")} ${k + 1}`}
              onClick={() => setI(k)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition ${k === i ? "border-[var(--brand)]" : "border-transparent opacity-70 hover:opacity-100"}`}
              style={{ background: tile }}
            >
              {it.kind === "video" ? (
                <span className="grid h-full w-full place-items-center bg-black/70 text-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
      {zoom && cur.kind === "image" && <Lightbox items={items} index={i} alt={alt} T={T} onIndex={setI} onClose={() => setZoom(false)} />}
    </div>
  );
}

/** Área principal: arrastar para os lados troca de mídia (celular); setas no computador. */
function Stage({ item, index, total, alt, tile, T, onPrev, onNext, onZoom }: { item: GalleryItem; index: number; total: number; alt: string; tile: string; T: Props["T"]; onPrev: () => void; onNext: () => void; onZoom: () => void }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <div
      className="group relative aspect-square w-full touch-pan-y select-none overflow-hidden rounded-2xl"
      style={{ background: tile }}
      onPointerDown={(e) => {
        if (item.kind === "video" || e.pointerType === "mouse") return;
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const x = e.clientX - start.current.x;
        if (Math.abs(x) > Math.abs(e.clientY - start.current.y)) setDx(x);
      }}
      onPointerUp={() => {
        if (start.current && Math.abs(dx) > 50) (dx > 0 ? onPrev : onNext)();
        start.current = null;
        setDx(0);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
    >
      <div key={item.url} className="anim-fade-in h-full w-full transition-transform duration-150" style={{ transform: dx ? `translateX(${dx * 0.4}px)` : undefined }}>
        <Media item={item} alt={alt} T={T} onClick={onZoom} />
      </div>
      {total > 1 && (
        <>
          <button type="button" onClick={onPrev} aria-label={T("Anterior", "Anterior")} className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-xl text-white backdrop-blur transition hover:bg-black/60 sm:grid">‹</button>
          <button type="button" onClick={onNext} aria-label={T("Siguiente", "Próxima")} className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-xl text-white backdrop-blur transition hover:bg-black/60 sm:grid">›</button>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, k) => (
              <span key={k} className={`h-1.5 rounded-full bg-white shadow transition-all ${k === index ? "w-4 opacity-100" : "w-1.5 opacity-60"}`} />
            ))}
          </div>
          <span className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white">{index + 1}/{total}</span>
        </>
      )}
    </div>
  );
}

/** Uma foto ou um vídeo, com fundo de espera e aviso de arquivo indisponível. */
function Media({ item, alt, T, onClick, contain }: { item: GalleryItem; alt: string; T: Props["T"]; onClick?: () => void; contain?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  if (state === "error")
    return (
      <div className="grid h-full w-full place-items-center p-6 text-center text-sm opacity-70">
        {item.kind === "video" ? T("No pudimos cargar el video.", "Não foi possível carregar o vídeo.") : T("Foto no disponible.", "Foto indisponível.")}
      </div>
    );
  return (
    <div className="relative h-full w-full">
      {state === "loading" && <div className="absolute inset-0 animate-pulse bg-black/10" aria-hidden="true" />}
      {item.kind === "video" ? (
        // sem autoplay e sem som automático; "preload=metadata" carrega só o começo (economia de dados)
        <video src={item.url} controls playsInline muted preload="metadata" className="h-full w-full bg-black object-contain" onLoadedMetadata={() => setState("ok")} onError={() => setState("error")} aria-label={`${T("Video de", "Vídeo de")} ${alt}`} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={alt} decoding="async" onLoad={() => setState("ok")} onError={() => setState("error")} onClick={onClick} className={`h-full w-full ${contain ? "object-contain" : "cursor-zoom-in object-cover"}`} />
      )}
    </div>
  );
}

/** Tela cheia: foto inteira, toque/clique para ampliar 2x e arrastar, setas e miniaturas. */
function Lightbox({ items, index, alt, T, onIndex, onClose }: { items: GalleryItem[]; index: number; alt: string; T: Props["T"]; onIndex: (i: number) => void; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState("50% 50%");
  const n = items.length;
  const cur = items[index];
  const nav = (d: number) => {
    setScale(1);
    onIndex((index + d + n) % n);
  };
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="flex items-center justify-between p-3">
        <span className="text-sm opacity-80">{index + 1}/{n}</span>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg" aria-label={T("Cerrar", "Fechar")}>✕</button>
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        onClick={(e) => {
          if (cur.kind !== "image") return;
          const r = e.currentTarget.getBoundingClientRect();
          setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
          setScale((s) => (s > 1 ? 1 : 2.2));
        }}
      >
        <div className="h-full w-full transition-transform duration-200" style={{ transform: `scale(${scale})`, transformOrigin: origin, cursor: cur.kind === "image" ? (scale > 1 ? "zoom-out" : "zoom-in") : "default" }}>
          <Media key={cur.url} item={cur} alt={alt} T={T} contain />
        </div>
        {n > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); nav(-1); }} aria-label={T("Anterior", "Anterior")} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl">‹</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); nav(1); }} aria-label={T("Siguiente", "Próxima")} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-2xl">›</button>
          </>
        )}
      </div>
      <p className="p-3 text-center text-xs opacity-60">{T("Tocá la foto para ampliar", "Toque na foto para ampliar")}</p>
    </div>
  );
}
