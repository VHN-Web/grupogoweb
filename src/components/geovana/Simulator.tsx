"use client";
// Simulador: conversa de teste com a Geovana (usa as predefinições salvas, sem WhatsApp).
import { useRef, useState } from "react";
import type { ChatTurn } from "@/adapters/ai/gemini";

export function Simulator({ name, run, placeholder }: { name: string; run: (h: ChatTurn[]) => Promise<{ text: string; handoff?: boolean; error?: string }>; placeholder: string }) {
  const [hist, setHist] = useState<ChatTurn[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const send = async () => {
    const text = msg.trim();
    if (!text || busy) return;
    const h = [...hist, { role: "user" as const, text }];
    setHist(h);
    setMsg("");
    setBusy(true);
    setErr(null);
    const r: { text: string; handoff?: boolean; error?: string } = await run(h).catch(() => ({ text: "", error: "Erro" }));
    setBusy(false);
    if (r.error) setErr(r.error);
    else setHist([...h, { role: "model", text: r.text + (r.handoff ? "\n\n— chamaria um atendente —" : "") }]);
    setTimeout(() => box.current?.scrollTo({ top: 1e6, behavior: "smooth" }), 50);
  };
  return (
    <div className="keep-light overflow-hidden rounded-2xl border border-line text-black">
      <div className="flex items-center gap-2 bg-[#075E54] px-4 py-2.5 text-sm font-semibold text-white">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-xs">{name.slice(0, 1)}</span> {name} <span className="text-xs font-normal opacity-70">· teste</span>
        {hist.length > 0 && <button onClick={() => setHist([])} className="ml-auto text-xs font-normal underline opacity-80">limpar</button>}
      </div>
      <div ref={box} className="h-80 space-y-2 overflow-y-auto bg-[#ECE5DD] p-3 text-sm">
        {hist.length === 0 && <p className="mx-auto mt-24 max-w-xs text-center text-xs text-black/50">Escreva como se fosse um cliente: “tem pizza de calabresa?”, “quero 2 x-bacon”, “cadê meu pedido?”</p>}
        {hist.map((h, i) => (
          <p key={i} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 shadow-sm ${h.role === "user" ? "ml-auto bg-[#DCF8C6] text-black" : "keep-light bg-white text-black"}`}>{h.text}</p>
        ))}
        {busy && <p className="keep-light w-16 rounded-xl bg-white px-3 py-2 text-black/50">…</p>}
      </div>
      {err && <p className="px-3 py-2 text-xs" style={{ background: "#FEF2F2", color: "#B91C1C" }}>{err}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 bg-[#F0F0F0] p-2">
        <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={placeholder} className="keep-light min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-sm text-black outline-none placeholder:text-black/40" />
        <button disabled={busy || !msg.trim()} className="rounded-full bg-[#075E54] px-4 text-sm font-semibold text-white disabled:opacity-50">Enviar</button>
      </form>
    </div>
  );
}
