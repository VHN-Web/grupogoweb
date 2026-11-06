// Logotipo Atlas — conceito "Ascensão": o topo do A sobe, dourado e deslocado.
// Gerado a partir da Syne ExtraBold (OFL) convertida em curvas. Não depende de fonte carregada.
import { useId } from "react";

const A_PATH = "M28.50 0L1 0L43.90-64L71.70-64L115 0L87.50 0L81.20-9.70L34.70-9.70L28.50 0M44.40-24.70L71.50-24.70L57.90-45.70";
const REST_PATH = "M108-45L108-64L212-64L212-45L172.50-45L172.50 0L147.50 0L147.50-45 M224-64L249-64L249-19L307.30-19L307.30 0L224 0 M341.80 0L314.30 0L357.20-64L385-64L428.30 0L400.80 0L394.50-9.70L348-9.70L341.80 0M357.70-24.70L384.80-24.70L371.20-45.70 M431.80-23.50L459.10-23.50Q459.80-21.40 463.20-19.95Q466.60-18.50 472.35-17.75Q478.10-17 485.70-17Q493.20-17 497.55-17.45Q501.90-17.90 503.70-19.05Q505.50-20.20 505.50-22.20Q505.50-24.10 502.60-25.15Q499.70-26.20 492.30-26.60Q484.90-27 471.50-27Q461.50-27 454.25-27.95Q447-28.90 442.35-30.95Q437.70-33 435.50-36.15Q433.30-39.30 433.30-43.70Q433.30-51.30 438.45-56.25Q443.60-61.20 454.05-63.65Q464.50-66.10 480.20-66.10Q503.20-66.10 515.35-59.45Q527.50-52.80 527.50-40.30L501.60-40.30Q501.10-43.60 495.40-45.35Q489.70-47.10 479.20-47.10Q468.80-47.10 463.75-45.90Q458.70-44.70 458.70-41.80Q458.70-40.30 460.10-39.40Q461.50-38.50 464.95-37.95Q468.40-37.40 474.70-37.20Q481-37 490.70-37Q501.40-37 508.90-35.95Q516.40-34.90 521.05-32.80Q525.70-30.70 527.80-27.45Q529.90-24.20 529.90-19.80Q529.90-12.20 525.10-7.40Q520.30-2.60 509.90-0.30Q499.50 2 482.70 2Q473.20 2 465.25 0.90Q457.30-0.20 451.10-2.35Q444.90-4.50 440.60-7.65Q436.30-10.80 434.05-14.75Q431.80-18.70 431.80-23.50";
const CUT = -33.28;

export const ATLAS_GOLD = "#C9A24A";

function AGlyph({ ink, accent, id }: { ink: string; accent: string; id: string }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-lo`}><rect x="-10" y={CUT + 2} width="400" height="200" /></clipPath>
        <clipPath id={`${id}-hi`}><rect x="-10" y={-200} width="400" height={200 + CUT - 2} /></clipPath>
      </defs>
      <path d={A_PATH} fill={ink} clipPath={`url(#${id}-lo)`} />
      <g transform="translate(5 -7)"><path d={A_PATH} fill={accent} clipPath={`url(#${id}-hi)`} /></g>
    </>
  );
}

/** Logotipo completo (ATLAS). `height` em px; a largura acompanha. */
export function AtlasLogo({ height = 28, ink = "#F4F1EA", accent = ATLAS_GOLD, className }: { height?: number; ink?: string; accent?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg height={height} viewBox="-4 -78.00 545.90 84.00" role="img" aria-label="Atlas" className={className}>
      <AGlyph ink={ink} accent={accent} id={id} />
      <path d={REST_PATH} fill={ink} />
    </svg>
  );
}

/** Símbolo (só o A) — ícone de app, favicon, avatar. */
export function AtlasMark({ size = 32, ink = "#F4F1EA", accent = ATLAS_GOLD, className }: { size?: number; ink?: string; accent?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="-7.00 -101.00 130.00 130.00" aria-hidden="true" className={className}>
      <AGlyph ink={ink} accent={accent} id={id} />
    </svg>
  );
}

export const ATLAS_MARK_SVG = (ink = "#F4F1EA", accent = ATLAS_GOLD) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-7.00 -101.00 130.00 130.00"><defs><clipPath id="lo"><rect x="-10" y="${CUT + 2}" width="400" height="200"/></clipPath><clipPath id="hi"><rect x="-10" y="-200" width="400" height="${200 + CUT - 2}"/></clipPath></defs><path d="${A_PATH}" fill="${ink}" clip-path="url(#lo)"/><g transform="translate(5 -7)"><path d="${A_PATH}" fill="${accent}" clip-path="url(#hi)"/></g></svg>`;
