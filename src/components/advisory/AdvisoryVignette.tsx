"use client";
// Vinheta da Assessoria GoWeb: "vídeo" em cenas (tipografia cinética + Geovana), feito em HTML/CSS —
// leve, nítido em qualquer tela, nos dois idiomas, sem arquivo de vídeo no Blob. Toca quando aparece na tela,
// pausa fora dela e respeita "menos movimento" (mostra direto a cena final).
import { useEffect, useRef, useState } from "react";
import { GoWebMark } from "@/components/brand/GoWebLogo";
import { GEOVANA_FACE, GEOVANA_IMG } from "@/components/geovana/Geovana";

type Props = { locale: "es" | "pt"; country?: string; ctaHref?: string; ctaLabel?: string; autoPlay?: boolean; startAt?: number };

const IVORY = "#F4F1EA";
const INK = "#0E0E10";
const GREEN = "#3CC46B";
const BLUE = "#1F7FD8";

function CountUp({ to, ms = 1400, delay = 0, fmt }: { to: number; ms?: number; delay?: number; fmt: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, delay]);
  return <>{fmt(v)}</>;
}

const Words = ({ text, from = 0, step = 0.12, style }: { text: string; from?: number; step?: number; style?: React.CSSProperties }) => (
  <span style={style}>
    {text.split(" ").map((w, i) => (
      <span key={i} className="vg-w" style={{ ["--d" as string]: `${from + i * step}s`, marginRight: ".25em" }}>
        {w}
      </span>
    ))}
  </span>
);

export function AdvisoryVignette({ locale, country = "BR", ctaHref, ctaLabel, autoPlay = true, startAt = 0 }: Props) {
  const pt = locale === "pt";
  const T = (es: string, p: string) => (pt ? p : es);
  const br = country !== "PY";
  const money = (n: number) => (br ? `R$ ${n.toLocaleString("pt-BR")}` : `Gs. ${(n * 1000).toLocaleString("es-PY")}`);

  const scenes: { ms: number; bg: string; render: () => React.ReactNode }[] = [
    {
      ms: 2400,
      bg: IVORY,
      render: () => (
        <h2 style={{ fontSize: "9.5cqw", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-.03em", textAlign: "center", margin: 0 }}>
          <Words text={T("Tu tienda", "Sua loja")} />
          <br />
          <Words text={T("ya vende.", "já vende.")} from={0.3} />
        </h2>
      ),
    },
    {
      ms: 2600,
      bg: IVORY,
      render: () => (
        <h2 style={{ fontSize: "8.4cqw", fontWeight: 800, lineHeight: 1, letterSpacing: "-.03em", textAlign: "center", margin: 0 }}>
          <Words text={T("Pero puede vender", "Mas dá pra vender")} />
          <br />
          <span className="vg-w vg-mark" style={{ ["--d" as string]: ".55s", padding: "0 .1em" }}>
            {T("mucho más.", "muito mais.")}
          </span>
        </h2>
      ),
    },
    {
      ms: 3300,
      bg: BLUE,
      render: () => (
        <div className="vg-row vg-hello">
          <div style={{ flex: 1, color: "#fff" }}>
            <p className="vg-up" style={{ fontSize: "3cqw", fontWeight: 700, margin: 0, opacity: 0.85 }}>
              {T("¡Hola! Soy la", "Oi! Eu sou a")}
            </p>
            <p className="vg-slam" style={{ ["--d" as string]: ".25s", fontSize: "11cqw", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-.04em", margin: 0 }}>
              Geovana.
            </p>
            <p className="vg-up" style={{ ["--d" as string]: ".8s", fontSize: "3.2cqw", fontWeight: 600, margin: "1.5cqw 0 0", maxWidth: "36cqw" }}>
              {T("Tu asesora de crecimiento en GoWeb.", "Sua assessora de crescimento na GoWeb.")}
            </p>
          </div>
          <img className="vg-slide vg-gv" src={GEOVANA_IMG} alt="" style={{ ["--d" as string]: ".1s" }} />
        </div>
      ),
    },
    {
      ms: 3500,
      bg: IVORY,
      render: () => {
        const r = 15;
        const len = 2 * Math.PI * r;
        const bars: [string, number][] = [
          [T("Ticket", "Ticket"), 48],
          [T("Frecuencia", "Frequência"), 35],
          [T("Clientes nuevos", "Clientes novos"), 71],
          [T("Google y Maps", "Google e Maps"), 40],
        ];
        return (
          <div className="vg-row">
            <div className="vg-pop vg-card" style={{ background: "#fff", borderRadius: "3cqw", padding: "3cqw", boxShadow: "0 2cqw 5cqw rgba(14,14,16,.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "2.4cqw" }}>
                <svg viewBox="0 0 40 40" style={{ width: "13cqw", height: "13cqw", transform: "rotate(-90deg)" }}>
                  <circle cx="20" cy="20" r={r} fill="none" stroke="#E7E3DA" strokeWidth="5" />
                  <circle className="vg-ring" cx="20" cy="20" r={r} fill="none" stroke={GREEN} strokeWidth="5" strokeLinecap="round" strokeDasharray={len} style={{ ["--len" as string]: `${len}`, ["--to" as string]: `${len * (1 - 0.62)}`, ["--d" as string]: ".3s", strokeDashoffset: len * (1 - 0.62) }} />
                </svg>
                <div>
                  <p style={{ margin: 0, fontSize: "2cqw", fontWeight: 700, color: "#6B6B6B" }}>{T("Nota de tu tienda", "Nota da sua loja")}</p>
                  <p style={{ margin: 0, fontSize: "6.4cqw", fontWeight: 800, lineHeight: 1 }}>
                    <CountUp to={62} delay={300} ms={1300} fmt={(n) => String(n)} />
                    <span style={{ fontSize: "2.6cqw", color: "#6B6B6B" }}>/100</span>
                  </p>
                </div>
              </div>
              <div style={{ marginTop: "2.4cqw", display: "grid", gap: "1.3cqw" }}>
                {bars.map(([label, v], i) => (
                  <div key={label} style={{ fontSize: "1.9cqw", fontWeight: 700 }}>
                    {label}
                    <div style={{ marginTop: ".5cqw", height: "1.2cqw", borderRadius: 99, background: "#EEE" }}>
                      <div className="vg-bar" style={{ ["--t" as string]: "1s", height: "100%", width: `${v}%`, borderRadius: 99, background: v >= 60 ? GREEN : v >= 45 ? "#E0A100" : "#E05A47", animationDelay: `${0.5 + i * 0.15}s` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <h3 style={{ flex: 1, fontSize: "5.4cqw", fontWeight: 800, lineHeight: 1.02, letterSpacing: "-.03em", margin: 0 }}>
              <Words text={T("En 1 minuto analizo tus pedidos", "Em 1 minuto eu analiso seus pedidos")} from={0.4} step={0.08} />
              <br />
              <span className="vg-w vg-mark" style={{ ["--d" as string]: "1.3s" }}>
                {T("y dónde ganar.", "e onde ganhar.")}
              </span>
            </h3>
          </div>
        );
      },
    },
    {
      ms: 2900,
      bg: GREEN,
      render: () => (
        <h2 style={{ fontSize: "10cqw", fontWeight: 800, lineHeight: 0.98, letterSpacing: "-.04em", margin: 0, color: INK, textAlign: "center" }}>
          <span className="vg-slam">{T("Más ticket.", "Mais ticket.")}</span>
          <span className="vg-slam" style={{ ["--d" as string]: ".55s" }}>{T("Más clientes.", "Mais clientes.")}</span>
          <span className="vg-slam" style={{ ["--d" as string]: "1.1s", color: "#fff" }}>{T("Más Google.", "Mais Google.")}</span>
        </h2>
      ),
    },
    {
      ms: 3500,
      bg: IVORY,
      render: () => {
        const cards: [string, string, string][] = [
          [T("LUN", "SEG"), T("Post del combo", "Post do combo"), GREEN],
          [T("MIÉ", "QUA"), T("Detrás de escena", "Bastidores"), BLUE],
          [T("VIE", "SEX"), `${T("Anuncio", "Anúncio")} · ${money(20)}/${T("día", "dia")}`, "#F5B301"],
          [T("SÁB", "SÁB"), T("Oferta del horario flojo", "Oferta do horário fraco"), "#1D4F91"],
        ];
        return (
          <div className="vg-row">
            <h3 style={{ flex: 1, fontSize: "5.6cqw", fontWeight: 800, lineHeight: 1.02, letterSpacing: "-.03em", margin: 0 }}>
              <Words text={T("Yo armo el calendario.", "Eu monto o calendário.")} step={0.09} />
              <br />
              <span className="vg-w vg-mark" style={{ ["--d" as string]: ".9s" }}>
                {T("Vos aprobás.", "Você aprova.")}
              </span>
            </h3>
            <div className="vg-list" style={{ display: "grid", gap: "1.6cqw" }}>
              {cards.map(([d, t, c], i) => (
                <div key={d} className="vg-slide" style={{ ["--d" as string]: `${0.2 + i * 0.22}s`, display: "flex", alignItems: "center", gap: "2cqw", background: "#fff", borderRadius: "2.2cqw", padding: "1.6cqw 2cqw", boxShadow: "0 1cqw 3cqw rgba(14,14,16,.1)" }}>
                  <span style={{ display: "grid", placeItems: "center", width: "7cqw", height: "7cqw", borderRadius: "1.8cqw", background: c, color: "#fff", fontWeight: 800, fontSize: "2cqw" }}>{d}</span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: "2.4cqw" }}>{t}</span>
                  <span className="vg-pop" style={{ ["--d" as string]: `${0.9 + i * 0.22}s`, display: "grid", placeItems: "center", width: "3.6cqw", height: "3.6cqw", borderRadius: 99, background: GREEN, color: "#fff", fontSize: "2.2cqw", fontWeight: 900 }}>
                    ✓
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      },
    },
    {
      ms: 3600,
      bg: INK,
      render: () => (
        <div style={{ textAlign: "center", color: IVORY }}>
          <p className="vg-up" style={{ margin: 0, fontSize: "3.4cqw", fontWeight: 700, color: "#B9B3A7" }}>
            {T(`Invertís ${money(150)} en el anuncio que te indico…`, `Você investe ${money(150)} no anúncio que eu indico…`)}
          </p>
          <p style={{ margin: "2cqw 0 0", fontSize: "12cqw", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-.04em", color: GREEN }}>
            <CountUp to={23} delay={600} ms={1200} fmt={(n) => `${n} ${T("pedidos", "pedidos")}`} />
          </p>
          <p className="vg-up" style={{ ["--d" as string]: "1.2s", margin: "1cqw 0 0", fontSize: "5cqw", fontWeight: 800 }}>
            <CountUp to={1380} delay={1200} ms={1200} fmt={(n) => `${money(n)} ${T("en ventas", "em vendas")}`} />
          </p>
          <p className="vg-up" style={{ ["--d" as string]: "1.8s", margin: "2.4cqw 0 0", fontSize: "1.8cqw", color: "#8C877D" }}>
            {T("Ejemplo ilustrativo: cada pedido se mide por el link del anuncio. No es garantía de resultado.", "Exemplo ilustrativo: cada pedido é medido pelo link do anúncio. Não é garantia de resultado.")}
          </p>
        </div>
      ),
    },
    {
      ms: 4200,
      bg: IVORY,
      render: () => (
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="vg-pop" style={{ display: "flex", alignItems: "center", gap: "2cqw" }}>
            <img src={GEOVANA_FACE} alt="" style={{ width: "9cqw", height: "9cqw", borderRadius: 999, boxShadow: `0 0 0 .5cqw #fff, 0 0 0 1cqw ${GREEN}` }} />
            <GoWebMark size={64} className="vg-mark-svg" />
          </div>
          <h2 className="vg-slam" style={{ ["--d" as string]: ".3s", margin: "2.4cqw 0 0", fontSize: "8.4cqw", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-.04em" }}>
            {T("Asesoría GoWeb", "Assessoria GoWeb")}
          </h2>
          <p className="vg-up" style={{ ["--d" as string]: ".8s", margin: "1.4cqw 0 0", fontSize: "3cqw", fontWeight: 600, color: "#55524C" }}>
            {T("Diagnóstico gratis · plan a tu medida · vos decidís cuánto invertir", "Diagnóstico grátis · plano sob medida · você decide quanto investir")}
          </p>
          {ctaHref && (
            <a className="vg-pop" href={ctaHref} style={{ ["--d" as string]: "1.2s", marginTop: "3cqw", display: "inline-block", padding: "1.8cqw 4cqw", borderRadius: 999, background: `linear-gradient(90deg, ${BLUE}, ${GREEN})`, color: "#fff", fontWeight: 800, fontSize: "2.8cqw", textDecoration: "none", boxShadow: "0 1.4cqw 3cqw rgba(31,127,216,.35)" }}>
              {ctaLabel ?? T("Hacer mi diagnóstico gratis", "Fazer meu diagnóstico grátis")}
            </a>
          )}
        </div>
      ),
    },
  ];

  const last = scenes.length - 1;
  const [i, setI] = useState(Math.min(startAt, last));
  const [playing, setPlaying] = useState(autoPlay);
  const [visible, setVisible] = useState(false);
  const [run, setRun] = useState(0); // remonta a cena ao repetir
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // menos movimento: vai direto para o cartão final
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("a11y-motion");
    if (reduce) {
      setI(last);
      setPlaying(false);
    }
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [last]);

  useEffect(() => {
    if (!playing || !visible || i >= last) return;
    const t = setTimeout(() => setI((x) => x + 1), scenes[i].ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, visible, run]);

  const s = scenes[i];
  const replay = () => {
    setI(0);
    setRun((r) => r + 1);
    setPlaying(true);
  };

  return (
    <div ref={box} className="vg" style={{ background: s.bg, transition: "background .35s" }} aria-roledescription={T("video", "vídeo")} aria-label={T("Presentación de la Asesoría GoWeb", "Apresentação da Assessoria GoWeb")}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&display=swap" precedence="default" />
      <div key={`${i}-${run}`} className="vg-scene" aria-live="polite">
        {s.render()}
      </div>
      {/* progresso estilo stories */}
      <div aria-hidden style={{ position: "absolute", left: "3cqw", right: "3cqw", top: "2cqw", display: "flex", gap: ".8cqw" }}>
        {scenes.map((sc, k) => (
          <span key={k} style={{ flex: 1, height: 4, borderRadius: 4, background: s.bg === INK || s.bg === BLUE || s.bg === GREEN ? "rgba(255,255,255,.3)" : "rgba(14,14,16,.12)", overflow: "hidden" }}>
            <span
              key={`${k}-${i}-${run}-${playing && visible}`}
              className={k === i && playing && visible && i < last ? "vg-bar" : undefined}
              style={{ display: "block", height: "100%", background: s.bg === IVORY ? INK : "#fff", transform: k < i || (k === i && (i === last || !playing)) ? "none" : k > i ? "scaleX(0)" : undefined, ["--t" as string]: `${sc.ms}ms` }}
            />
          </span>
        ))}
      </div>
      <div style={{ position: "absolute", right: "2.4cqw", bottom: "2.4cqw", display: "flex", gap: "1cqw" }}>
        {i < last && (
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? T("Pausar", "Pausar") : T("Reproducir", "Reproduzir")} style={ctrl(s.bg)}>
            {playing ? "❚❚" : "▶"}
          </button>
        )}
        <button type="button" onClick={replay} aria-label={T("Ver de nuevo", "Ver de novo")} style={ctrl(s.bg)}>
          ↻
        </button>
      </div>
    </div>
  );
}

const ctrl = (bg: string): React.CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: 999,
  border: 0,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  color: bg === IVORY ? INK : "#fff",
  background: bg === IVORY ? "rgba(14,14,16,.08)" : "rgba(255,255,255,.18)",
  backdropFilter: "blur(6px)",
});
