// Artes de divulgação do afiliado, geradas na hora com o QR e o link DELE.
// /api/afiliados/arte?modelo=caderno|comissao|demo&formato=story|post|flyer[&download=1]
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { ART_FORMATS, ART_MODELS } from "@/core/affiliate-kit";
import { shortName } from "@/core/affiliates";
import { goWebLogoSvg, GOWEB_LOGO_RATIO } from "@/components/brand/GoWebLogo";
import { getAffiliate } from "@/lib/affiliate-auth";
import { affiliateLink } from "@/services/affiliates";

export const runtime = "nodejs";

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(join(process.cwd(), "assets/fonts/BricolageGrotesque-Bold.ttf")).then((data) => ({ name: "Bricolage", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(process.cwd(), "assets/fonts/BricolageGrotesque-Regular.ttf")).then((data) => ({ name: "Bricolage", data, weight: 400 as const, style: "normal" as const })),
  ]));

const GREEN = "#3CC46B";
const INK = "#0E0E10";
const IVORY = "#F4F1EA";

const COPY: Record<string, { kicker: string; title: string; lines: string[] }> = {
  caderno: {
    kicker: "Para lanchonetes, restaurantes e lojas",
    title: "Saia do caderno. Venda pelo celular.",
    lines: ["Cardápio digital com QR na mesa", "Pedidos chegam organizados no WhatsApp", "Delivery, caixa e estoque no mesmo lugar"],
  },
  comissao: {
    kicker: "Seu cliente pede direto com você",
    title: "Pedidos sem comissão por pedido.",
    lines: ["Link próprio com a sua marca", "Taxa de entrega calculada por distância", "Primeira mensalidade só 30 dias após a entrega"],
  },
  demo: {
    kicker: "Demonstração gratuita · 20 minutos",
    title: "Veja o seu negócio vendendo online.",
    lines: ["Mostramos o sistema com um cardápio parecido com o seu", "Por videochamada ou WhatsApp", "Sem compromisso"],
  },
};

export async function GET(req: Request) {
  const a = await getAffiliate();
  if (!a || a.status !== "ACTIVE") return new Response("Faça login no portal do afiliado.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const model = ART_MODELS.find((m) => m.id === q.get("modelo"))?.id ?? "caderno";
  const fmt = ART_FORMATS.find((f) => f.id === q.get("formato")) ?? ART_FORMATS[0];
  const c = COPY[model];
  const flyer = fmt.id === "flyer";
  const story = fmt.id === "story";
  const link = `${affiliateLink(a.code)}?origem=${flyer ? "flyer" : "arte"}`;
  const short = affiliateLink(a.code).replace(/^https?:\/\//, "");
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 700, errorCorrectionLevel: "M", color: { dark: INK, light: "#FFFFFF" } });

  // flyer: fundo claro (econômico para imprimir); story/post: fundo ônix
  const bg = flyer ? IVORY : INK;
  const fg = flyer ? INK : IVORY;
  const muted = flyer ? "#5f5a52" : "#B9B3A7";
  const logo = `data:image/svg+xml;base64,${Buffer.from(goWebLogoSvg(!flyer)).toString("base64")}`;
  const W = fmt.w, H = fmt.h;
  const pad = 84;
  const titleSize = story ? 124 : flyer ? 104 : 96;
  const tall = story || flyer;
  const showCards = tall && model !== "demo";
  const qrSize = model === "demo" ? (story ? 420 : flyer ? 440 : 330) : story ? 340 : flyer ? 360 : 260;

  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: bg, color: fg, padding: pad, fontFamily: "Bricolage", position: "relative" }}>
        {/* brilhos de fundo */}
        <div style={{ position: "absolute", top: -220, right: -220, width: 640, height: 640, borderRadius: 999, background: flyer ? "rgba(60,196,107,.18)" : "rgba(31,127,216,.28)", display: "flex" }} />
        <div style={{ position: "absolute", bottom: -260, left: -200, width: 620, height: 620, borderRadius: 999, background: "rgba(60,196,107,.16)", display: "flex" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <img src={logo} width={Math.round(64 * GOWEB_LOGO_RATIO)} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 26, color: muted }}>goweboficial.com</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 140 : 70 }}>
          <div style={{ display: "flex", alignSelf: "flex-start", background: GREEN, color: INK, borderRadius: 999, padding: "12px 26px", fontSize: 28, fontWeight: 700 }}>{c.kicker}</div>
          <div style={{ display: "flex", fontSize: titleSize, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, marginTop: 34 }}>{c.title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 40 }}>
            {c.lines.map((l) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: tall ? 40 : 34, color: fg }}>
                <div style={{ display: "flex", width: 40, height: 40, borderRadius: 999, background: GREEN, alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                {l}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flex: 1 }} />
        {showCards && (
          // ilustração: pedidos chegando (exemplo)
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 48, marginTop: 40 }}>
            {[
              ["Novo pedido #128", "Delivery · 2 itens", "R$ 54,90"],
              ["Mesa 4 pediu pelo QR", "3 itens · aguardando preparo", "R$ 87,00"],
            ].map(([t, d, v], i) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 22, background: flyer ? "#FFFFFF" : "#1A1B1F", borderRadius: 28, padding: "24px 28px", marginLeft: i ? 70 : 0, marginRight: i ? 0 : 70, boxShadow: flyer ? "0 0 0 2px #E2DCCF" : "0 0 0 2px #2C2D33" }}>
                <div style={{ display: "flex", width: 64, height: 64, borderRadius: 18, background: i ? "#1F7FD8" : GREEN, alignItems: "center", justifyContent: "center" }}>
                  <svg width="34" height="34" viewBox="0 0 24 24"><path d="M6 6h15l-1.5 8.5H7.5L6 6zm0 0L5 3H2m6 17a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z" fill="none" stroke="#0E0E10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <div style={{ display: "flex", fontSize: 34, fontWeight: 700 }}>{t}</div>
                  <div style={{ display: "flex", fontSize: 26, color: muted }}>{d}</div>
                </div>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: flyer ? "#1E7A43" : GREEN }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 36, background: "#FFFFFF", color: INK, borderRadius: 40, padding: 32, boxShadow: flyer ? "0 0 0 3px #E2DCCF" : "none" }}>
          <img src={qr} width={qrSize} height={qrSize} alt="" style={{ borderRadius: 16 }} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10 }}>
            <div style={{ display: "flex", fontSize: story ? 46 : 40, fontWeight: 700, lineHeight: 1.08 }}>{flyer || model === "demo" ? "Aponte a câmera e agende a sua demonstração grátis" : "Agende uma demonstração grátis"}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#1D4F91", fontWeight: 700 }}>{short}</div>
            <div style={{ display: "flex", fontSize: 24, color: "#5f5a52" }}>Indicação de {shortName(a.name)} · parceiro GoWeb</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 26, fontSize: 24, color: muted }}>Clique, Conecte, Venda.</div>
      </div>
    ),
    { width: W, height: H, fonts: await loadFonts() },
  );
  const buf = await img.arrayBuffer();
  return new Response(buf, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=600",
      ...(q.get("download") ? { "content-disposition": `attachment; filename="goweb-${model}-${fmt.id}-${a.code}.png"` } : {}),
    },
  });
}
