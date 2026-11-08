import { Detector } from "@/components/crm/Detector";
import { ScriptBox } from "@/components/crm/ScriptBox";
import { SCRIPT_CHANNELS, SCRIPT_CHANNEL_LABEL, buildScript } from "@/core/crm";
import { requireCrm } from "@/services/crm";

export const metadata = { title: "Scripts e detector" };

const NICHES = [
  { name: "{nome}", category: "Hamburgueria", label: "Alimentação" },
  { name: "{nome}", category: "Barbearia", label: "Beleza" },
  { name: "{nome}", category: "Clínica", label: "Saúde" },
  { name: "{nome}", category: "Pet shop", label: "Pet" },
  { name: "{nome}", category: "Loja de roupas", label: "Varejo" },
];

export default async function Tools() {
  const me = await requireCrm();
  const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Scripts e detector</h1>
      <section className={card}>
        <h2 className="font-bold">Detector de concorrente</h2>
        <p className="mb-3 text-sm text-[var(--s-muted)]">Antes de abordar, cole o link da bio do Instagram do negócio.</p>
        <Detector />
      </section>
      {NICHES.map((n) => (
        <section key={n.label} className={card}>
          <h2 className="font-bold">Playbook · {n.label}</h2>
          <p className="mb-3 text-sm text-[var(--s-muted)]">Troque {"{nome}"} e {"{bairro}"} antes de enviar. Na ficha de cada lead essas mensagens já vêm preenchidas.</p>
          <ScriptBox tabs={SCRIPT_CHANNELS.map((c) => ({ id: c, label: SCRIPT_CHANNEL_LABEL[c], text: buildScript(c, { name: n.name, neighborhood: "{bairro}", category: n.category }, me.name) }))} ai={false} />
        </section>
      ))}
    </div>
  );
}
