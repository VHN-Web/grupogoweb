"use client";
import { useState } from "react";
import { COMPETITORS, detectLink } from "@/core/crm";

const STYLE = {
  competitor: ["#E0614A", "Baixa prioridade", "Já usa um sistema concorrente. Só vale abordar se estiver insatisfeito."],
  ifood: ["#F2C14E", "Bom lead", "Vende pelo iFood e paga comissão: mostre o pedido direto sem comissão."],
  manual: ["#3CC46B", "Lead Ouro", "Atende no manual (WhatsApp/Linktree/rede social). É exatamente quem a GoWeb ajuda."],
  own_site: ["#1F7FD8", "Verificar", "Tem site próprio. Veja se recebe pedidos por ele ou se é só institucional."],
  none: ["#3CC46B", "Lead Ouro", "Sem link nenhum: atendimento 100% manual."],
} as const;

/** Cole o link da bio e veja na hora se é concorrente, iFood ou atendimento manual. */
export function Detector() {
  const [v, setV] = useState("");
  const r = v.trim() ? detectLink(v) : null;
  const s = r ? STYLE[r.kind] : null;
  return (
    <div>
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Cole o link da bio: wa.me/…, linktr.ee/…, pedido.anota.ai/…" className="input" aria-label="Link da bio" />
      {r && s && (
        <div className="aff-pop mt-3 rounded-2xl p-4" style={{ background: `${s[0]}1f`, border: `2px solid ${s[0]}` }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: s[0] }}>{s[1]}</p>
          <p className="mt-1 font-bold">{r.label}</p>
          <p className="mt-1 text-sm">{s[2]}</p>
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--s-muted)]">Concorrentes reconhecidos: {COMPETITORS.map((c) => c.name).join(", ")}.</p>
    </div>
  );
}
