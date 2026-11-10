"use client";
// Cardápio por foto: envia a foto (comprimida no navegador), mostra o que a IA leu para conferir/editar e importa.
import { useState } from "react";
import type { MenuItem } from "@/core/menu-import";

async function shrink(file: File, maxSide = 2000): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "cardapio.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // formato que o navegador não abre (ex.: HEIC): manda como veio
  }
}

export function MenuPhotoImport({ read, save, money }: { read: (f: FormData) => Promise<{ items?: MenuItem[]; error?: string }>; save: (json: string, publish: boolean) => Promise<void>; money: { symbol: string; decimals: number } }) {
  const [items, setItems] = useState<(MenuItem & { on: boolean })[]>([]);
  const [busy, setBusy] = useState<"" | "read" | "save">("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState("");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr("");
    setPreview(URL.createObjectURL(file));
    setBusy("read");
    const small = await shrink(file);
    const fd = new FormData();
    fd.set("photo", small);
    const r = await read(fd).catch(() => ({ error: "Falha de conexão. Tente de novo." }) as { items?: MenuItem[]; error?: string });
    setBusy("");
    if (r.error) setErr(r.error);
    // mais de uma foto: soma os itens
    else setItems((prev) => [...prev, ...(r.items ?? []).map((i) => ({ ...i, on: true }))]);
  };
  const upd = (i: number, patch: Partial<MenuItem & { on: boolean }>) => setItems((l) => l.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const chosen = items.filter((i) => i.on && i.name.trim() && i.priceMinor > 0);
  const toInput = (m: number) => (m / 10 ** money.decimals).toFixed(money.decimals).replace(".", ",");
  const fromInput = (v: string) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 10 ** money.decimals) || 0;
  const doSave = async (publish: boolean) => {
    setBusy("save");
    await save(JSON.stringify(chosen.map(({ on: _on, ...i }) => i)), publish);
  };

  return (
    <div className="space-y-4">
      <label className={`card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed p-6 text-center text-sm ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <span className="font-semibold">{items.length ? "Adicionar outra foto (outra página do cardápio)" : "Tirar ou escolher a foto do cardápio"}</span>
        <span className="text-xs text-muted">Foto de frente, nítida e com boa luz. Uma página por foto.</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        {busy === "read" && <span className="mt-2 inline-flex items-center gap-2 text-sm font-semibold"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> A IA está lendo o cardápio… (até 1 min)</span>}
      </label>
      {preview && busy === "read" && <img src={preview} alt="" className="mx-auto max-h-64 rounded-xl" />}
      {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      {items.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-4 text-sm">
            <p className="flex-1"><b>{chosen.length}</b> de {items.length} itens marcados. Confira nomes e preços antes de importar.</p>
            <button type="button" className="btn-ghost text-xs" onClick={() => setItems((l) => l.map((x) => ({ ...x, on: !l.every((y) => y.on) })))}>Marcar/desmarcar todos</button>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper text-left text-xs text-muted">
                <tr><th className="w-8 p-2" /><th className="p-2">Categoria</th><th className="p-2">Produto</th><th className="w-32 p-2">Preço ({money.symbol})</th></tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className={`border-t border-line ${it.on ? "" : "opacity-40"}`}>
                    <td className="p-2"><input type="checkbox" checked={it.on} onChange={(e) => upd(i, { on: e.target.checked })} aria-label="Importar" /></td>
                    <td className="p-2"><input className="input py-1.5 text-sm" value={it.category} onChange={(e) => upd(i, { category: e.target.value })} /></td>
                    <td className="p-2">
                      <input className="input py-1.5 text-sm" value={it.name} onChange={(e) => upd(i, { name: e.target.value })} />
                      {it.description && <input className="input mt-1 py-1 text-xs" value={it.description} onChange={(e) => upd(i, { description: e.target.value })} />}
                    </td>
                    <td className="p-2"><input className="input py-1.5 text-right text-sm" inputMode="decimal" defaultValue={toInput(it.priceMinor)} onBlur={(e) => upd(i, { priceMinor: fromInput(e.target.value) })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line p-4">
            <button type="button" disabled={!chosen.length || !!busy} onClick={() => doSave(true)} className="btn-brand disabled:opacity-50">{busy === "save" ? "Importando…" : `Importar e publicar ${chosen.length}`}</button>
            <button type="button" disabled={!chosen.length || !!busy} onClick={() => doSave(false)} className="btn-ghost disabled:opacity-50">Importar ocultos (publico depois)</button>
          </div>
        </div>
      )}
    </div>
  );
}
