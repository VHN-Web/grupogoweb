"use client";
// Menu de acessibilidade: tamanho do texto, alto contraste, menos movimento, links sublinhados e leitura espaçada.
// As escolhas ficam no aparelho (localStorage) e viram classes no <html>, aplicadas antes da página aparecer
// pelo script de components/a11y/A11yBoot.
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export type A11yPrefs = { scale: 0 | 1 | 2; contrast: boolean; motion: boolean; links: boolean; spacing: boolean };
const KEY = "gw_a11y";
const DEFAULT: A11yPrefs = { scale: 0, contrast: false, motion: false, links: false, spacing: false };

function apply(p: A11yPrefs) {
  const h = document.documentElement;
  h.classList.toggle("a11y-scale-1", p.scale === 1);
  h.classList.toggle("a11y-scale-2", p.scale === 2);
  h.classList.toggle("a11y-contrast", p.contrast);
  h.classList.toggle("a11y-motion", p.motion);
  h.classList.toggle("a11y-links", p.links);
  h.classList.toggle("a11y-spacing", p.spacing);
}

const TXT = {
  pt: { title: "Acessibilidade", size: "Tamanho do texto", sizes: ["Normal", "Grande", "Muito grande"], contrast: "Alto contraste", motion: "Menos movimento", links: "Sublinhar links", spacing: "Texto mais espaçado", reset: "Restaurar padrão", open: "Abrir opções de acessibilidade", close: "Fechar" },
  es: { title: "Accesibilidad", size: "Tamaño del texto", sizes: ["Normal", "Grande", "Muy grande"], contrast: "Alto contraste", motion: "Menos movimiento", links: "Subrayar enlaces", spacing: "Texto más espaciado", reset: "Restablecer", open: "Abrir opciones de accesibilidad", close: "Cerrar" },
};

export function A11yMenu({ locale, variant = "dark" }: { locale: "es" | "pt"; variant?: "dark" | "light" | "floating" }) {
  const t = TXT[locale];
  const id = useId();
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<A11yPrefs>(DEFAULT);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setP({ ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") });
    } catch {}
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button, input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function set(next: Partial<A11yPrefs>) {
    const v = { ...p, ...next };
    setP(v);
    apply(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {}
  }

  const btn =
    variant === "floating"
      ? "fixed bottom-4 left-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-[#1D4F91] text-white shadow-lg"
      : variant === "light"
        ? "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-[#3F4654] hover:bg-black/5"
        : "flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-white/80 hover:text-white";

  const Toggle = ({ k, label }: { k: "contrast" | "motion" | "links" | "spacing"; label: string }) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={p[k]} onChange={(e) => set({ [k]: e.target.checked })} className="a11y-switch" />
    </label>
  );

  return (
    <div className={variant === "floating" ? "no-print" : "relative no-print"}>
      <button type="button" className={btn} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id} aria-label={t.open}>
        <Icon name="access" size={variant === "floating" ? 24 : 18} />
        {variant !== "floating" && <span>{t.title}</span>}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="dialog"
          aria-label={t.title}
          className={`z-50 w-72 rounded-2xl bg-white p-4 text-[15px] text-[#1B2230] shadow-2xl ring-1 ring-black/10 ${variant === "floating" ? "fixed bottom-20 left-4" : variant === "light" ? "absolute bottom-full left-1/2 mb-2 -translate-x-1/2" : "fixed bottom-4 left-4"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">{t.title}</p>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5" aria-label={t.close}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <fieldset>
            <legend className="text-sm text-[#5B6474]">{t.size}</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {t.sizes.map((s, i) => (
                <button key={s} type="button" aria-pressed={p.scale === i} onClick={() => set({ scale: i as 0 | 1 | 2 })} className={`rounded-lg border px-2 py-2 font-semibold ${p.scale === i ? "border-[#1D4F91] bg-[#1D4F91] text-white" : "border-black/15"}`} style={{ fontSize: 13 + i * 2 }}>
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="mt-2 divide-y divide-black/5">
            <Toggle k="contrast" label={t.contrast} />
            <Toggle k="motion" label={t.motion} />
            <Toggle k="links" label={t.links} />
            <Toggle k="spacing" label={t.spacing} />
          </div>
          <button type="button" onClick={() => set(DEFAULT)} className="mt-2 text-sm font-semibold text-[#1D4F91] underline">
            {t.reset}
          </button>
        </div>
      )}
    </div>
  );
}
