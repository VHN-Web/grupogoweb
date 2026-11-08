"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

/** Link do afiliado: copiar + compartilhar no WhatsApp (com origem para medir de onde veio o clique). */
export function ShareLink({ url, message }: { url: string; message: string }) {
  const [ok, setOk] = useState(false);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}?origem=whatsapp`)}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-black/30 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-white" title={url}>{url.replace(/^https?:\/\//, "")}</span>
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); } catch { window.prompt("", url); }
            setOk(true);
            setTimeout(() => setOk(false), 1800);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-[#3CC46B] px-3.5 py-2 text-sm font-bold text-[#0E0E10]"
        >
          <Icon name={ok ? "check" : "link"} size={16} /> {ok ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={wa} target="_blank" rel="noopener" className="flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-sm font-bold text-[#0E0E10]">
          <Icon name="chat" size={16} /> Enviar no WhatsApp
        </a>
        <button
          type="button"
          onClick={async () => {
            const u = `${url}?origem=instagram`;
            try { await navigator.clipboard.writeText(u); } catch { window.prompt("", u); }
            setOk(true);
            setTimeout(() => setOk(false), 1800);
          }}
          className="rounded-xl bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/15"
        >
          Copiar para Instagram
        </button>
      </div>
    </div>
  );
}
