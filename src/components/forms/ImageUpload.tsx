"use client";
// Upload de imagem do painel: prévia, arrastar e soltar, e compressão no próprio aparelho antes de enviar
// (foto de celular de 8 MB vira ~300 KB em WEBP; HEIC do iPhone é convertido quando o navegador lê).
// O arquivo final vai no <input type="file" name={name}> original, então o Server Action não muda.
import { useId, useRef, useState } from "react";

type Props = {
  name: string;
  removeName?: string;
  current?: string | null;
  shape?: "square" | "round" | "wide";
  maxSide?: number;
  labels: { choose: string; change: string; drop: string; remove: string; processing: string; tooBig: string; invalid: string; hint: string };
};

const MAX_INPUT = 20 * 1024 * 1024; // aceita fotos grandes do celular; o envio final fica bem menor

async function compress(file: File, maxSide: number): Promise<File> {
  if (file.type === "image/gif") return file; // mantém animação
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("decode");
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  // Safari antigo não gera WEBP: cai para JPEG
  const out = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!out) throw new Error("encode");
  if (out.size >= file.size && ["image/jpeg", "image/png", "image/webp"].includes(file.type) && scale === 1) return file;
  const ext = out.type === "image/webp" ? "webp" : "jpg";
  return new File([out], `${file.name.replace(/\.[^.]+$/, "") || "imagem"}.${ext}`, { type: out.type });
}

export function ImageUpload({ name, removeName, current, shape = "square", maxSide = 1600, labels }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current ?? null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function handle(file: File | undefined) {
    setError(null);
    setInfo(null);
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) return fail(labels.invalid);
    if (file.size > MAX_INPUT) return fail(labels.tooBig);
    setBusy(true);
    try {
      const out = await compress(file, maxSide);
      const dt = new DataTransfer();
      dt.items.add(out);
      if (input.current) input.current.files = dt.files;
      setPreview(URL.createObjectURL(out));
      setRemoved(false);
      setInfo(`${(out.size / 1024).toFixed(0)} KB`);
    } catch {
      fail(labels.invalid);
    } finally {
      setBusy(false);
    }
  }
  function fail(msg: string) {
    setError(msg);
    if (input.current) input.current.value = "";
  }

  const box = shape === "round" ? "h-24 w-24 rounded-full" : shape === "wide" ? "h-24 w-44 rounded-xl" : "h-24 w-24 rounded-xl";
  const shown = removed ? null : preview;

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed p-3 transition ${over ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-line"}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files?.[0]);
        }}
      >
        <button type="button" onClick={() => input.current?.click()} className={`${box} relative grid shrink-0 place-items-center overflow-hidden bg-paper ring-1 ring-line`} aria-label={shown ? labels.change : labels.choose}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="m21 16-5-5-8 8" />
            </svg>
          )}
          {busy && <span className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-semibold text-white">{labels.processing}</span>}
        </button>
        <div className="min-w-0 flex-1 text-sm">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} className="btn-ghost px-3 py-1.5 text-sm" disabled={busy}>
              {shown ? labels.change : labels.choose}
            </button>
            {removeName && shown && (
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                onClick={() => {
                  setRemoved(true);
                  if (input.current) input.current.value = "";
                }}
              >
                {labels.remove}
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{labels.drop} · {labels.hint}{info && ` · ${info}`}</p>
          {error && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
        </div>
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          accept="image/*,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            // (arquivo colocado por nós via DataTransfer não dispara onChange)
            handle(e.target.files?.[0]);
          }}
        />
        {removeName && removed && current && <input type="hidden" name={removeName} value="on" />}
      </div>
    </div>
  );
}
