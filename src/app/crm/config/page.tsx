import { count } from "drizzle-orm";
import { db, schema } from "@/db";
import { headers } from "next/headers";
import { PushSetup } from "@/components/crm/PushSetup";
import { CrmNativePanel } from "@/components/crm/CrmNativePanel";
import { Icon } from "@/components/ui/Icon";
import { NOTIFY_CATEGORIES } from "@/core/crm-notify";
import { CRM_APP } from "@/core/courier-native";
import { crmConfig, requireCrm } from "@/services/crm";
import { notifyPrefs } from "@/services/crm-notify";
import { saveNotifyPrefsAction, saveSettingsAction } from "../actions";

export const metadata = { title: "App e notificações" };
export const dynamic = "force-dynamic";

const STEPS = [
  { t: "iPhone / iPad", s: ["Abra goweboficial.com/crm no Safari.", "Toque em Compartilhar (quadrado com seta).", "Escolha “Adicionar à Tela de Início” → Adicionar.", "Abra pelo ícone novo e ligue as notificações aqui."] },
  { t: "Android", s: ["Abra goweboficial.com/crm no Chrome.", "Toque em “Instalar app” (ou ⋮ → Instalar app).", "Abra pelo ícone e ligue as notificações."] },
  { t: "Windows", s: ["Abra goweboficial.com/crm no Chrome ou Edge.", "Clique no ícone de instalar na barra de endereço (ou ⋮ → Instalar GoWeb CRM).", "O app aparece no menu Iniciar e pode ser fixado na barra de tarefas."] },
  { t: "Mac", s: ["No Chrome: ícone de instalar na barra de endereço.", "No Safari (macOS 14+): Arquivo → Adicionar ao Dock.", "O app abre em janela própria, com notificações."] },
];

export default async function Config({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const me = await requireCrm();
  const sp = await searchParams;
  const cfg = await crmConfig();
  const prefs = await notifyPrefs(me.id);
  const ua = (await headers()).get("user-agent") ?? "";
  const inApp = ua.includes(CRM_APP.uaMark);
  const [devices] = await db.select({ n: count() }).from(schema.crmPushSubs);
  const card = "rounded-3xl border border-[var(--s-line)] bg-[var(--s-card)] p-5";
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">App e notificações</h1>
      {sp.ok && <p className="rounded-2xl bg-[var(--s-good-bg)] px-4 py-3 text-sm font-semibold text-[var(--s-good-fg)]">{sp.ok}</p>}
      <section className={card}>
        <h2 className="font-bold">Notificações</h2>
        <p className="mb-4 text-sm text-[var(--s-muted)]">Avisos de retorno na hora marcada, leads novos da busca, demonstrações pedidas por afiliados, contratos e implantações pagas, chamados de suporte. {devices.n} {devices.n === 1 ? "aparelho ligado" : "aparelhos ligados"} no time.</p>
        <PushSetup />
        <CrmNativePanel categories={NOTIFY_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} />
      </section>
      <section id="avisos" className={`${card} scroll-mt-20`}>
        <h2 className="font-bold">O que avisar</h2>
        <p className="mb-4 text-sm text-[var(--s-muted)]">Só para você ({me.name.split(" ")[0]}). O que estiver desligado ou chegar no silêncio não toca, mas fica guardado em <a href="/crm/avisos" className="underline">Avisos</a>.</p>
        <form action={saveNotifyPrefsAction} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {NOTIFY_CATEGORIES.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[var(--s-soft)] p-3">
                <input type="checkbox" name={`cat_${c.id}`} defaultChecked={!prefs.off.includes(c.id)} className="mt-1 h-5 w-5 accent-[#3CC46B]" />
                <span><b className="block text-sm">{c.label}</b><span className="text-xs text-[var(--s-muted)]">{c.hint}</span></span>
              </label>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--s-line)] p-4">
            <label className="flex items-center gap-3 font-semibold">
              <input type="checkbox" name="quiet" defaultChecked={!!prefs.quietFrom} className="h-5 w-5 accent-[#3CC46B]" /> Horário de silêncio
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              das <input type="time" name="quietFrom" defaultValue={prefs.quietFrom ?? "22:00"} className="input w-auto" /> às <input type="time" name="quietTo" defaultValue={prefs.quietTo ?? "07:00"} className="input w-auto" /> (Brasília)
            </div>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input type="checkbox" name="urgentInQuiet" defaultChecked={prefs.urgentInQuiet} className="h-5 w-5 accent-[#3CC46B]" /> No silêncio, vendas, suporte, agenda e lembretes ainda tocam
            </label>
          </div>
          <button className="btn-brand">Salvar preferências</button>
        </form>
      </section>
      {!inApp && (
        <section className={card}>
          <h2 className="flex items-center gap-2 font-bold"><Icon name="download" size={18} /> App Android (APK)</h2>
          <p className="mt-1 text-sm text-[var(--s-muted)]">O CRM como aplicativo de verdade: widgets na tela inicial, um som para cada tipo de aviso e notificações mesmo com o app fechado.</p>
          <a href={CRM_APP.apkUrl} className="btn-brand mt-3 inline-flex">Baixar o app (APK)</a>
          <p className="mt-2 text-xs text-[var(--s-muted)]">Depois de baixar, abra o arquivo e permita instalar apps desta fonte. Entre com o mesmo login do admin (e-mail e senha).</p>
        </section>
      )}
      <section id="instalar" className={`${card} scroll-mt-20`}>
        <h2 className="font-bold">Instalar o app</h2>
        <p className="text-sm text-[var(--s-muted)]">Sem loja de aplicativos: instala direto do site e atualiza sozinho.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {STEPS.map((x) => (
            <div key={x.t} className="rounded-2xl bg-[var(--s-soft)] p-4">
              <p className="font-bold">{x.t}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{x.s.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          ))}
        </div>
      </section>
      <section className={card}>
        <h2 className="font-bold">Metas e planilha</h2>
        <form action={saveSettingsAction} className="mt-4 grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="contacts">Meta de contatos por dia</label><input id="contacts" name="contacts" type="number" min={1} defaultValue={cfg.goals.contacts} className="input" /></div>
          <div><label className="label" htmlFor="demos">Meta de demos por dia</label><input id="demos" name="demos" type="number" min={0} defaultValue={cfg.goals.demos} className="input" /></div>
          <div className="sm:col-span-3"><label className="label" htmlFor="sheet">Planilha do Google (aba “Leads CRM”) — link ou ID</label><input id="sheet" name="sheet" defaultValue={cfg.sheetId ?? ""} className="input" /></div>
          <button className="btn-brand sm:col-span-3">Salvar</button>
        </form>
        <p className="mt-3 text-xs text-[var(--s-muted)]">Conectado como {me.name}. Os sócios entram com o próprio login do admin (Admin → Configurações → Administradores).</p>
      </section>
    </div>
  );
}
