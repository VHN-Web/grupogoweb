"use client";
// Botão de tema: Claro, Escuro ou Sistema (segue o aparelho). Vale para o site todo neste aparelho.
import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";
const TXT = {
  pt: { light: "Claro", dark: "Escuro", system: "Sistema", label: "Tema" },
  es: { light: "Claro", dark: "Oscuro", system: "Sistema", label: "Tema" },
  en: { light: "Light", dark: "Dark", system: "System", label: "Theme" },
};

function apply(m: Mode) {
  const d = m === "dark" || (m === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const h = document.documentElement;
  h.classList.toggle("dark", d);
  h.style.colorScheme = d ? "dark" : "light";
  h.dataset.themeMode = m;
}

const ICON: Record<Mode, React.ReactNode> = {
  light: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  dark: (<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />),
  system: (<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
};

/** variant "segmented": três botões lado a lado. "compact": um botão que alterna. */
export function ThemeToggle({ locale, variant = "segmented", tone = "dark" }: { locale: "es" | "pt" | "en"; variant?: "segmented" | "compact"; tone?: "dark" | "light" | "glass" }) {
  const t = TXT[locale];
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      setMode((localStorage.getItem("gw_theme") as Mode) || "system");
    } catch {}
  }, []);
  function set(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem("gw_theme", m);
    } catch {}
    apply(m);
  }
  const order: Mode[] = ["light", "dark", "system"];
  const Svg = ({ m, size = 16 }: { m: Mode; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[m]}
    </svg>
  );

  if (variant === "compact") {
    const next = order[(order.indexOf(mode) + 1) % 3];
    return (
      <button
        type="button"
        onClick={() => set(next)}
        className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ${tone === "dark" ? "bg-white/10 text-white hover:bg-white/15" : tone === "glass" ? "bg-black/40 text-white backdrop-blur hover:bg-black/55" : "bg-black/5 hover:bg-black/10"}`}
        aria-label={`${t.label}: ${t[mode]}. ${locale === "pt" ? "Mudar para" : locale === "en" ? "Switch to" : "Cambiar a"} ${t[next]}`}
        title={`${t.label}: ${t[mode]}`}
      >
        <Svg m={mode} size={18} />
        <span className="hidden sm:inline">{t[mode]}</span>
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label={t.label} className={`inline-flex rounded-xl p-0.5 text-[13px] font-semibold ${tone === "dark" ? "bg-white/10" : "bg-black/5"}`}>
      {order.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => set(m)}
          className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 transition-colors ${mode === m ? (tone === "dark" ? "bg-white text-[#0F2747]" : "bg-white text-[#16130F] shadow-sm") : tone === "dark" ? "text-white/75 hover:text-white" : "text-current opacity-70 hover:opacity-100"}`}
        >
          <Svg m={m} />
          {t[m]}
        </button>
      ))}
    </div>
  );
}
