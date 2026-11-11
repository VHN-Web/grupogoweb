import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { requireCrm } from "@/services/crm";
import { crmLogout } from "../actions";
import { CrmLogoutForm } from "@/components/crm/CrmLogoutForm";

export const metadata = { title: "Mais" };

const ITEMS = [
  { href: "/crm/acessos", label: "Acessos", desc: "Quantas pessoas abriram o site oficial, a página e os links de afiliados", icon: "growth" },
  { href: "/crm/avisos", label: "Avisos", desc: "Todas as notificações, mesmo as que chegaram no silêncio", icon: "bell" },
  { href: "/crm/equipe", label: "Equipe e metas", desc: "Contatos, demos e fechamentos por sócio", icon: "team" },
  { href: "/crm/ferramentas", label: "Scripts e detector", desc: "Mensagens prontas e detector de concorrente", icon: "chat" },
  { href: "/crm/config", label: "App e notificações", desc: "Instalar, notificações, metas e planilha", icon: "settings" },
  { href: "/admin", label: "Admin completo", desc: "Clientes, faturas, afiliados e suporte", icon: "store" },
];

export default async function More() {
  const me = await requireCrm();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Mais</h1>
      <ul className="space-y-2">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex items-center gap-3 rounded-2xl border border-[var(--s-line)] bg-[var(--s-card)] p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--s-good-bg)] text-[var(--s-good-fg)]"><Icon name={i.icon} /></span>
              <span className="flex-1"><b className="block">{i.label}</b><span className="text-sm text-[var(--s-muted)]">{i.desc}</span></span>
              <span className="text-[var(--s-muted)]">›</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-center text-sm text-[var(--s-muted)]">Conectado como {me.name}</p>
      <CrmLogoutForm action={crmLogout} />
    </div>
  );
}
