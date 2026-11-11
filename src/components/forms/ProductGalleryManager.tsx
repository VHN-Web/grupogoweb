"use client";
// Galeria do produto no painel: várias fotos (comprimidas no aparelho), foto principal, ordem, remover,
// prévia antes de enviar e 1 vídeo de até 15 MB (vai direto do navegador para o armazenamento).
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { compress } from "@/components/forms/ImageUpload";
import { VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/core/media";
import { addImagesAction, addVideoAction, makeMainAction, moveMediaAction, removeMediaAction } from "@/app/painel/[slug]/(app)/media-actions";

type Item = { id: string; kind: "image" | "video"; url: string };
type Props = { slug: string; tenantId: string; productId: string; mainUrl: string | null; items: Item[]; pt: boolean; maxExtra: number };

export function ProductGalleryManager({ slug, tenantId, productId, mainUrl, items, pt, maxExtra }: Props) {
  const T = (es: string, p: string) => (pt ? p : es);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [video, setVideo] = useState<{ file: File; url: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const hasVideo = items.some((i) => i.kind === "video");
  const extraImages = items.filter((i) => i.kind === "image").length;
  const room = Math.max(0, maxExtra + (mainUrl ? 0 : 1) - extraImages);

  // libera as prévias da memória
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url); }, [video]);

  const done = (r: { ok: boolean; error?: string }, okText: string) => {
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? T("Error", "Erro") });
    if (r.ok) router.refresh();
  };

  const pickPhotos = (list: FileList | null) => {
    setMsg(null);
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length > room) setMsg({ ok: false, text: T(`Podés agregar ${room} foto(s) más (máximo 10 por producto).`, `Você pode adicionar mais ${room} foto(s) (máximo 10 por produto).`) });
    setPhotos(files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) })));
  };

  const sendPhotos = () =>
    start(async () => {
      let sent = 0;
      for (const [i, p] of photos.entries()) {
        setProgress(T(`Enviando foto ${i + 1} de ${photos.length}…`, `Enviando foto ${i + 1} de ${photos.length}…`));
        let file: File;
        try {
          file = await compress(p.file, 1600);
        } catch {
          setMsg({ ok: false, text: T("Una foto no se pudo leer. Probá con JPG o PNG.", "Uma foto não pôde ser lida. Tente JPG ou PNG.") });
          break;
        }
        const fd = new FormData();
        fd.append("files", file);
        const r = await addImagesAction(slug, productId, fd);
        if (!r.ok) {
          setMsg({ ok: false, text: r.error });
          break;
        }
        sent++;
      }
      setProgress(null);
      setPhotos([]);
      if (photoRef.current) photoRef.current.value = "";
      if (sent) done({ ok: true }, T(`${sent} foto(s) agregada(s).`, `${sent} foto(s) adicionada(s).`));
    });

  const pickVideo = (f: File | undefined) => {
    setMsg(null);
    if (!f) return;
    if (!VIDEO_TYPES[f.type]) return setMsg({ ok: false, text: T("Usá un video MP4, WEBM o MOV.", "Use um vídeo MP4, WEBM ou MOV.") });
    if (f.size > VIDEO_MAX_BYTES) return setMsg({ ok: false, text: T(`El video tiene ${(f.size / 1048576).toFixed(1)} MB: el máximo es 15 MB. Recortalo o comprimilo en el celular.`, `O vídeo tem ${(f.size / 1048576).toFixed(1)} MB: o máximo é 15 MB. Corte ou comprima no celular.`) });
    setVideo({ file: f, url: URL.createObjectURL(f) });
  };

  const sendVideo = () =>
    start(async () => {
      if (!video) return;
      const ext = VIDEO_TYPES[video.file.type];
      const pathname = `tenants/${tenantId}/products/${productId}/${crypto.randomUUID()}.${ext}`;
      const { uploadPresigned } = await import("@vercel/blob/client");
      const opts = {
        handleUploadUrl: `/api/painel/${slug}/midia`,
        contentType: video.file.type,
        onUploadProgress: (e: { percentage: number }) => setProgress(T(`Enviando video… ${Math.round(e.percentage)}%`, `Enviando vídeo… ${Math.round(e.percentage)}%`)),
      };
      try {
        try {
          await uploadPresigned(pathname, video.file, { ...opts, access: "private" });
        } catch (e) {
          // armazenamento público: a Vercel recusa "private"
          if (!/public/i.test(String((e as Error)?.message))) throw e;
          await uploadPresigned(pathname, video.file, { ...opts, access: "public" });
        }
      } catch (e) {
        setProgress(null);
        return setMsg({ ok: false, text: (e as Error)?.message || T("No se pudo enviar el video.", "Não foi possível enviar o vídeo.") });
      }
      setProgress(T("Guardando…", "Salvando…"));
      const r = await addVideoAction(slug, productId, pathname);
      setProgress(null);
      setVideo(null);
      if (videoRef.current) videoRef.current.value = "";
      done(r, T("Video agregado.", "Vídeo adicionado."));
    });

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg(null);
    start(async () => done(await fn(), okText));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label !mb-0">{T("Galería (fotos y video)", "Galeria (fotos e vídeo)")}</p>
        <p className="text-xs text-muted">{T("La principal aparece en la vitrina. El orden es el que ve el cliente.", "A principal aparece na vitrine. A ordem é a que o cliente vê.")}</p>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {mainUrl && (
          <li className="relative overflow-hidden rounded-xl border-2 border-[var(--brand)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mainUrl} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            <span className="absolute left-1 top-1 rounded-full bg-[var(--brand)] px-2 py-0.5 text-[10px] font-bold text-white">{T("Principal", "Principal")}</span>
          </li>
        )}
        {items.map((it, i) => (
          <li key={it.id} className="relative overflow-hidden rounded-xl border border-line bg-black/5">
            {it.kind === "video" ? (
              <div className="grid aspect-square w-full place-items-center bg-black/80 text-white">
                <Icon name="play" size={26} label={T("Video", "Vídeo")} />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-black/55 p-1 text-white">
              <button type="button" disabled={pending || i === 0} onClick={() => act(() => moveMediaAction(slug, productId, it.id, -1), T("Orden actualizado.", "Ordem atualizada."))} className="grid h-7 w-7 place-items-center rounded-md disabled:opacity-30" aria-label={T("Mover a la izquierda", "Mover para a esquerda")}>‹</button>
              {it.kind === "image" && (
                <button type="button" disabled={pending} onClick={() => act(() => makeMainAction(slug, it.id), T("Foto principal cambiada.", "Foto principal trocada."))} className="grid h-7 w-7 place-items-center rounded-md" aria-label={T("Usar como principal", "Usar como principal")} title={T("Usar como principal", "Usar como principal")}>
                  <Icon name="star" size={15} />
                </button>
              )}
              <button type="button" disabled={pending} onClick={() => act(() => removeMediaAction(slug, it.id), T("Quitado de la galería.", "Removido da galeria."), T("¿Quitar de la galería?", "Remover da galeria?"))} className="grid h-7 w-7 place-items-center rounded-md" aria-label={T("Quitar", "Remover")}>
                <Icon name="trash" size={15} />
              </button>
              <button type="button" disabled={pending || i === items.length - 1} onClick={() => act(() => moveMediaAction(slug, productId, it.id, 1), T("Orden actualizado.", "Ordem atualizada."))} className="grid h-7 w-7 place-items-center rounded-md disabled:opacity-30" aria-label={T("Mover a la derecha", "Mover para a direita")}>›</button>
            </div>
          </li>
        ))}
      </ul>

      {photos.length > 0 && (
        <div className="rounded-xl border border-dashed border-line p-3">
          <p className="text-xs font-semibold">{T("Vista previa — todavía no se guardaron", "Prévia — ainda não foram salvas")}</p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.url} src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={sendPhotos} disabled={pending} className="btn-brand px-3 py-1.5 text-xs">{T(`Guardar ${photos.length} foto(s)`, `Salvar ${photos.length} foto(s)`)}</button>
            <button type="button" onClick={() => { setPhotos([]); if (photoRef.current) photoRef.current.value = ""; }} disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">{T("Cancelar", "Cancelar")}</button>
          </div>
        </div>
      )}

      {video && (
        <div className="rounded-xl border border-dashed border-line p-3">
          <p className="text-xs font-semibold">{T("Vista previa del video", "Prévia do vídeo")} · {(video.file.size / 1048576).toFixed(1)} MB</p>
          <video src={video.url} controls muted playsInline className="mt-2 max-h-56 w-full rounded-lg bg-black" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={sendVideo} disabled={pending} className="btn-brand px-3 py-1.5 text-xs">{T("Guardar video", "Salvar vídeo")}</button>
            <button type="button" onClick={() => { setVideo(null); if (videoRef.current) videoRef.current.value = ""; }} disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">{T("Cancelar", "Cancelar")}</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label className={`btn-ghost cursor-pointer px-3 py-1.5 text-xs font-semibold ${room === 0 || pending ? "pointer-events-none opacity-40" : ""}`}>
          <input ref={photoRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => pickPhotos(e.target.files)} />
          <span className="inline-flex items-center gap-1.5"><Icon name="camera" size={15} /> {T("Agregar fotos", "Adicionar fotos")}</span>
        </label>
        <label className={`btn-ghost cursor-pointer px-3 py-1.5 text-xs font-semibold ${hasVideo || pending ? "pointer-events-none opacity-40" : ""}`} title={hasVideo ? T("Quitá el video actual para cambiarlo", "Remova o vídeo atual para trocar") : undefined}>
          <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={(e) => pickVideo(e.target.files?.[0])} />
          <span className="inline-flex items-center gap-1.5"><Icon name="play" size={15} /> {T("Agregar video (hasta 15 MB)", "Adicionar vídeo (até 15 MB)")}</span>
        </label>
      </div>
      {progress && <p className="text-xs text-muted" aria-live="polite">{progress}</p>}
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-600"}`} aria-live="polite">{msg.text}</p>}
    </div>
  );
}
