// Peças visuais do portal do afiliado (server components, sem estado).
import { Icon } from "@/components/ui/Icon";

export const TIER_STYLE = [
  { color: "#CD8A4A", soft: "rgba(205,138,74,.16)", grad: "linear-gradient(135deg,#8a5328,#d79a5e)" }, // Bronze
  { color: "#AEB8C4", soft: "rgba(174,184,196,.16)", grad: "linear-gradient(135deg,#6f7a86,#d4dbe3)" }, // Prata
  { color: "#F2C14E", soft: "rgba(242,193,78,.16)", grad: "linear-gradient(135deg,#b07d12,#f6d77a)" }, // Ouro
  { color: "#7FD6F5", soft: "rgba(127,214,245,.16)", grad: "linear-gradient(135deg,#1F7FD8,#8fe6ff)" }, // Diamante
];
export const tierStyle = (i: number) => TIER_STYLE[Math.min(i, TIER_STYLE.length - 1)];

export const LEAD_COLOR: Record<string, string> = { NEW: "#1F7FD8", SCHEDULED: "#F2C14E", NOT_SCHEDULED: "#8a857b", SIGNED: "#7FD6F5", WON: "#3CC46B", LOST: "#E0614A" };

export const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)]";

/** Emblema do nível (escudo com gradiente). */
export function TierBadge({ index, name, size = 64 }: { index: number; name: string; size?: number }) {
  const s = tierStyle(index);
  return (
    <span className="aff-pop relative inline-grid place-items-center" style={{ width: size, height: size }} aria-label={`Nível ${name}`}>
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id={`tg${index}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity=".55" />
            <stop offset="1" stopColor={s.color} />
          </linearGradient>
        </defs>
        <path d="M32 3 56 12v18c0 15-10 26-24 31C18 56 8 45 8 30V12z" fill={`url(#tg${index})`} />
        <path d="M32 9 50 16v14c0 11-7 20-18 24-11-4-18-13-18-24V16z" fill="rgba(0,0,0,.18)" />
        {Array.from({ length: index + 1 }).map((_, i) => (
          <path key={i} transform={`translate(${32 - index * 6 + i * 12 - 6} ${26})`} d="M6 0l1.8 3.7 4 .6-2.9 2.8.7 4L6 9.2 2.4 11.1l.7-4L.2 4.3l4-.6z" fill="#fff" />
        ))}
      </svg>
    </span>
  );
}

export function Bar({ pct, color = "#3CC46B", h = 10 }: { pct: number; color?: string; h?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-[var(--s-soft)]" style={{ height: h }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="aff-bar h-full rounded-full" style={{ ["--w" as string]: `${Math.max(2, Math.round(pct * 100))}%`, background: color }} />
    </div>
  );
}

export function Ring({ pct, color, children, size = 120 }: { pct: number; color: string; children: React.ReactNode; size?: number }) {
  return (
    <div className="aff-ring relative grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, ["--p" as string]: Math.round(pct * 100), ["--c" as string]: color }}>
      <div className="grid place-items-center rounded-full bg-[#141416]" style={{ width: size - 16, height: size - 16 }}>{children}</div>
    </div>
  );
}

export function Stat({ icon, label, value, hint, accent = "#3CC46B" }: { icon: string; label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className={`${card} lift p-4`}>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--s-muted)]">
        <span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: `${accent}22`, color: accent }}><Icon name={icon} size={16} /></span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-[var(--s-muted)]">{hint}</p>}
    </div>
  );
}

export function Medal({ pos }: { pos: number }) {
  const c = pos === 1 ? "#F2C14E" : pos === 2 ? "#AEB8C4" : pos === 3 ? "#CD8A4A" : null;
  return c ? (
    <span className="grid h-8 w-8 place-items-center rounded-full text-sm font-black text-[#0E0E10]" style={{ background: c }}>{pos}</span>
  ) : (
    <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--s-soft)] text-sm font-bold">{pos}</span>
  );
}

export function Confetti() {
  const colors = ["#3CC46B", "#1F7FD8", "#F2C14E", "#22A8B8", "#F4F1EA"];
  return (
    <div aria-hidden="true" className="aff-confetti pointer-events-none absolute inset-x-0 top-0 h-0">
      {Array.from({ length: 24 }).map((_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 8) * 0.12}s` }} />
      ))}
    </div>
  );
}
