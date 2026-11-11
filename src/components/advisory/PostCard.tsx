"use client";
// Um post do calendário: foto, legenda editável, legenda com IA, aprovar, "já postei", pular.
// Com a autonomia ligada, ao aprovar o navegador gera uma cópia JPEG da foto (a Meta só aceita JPEG).
import { useRef, useState } from "react";
import { compress } from "@/components/forms/ImageUpload";

type Props = {
  locale: "es" | "pt";
  post: { id: string; when: string; theme: string; caption: string; imageUrl: string | null; status: string; error: string | null; link: string; result: string | null };
  autonomy: boolean;
  save: (f: FormData) => void | Promise<void>;
  ai: () => void | Promise<void>;
  setStatus: (s: "done_manual" | "skipped" | "draft") => void | Promise<void>;
};

async function toJpeg(src: string): Promise<File | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    const max = 1440;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    // Instagram aceita proporção entre 4:5 e 1.91:1 — corta no centro se passar disso
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    let sx = 0;
    let sy = 0;
    if (w / h < 0.8) {
      const nh = Math.round(w / 0.8);
      sy = Math.round((h - nh) / 2);
      h = nh;
    } else if (w / h > 1.91) {
      const nw = Math.round(h * 1.91);
      sx = Math.round((w - nw) / 2);
      w = nw;
    }
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // JPEG não tem transparência
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, w, h, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
    return blob ? new File([blob], "post.jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

export function PostCard({ locale, post, autonomy, save, ai, setStatus }: Props) {
  const T = (es: string, pt: string) => (locale === "pt" ? pt : es);
  const [caption, setCaption] = useState(post.caption);
  const [preview, setPreview] = useState(post.imageUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<File | null>(null);
  const locked = post.status === "published" || post.status === "publishing";

  const submit = async (approve: boolean) => {
    setBusy(approve ? "approve" : "save");
    setMsg(null);
    try {
      const f = new FormData();
      f.set("caption", caption);
      if (approve) f.set("approve", "1");
      if (file.current) f.set("image", file.current);
      if (approve && autonomy) {
        if (!preview) {
          setMsg(T("Para publicar solo, el post necesita una foto.", "Para publicar sozinho, o post precisa de uma foto."));
          return;
        }
        const jpeg = await toJpeg(preview);
        if (!jpeg) {
          setMsg(T("No pudimos preparar la foto para Instagram. Probá con otra.", "Não conseguimos preparar a foto para o Instagram. Tente outra."));
          return;
        }
        f.set("jpeg", jpeg);
      }
      await save(f);
    } finally {
      setBusy(null);
    }
  };

  const badge: Record<string, [string, string]> = {
    draft: [T("Para revisar", "Para revisar"), "bg-amber-100 text-amber-900"],
    approved: [autonomy ? T("Aprobado: se publica solo", "Aprovado: publica sozinho") : T("Aprobado", "Aprovado"), "bg-emerald-100 text-emerald-800"],
    publishing: [T("Publicando…", "Publicando…"), "bg-blue-100 text-blue-800"],
    published: [T("Publicado", "Publicado"), "bg-emerald-100 text-emerald-800"],
    failed: [T("No se publicó", "Não publicou"), "bg-red-100 text-red-800"],
    done_manual: [T("Ya publicado por vos", "Você já postou"), "bg-emerald-100 text-emerald-800"],
    skipped: [T("Saltado", "Pulado"), "bg-black/5 text-muted"],
  };
  const [label, cls] = badge[post.status] ?? badge.draft;

  return (
    <article className="card overflow-hidden">
      <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
        <div className="relative aspect-square bg-black/5 sm:aspect-auto">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full min-h-40 place-items-center p-4 text-center text-xs text-muted">{T("Sin foto: elegí una", "Sem foto: escolha uma")}</div>}
          {!locked && (
            <label className="absolute bottom-2 left-2 cursor-pointer rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white">
              {T("Cambiar foto", "Trocar foto")}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f0 = e.target.files?.[0];
                  if (!f0) return;
                  const f1 = await compress(f0, 1600).catch(() => f0);
                  file.current = f1;
                  setPreview(URL.createObjectURL(f1));
                }}
              />
            </label>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{post.when}</p>
            <span className="text-sm text-muted">· {post.theme}</span>
            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
          </div>
          {post.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{post.error}</p>}
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} disabled={locked} rows={5} maxLength={2200} className="input w-full text-sm" aria-label={T("Texto del post", "Legenda do post")} />
          {post.result && <p className="text-xs text-muted">{post.result}</p>}
          {msg && <p className="text-xs text-red-700">{msg}</p>}
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!!busy} onClick={() => submit(true)} className="btn-brand px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
                {busy === "approve" ? "…" : T("Aprobar", "Aprovar")}
              </button>
              <button type="button" disabled={!!busy} onClick={() => submit(false)} className="btn-ghost px-3 py-1.5 text-xs font-semibold">
                {busy === "save" ? "…" : T("Guardar", "Salvar")}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={async () => {
                  setBusy("ai");
                  try {
                    await ai();
                  } finally {
                    setBusy(null);
                  }
                }}
                className="btn-ghost px-3 py-1.5 text-xs font-semibold"
              >
                {busy === "ai" ? "…" : T("Reescribir con IA", "Reescrever com IA")}
              </button>
              <button type="button" onClick={() => navigator.clipboard?.writeText(caption)} className="btn-ghost px-3 py-1.5 text-xs font-semibold">
                {T("Copiar texto", "Copiar legenda")}
              </button>
              {preview && (
                <a href={preview} download className="btn-ghost px-3 py-1.5 text-xs font-semibold">
                  {T("Bajar foto", "Baixar foto")}
                </a>
              )}
              <button type="button" disabled={!!busy} onClick={() => setStatus("done_manual")} className="btn-ghost px-3 py-1.5 text-xs font-semibold">
                {T("Ya lo publiqué", "Já postei")}
              </button>
              <button type="button" disabled={!!busy} onClick={() => setStatus("skipped")} className="px-3 py-1.5 text-xs font-semibold text-muted underline">
                {T("Saltar", "Pular")}
              </button>
            </div>
          )}
          {post.status === "failed" && (
            <button type="button" onClick={() => setStatus("draft")} className="btn-ghost px-3 py-1.5 text-xs font-semibold">
              {T("Volver a revisar", "Voltar para revisão")}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
