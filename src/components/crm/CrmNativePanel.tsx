"use client";
// Só aparece dentro do app Android do CRM: permissão, som/vibração por tipo de aviso, bateria, widgets e teste.
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { testPushAction } from "@/app/crm/actions";
import { nativeApp } from "@/lib/native-bridge";

type St = { notifications: boolean; battery: boolean; push: boolean; version: string; lastSync: number };

export function CrmNativePanel({ categories }: { categories: { id: string; label: string }[] }) {
  const [st, setSt] = useState<St | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const nb = nativeApp();
    if (!nb || nb.app?.() !== "crm") return;
    const read = () => {
      try {
        setSt(JSON.parse(nb.status()) as St);
      } catch {}
    };
    read();
    const i = setInterval(read, 2000);
    return () => clearInterval(i);
  }, []);
  if (!st) return null;
  const nb = nativeApp();
  const test = async () => {
    setMsg("Enviando…");
    await testPushAction();
    nb?.syncNow?.();
    setMsg(st.push ? "Enviado. Deve chegar em segundos." : "Enviado. Sem Firebase, o app confere a cada 15 min — puxamos agora.");
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {st.notifications ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--s-good-bg)] px-3 py-1.5 text-sm font-bold text-[var(--s-good-fg)]"><Icon name="check" size={16} /> Notificações ligadas no app</span>
        ) : (
          <button onClick={() => nb?.requestNotifications()} className="btn-brand"><Icon name="bell" size={16} /> Ligar notificações</button>
        )}
        <button onClick={test} className="btn-ghost py-2 text-sm">Testar</button>
        {!st.battery && <button onClick={() => nb?.requestBatteryExemption()} className="btn-ghost py-2 text-sm">Não deixar o Android pausar</button>}
      </div>
      {msg && <p className="text-sm text-[var(--s-muted)]">{msg}</p>}
      <div>
        <p className="text-sm font-bold">Som e vibração de cada tipo de aviso</p>
        <p className="text-xs text-[var(--s-muted)]">Toque para escolher o toque, a vibração e se aparece na tela bloqueada.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c.id} onClick={() => nb?.openChannelSettings?.(c.id)} className="rounded-full bg-[var(--s-soft)] px-3 py-1.5 text-sm font-semibold">{c.label}</button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl bg-[var(--s-soft)] p-3 text-sm">
        <p className="font-bold">Widgets na tela inicial</p>
        <p className="text-[var(--s-muted)]">Segure o dedo num espaço vazio da tela inicial → Widgets → GoWeb CRM. Tem o “Hoje no CRM” (retornos, leads, contatos, demos) e o “Acessos” (site e afiliados hoje). Atualizam sozinhos a cada 15 min e no botão ↻.</p>
      </div>
      <p className="text-xs text-[var(--s-muted)]">App {st.version}{st.push ? " · avisos na hora (Firebase)" : " · avisos a cada 15 min"}{st.lastSync ? ` · última atualização ${new Date(st.lastSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
    </div>
  );
}
