// Galeria multimídia dos produtos (fotos + vídeo) — regras PURAS.
// A foto principal continua em products.image_url (vitrine, cards, Geovana, demos: nada muda para quem já usa);
// as demais fotos e o vídeo ficam em product_media, na ordem escolhida pelo lojista.
// Limites pensados para o Vercel Blob do plano gratuito (1 GB de arquivos, 10 GB de transferência/mês):
// passar disso BLOQUEIA o Blob por 30 dias e todas as fotos somem — por isso a cota global de vídeo.

export type MediaKind = "image" | "video";
export type MediaItem = { id: string; kind: MediaKind; url: string; position: number };

export const MAX_EXTRA_IMAGES = 9; // + a principal = 10 fotos por produto
export const MAX_VIDEOS_PER_PRODUCT = 1;
export const VIDEO_MAX_BYTES = 15 * 1024 * 1024; // decisão de 11/11/2026: 1 vídeo de até 15 MB por produto
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
/** Teto de vídeos somados na plataforma (MEDIA_VIDEO_QUOTA_MB): deixa folga para as fotos dentro de 1 GB. */
export const DEFAULT_VIDEO_QUOTA_BYTES = 300 * 1024 * 1024;

export function videoQuotaBytes(env: string | undefined) {
  const mb = Number(env);
  return Number.isFinite(mb) && mb > 0 ? Math.round(mb * 1024 * 1024) : DEFAULT_VIDEO_QUOTA_BYTES;
}

export const isVideoPath = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

/** Pasta de cada produto no Blob: só ela é aceita nos envios e nas remoções. */
export const productMediaPrefix = (tenantId: string, productId: string) => `tenants/${tenantId}/products/${productId}/`;

/** Caminho permitido para o envio direto do vídeo (navegador → Blob). */
export function validVideoPath(pathname: string, tenantId: string, productId: string) {
  const prefix = productMediaPrefix(tenantId, productId);
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  return /^[a-zA-Z0-9_-]{1,80}\.(mp4|webm|mov)$/.test(rest);
}

export type VideoCheck = { ok: true } | { ok: false; reason: "type" | "size" | "per_product" | "quota" };

/** Pode guardar este vídeo? Confere tipo, tamanho, 1 por produto e a cota global. */
export function videoAllowed(v: { contentType: string; size: number }, productVideos: number, platformVideoBytes: number, quota: number): VideoCheck {
  if (!VIDEO_TYPES[v.contentType]) return { ok: false, reason: "type" };
  if (v.size <= 0 || v.size > VIDEO_MAX_BYTES) return { ok: false, reason: "size" };
  if (productVideos >= MAX_VIDEOS_PER_PRODUCT) return { ok: false, reason: "per_product" };
  if (platformVideoBytes + v.size > quota) return { ok: false, reason: "quota" };
  return { ok: true };
}

export function videoReasonText(r: Exclude<VideoCheck, { ok: true }>["reason"], pt: boolean) {
  const T = (es: string, p: string) => (pt ? p : es);
  return {
    type: T("Usá un video MP4, WEBM o MOV.", "Use um vídeo MP4, WEBM ou MOV."),
    size: T("El video puede tener hasta 15 MB.", "O vídeo pode ter até 15 MB."),
    per_product: T("Cada producto puede tener 1 video. Quitá el actual para cambiarlo.", "Cada produto pode ter 1 vídeo. Remova o atual para trocar."),
    quota: T("Se alcanzó el espacio de videos de la plataforma. Avisá al soporte GoWeb.", "O espaço de vídeos da plataforma está cheio. Avise o suporte GoWeb."),
  }[r];
}

/** Galeria para quem compra: principal primeiro, depois a ordem do lojista. */
export function buildGallery(mainUrl: string | null, media: MediaItem[]) {
  const items: { kind: MediaKind; url: string }[] = [];
  if (mainUrl) items.push({ kind: "image", url: mainUrl });
  for (const m of [...media].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) {
    if (m.url && !items.some((i) => i.url === m.url)) items.push({ kind: m.kind, url: m.url });
  }
  return items;
}

/** Nova ordem (ids na ordem desejada): ignora ids estranhos, mantém no fim os que faltarem. */
export function reorder(media: MediaItem[], ids: string[]): { id: string; position: number }[] {
  const known = new Set(media.map((m) => m.id));
  const wanted = ids.filter((id, i) => known.has(id) && ids.indexOf(id) === i);
  const rest = [...media].sort((a, b) => a.position - b.position).map((m) => m.id).filter((id) => !wanted.includes(id));
  return [...wanted, ...rest].map((id, i) => ({ id, position: i }));
}

/** Mover um item uma casa para cima (-1) ou para baixo (+1). */
export function moveOne(media: MediaItem[], id: string, dir: -1 | 1) {
  const ids = [...media].sort((a, b) => a.position - b.position).map((m) => m.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return reorder(media, ids);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return reorder(media, ids);
}

/**
 * Tornar uma foto da galeria a principal: ela vai para products.image_url e a principal antiga entra
 * na galeria no lugar dela (nenhuma foto se perde). Vídeo não pode ser principal (a vitrine mostra foto).
 */
export function promote(mainUrl: string | null, item: MediaItem): { ok: false } | { ok: true; newMain: string; replaceWith: string | null } {
  if (item.kind !== "image") return { ok: false };
  return { ok: true, newMain: item.url, replaceWith: mainUrl };
}

/** Caminho do Blob a partir da URL guardada (/uploads/<caminho> ou URL pública do Blob). */
export function blobPathOf(url: string) {
  if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
  try {
    const u = new URL(url);
    return /\.blob\.vercel-storage\.com$/.test(u.hostname) ? u.pathname.replace(/^\//, "") : null;
  } catch {
    return null;
  }
}
