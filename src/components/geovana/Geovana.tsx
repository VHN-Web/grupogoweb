// Geovana — a personagem que representa a IA da GoWeb (WhatsApp, Instagram e Assessoria).
// Só CSS (classes .gv-* em globals.css): funciona em página de servidor, respeita "menos movimento".
// Imagens em public/geovana (recorte da arte oficial enviada pela GoWeb).

export const GEOVANA_IMG = "/geovana/geovana.webp";
export const GEOVANA_FACE = "/geovana/geovana-face.webp";

/** Rostinho redondo com o pontinho "online" pulsando. */
export function GeovanaAvatar({ size = 40, online = true, className }: { size?: number; online?: boolean; className?: string }) {
  return (
    <span className={`gv-avatar ${className ?? ""}`} style={{ width: size, height: size }}>
      <img src={GEOVANA_FACE} alt="Geovana" width={size} height={size} />
      {online && <span className="gv-online" aria-hidden />}
    </span>
  );
}

type Variant = "store" | "advisory";

type Script = { call: [string, string]; m1: string; m2: string; card: { title: string; line: string; cta: string }; badges: [string, string, string] };

function script(variant: Variant, pt: boolean, br: boolean): Script {
  const T = (es: string, pt_: string) => (pt ? pt_ : es);
  if (variant === "advisory")
    return {
      call: [T("¡Psst! Vení…", "Psiu! Vem cá…"), T("tu tienda puede vender más", "sua loja pode vender mais")],
      m1: T("¿Cómo hago para vender más?", "Como eu faço pra vender mais?"),
      m2: T("Ya hice el diagnóstico de tu tienda. Mirá:", "Já fiz o diagnóstico da sua loja. Olha:"),
      card: { title: T("Plan listo", "Plano pronto"), line: T("Ticket +10% · 3 posteos/sem. · anuncio guiado", "Ticket +10% · 3 posts/sem. · anúncio guiado"), cta: T("Ver mi plan", "Ver meu plano") },
      badges: [T("+1 pedido", "+1 pedido"), br ? "+R$ 48" : "+Gs. 48.000", "★ 5,0"],
    };
  return {
    call: [T("¡Hola! Soy la Geovana", "Oi! Eu sou a Geovana"), T("atiendo tu WhatsApp 24 h", "atendo seu WhatsApp 24 h")],
    m1: T("¿Hay hamburguesa hoy?", "Tem hambúrguer hoje?"),
    m2: T("¡Sí! Ya te armé el pedido:", "Tem sim! Já montei seu pedido:"),
    card: { title: br ? "1× X-Burger · R$ 29,90" : "1× Burger · Gs. 35.000", line: T("Entrega en 35 min", "Entrega em 35 min"), cta: T("Finalizar pedido", "Finalizar pedido") },
    badges: [T("Nuevo pedido", "Pedido novo"), T("+1 cliente", "+1 cliente"), T("Respondió en 3 s", "Respondeu em 3 s")],
  };
}

/** Geovana de corpo (até a cintura) apresentando um celular com conversa animada, balão "chamando" e selos. */
export function GeovanaHero({ locale, variant = "store", country = "BR", className, label }: { locale: "es" | "pt"; variant?: Variant; country?: string; className?: string; label?: string }) {
  const s = script(variant, locale === "pt", country !== "PY");
  return (
    <div className={`gv-hero ${className ?? ""}`} role="img" aria-label={label ?? (locale === "pt" ? "Geovana, a assistente de IA da GoWeb, mostrando uma conversa no celular" : "Geovana, la asistente de IA de GoWeb, mostrando una conversación en el celular")}>
      <span className="gv-ring" aria-hidden />
      <img className="gv-img" src={GEOVANA_IMG} alt="" width={640} height={881} />
      <div className="gv-phone" aria-hidden>
        <div className="gv-screen">
          <div className="gv-top">
            <img src={GEOVANA_FACE} alt="" />
            <span>
              Geovana
              <small>{locale === "pt" ? "online" : "en línea"}</small>
            </span>
          </div>
          <div className="gv-msgs">
            <p className="gv-b gv-out gv-m1">{s.m1}</p>
            <p className="gv-typing gv-t1">
              <i />
              <i />
              <i />
            </p>
            <p className="gv-b gv-in gv-m2">{s.m2}</p>
            <div className="gv-card gv-m3">
              <b>{s.card.title}</b>
              <span>{s.card.line}</span>
              <span className="gv-btn">{s.card.cta}</span>
            </div>
          </div>
        </div>
      </div>
      <p className="gv-bubble" aria-hidden>
        {s.call[0]}
        <span>{s.call[1]}</span>
      </p>
      <span className="gv-badge" style={{ left: "50%", top: "13%", animationDelay: ".4s" }} aria-hidden>
        <i />
        {s.badges[0]}
      </span>
      <span className="gv-badge" style={{ left: "56%", top: "74%", animationDelay: "1.9s" }} aria-hidden>
        <i style={{ background: "#1F7FD8" }} />
        {s.badges[1]}
      </span>
      <span className="gv-badge" style={{ left: "78%", top: "86%", animationDelay: "3.2s" }} aria-hidden>
        <i style={{ background: "#F5B301" }} />
        {s.badges[2]}
      </span>
    </div>
  );
}
