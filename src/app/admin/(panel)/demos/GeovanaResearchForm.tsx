"use client";
// Formulário "Montar com a Geovana": nome, cidade, links e (opcional) fotos do cardápio, comprimidas no aparelho.
import { useFormStatus } from "react-dom";
import { ImageUpload } from "@/components/forms/ImageUpload";

const LABELS = {
  choose: "Foto do cardápio",
  change: "Trocar foto",
  drop: "Solte a foto aqui",
  remove: "Tirar",
  processing: "Preparando…",
  tooBig: "Foto grande demais",
  invalid: "Escolha uma imagem",
  hint: "Opcional",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="btn-brand rounded-xl px-4 py-3 font-semibold disabled:opacity-60 sm:col-span-2">
      {pending ? (
        <span className="inline-flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> A Geovana está pesquisando… (até 2 min, não feche)</span>
      ) : (
        "Pesquisar e montar prévia"
      )}
    </button>
  );
}

export function GeovanaResearchForm({ action, initial }: { action: (f: FormData) => Promise<void>; initial: { name: string; city: string; links: string; lead: string } | null }) {
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {initial?.lead && <input type="hidden" name="lead" value={initial.lead} />}
      <div>
        <label className="label" htmlFor="g-name">Nome do estabelecimento</label>
        <input id="g-name" name="name" className="input" placeholder="Ex.: Pizzaria do João" required maxLength={80} defaultValue={initial?.name} />
      </div>
      <div>
        <label className="label" htmlFor="g-city">Cidade</label>
        <input id="g-city" name="city" className="input" placeholder="Ex.: Recife - PE" maxLength={80} defaultValue={initial?.city} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="g-links">Links (opcional, um por linha)</label>
        <textarea id="g-links" name="links" rows={3} className="input" placeholder={"Google Maps, @instagram, Facebook, iFood ou site"} defaultValue={initial?.links} />
        <p className="mt-1 text-xs text-muted">Com o link do Google Maps ou do Instagram a Geovana acerta o estabelecimento certo mais rápido.</p>
      </div>
      <div>
        <label className="label" htmlFor="g-country">País</label>
        <select id="g-country" name="country" className="input" defaultValue="BR">
          <option value="BR">Brasil (R$)</option>
          <option value="PY">Paraguai (Gs.)</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="g-notes">Observação (opcional)</label>
        <input id="g-notes" name="notes" className="input" placeholder="Ex.: foco em delivery, tem 2 unidades" maxLength={300} />
      </div>
      <div className="sm:col-span-2">
        <p className="label">Fotos do cardápio (opcional) — usamos no lugar do que achar na internet</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <ImageUpload name="menu1" shape="wide" maxSide={2000} labels={LABELS} />
          <ImageUpload name="menu2" shape="wide" maxSide={2000} labels={LABELS} />
          <ImageUpload name="menu3" shape="wide" maxSide={2000} labels={LABELS} />
        </div>
      </div>
      <Submit />
    </form>
  );
}
