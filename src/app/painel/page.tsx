import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand/AuthShell";
import { headers } from "next/headers";
import { detectLocale, tr } from "@/core/region";

export default async function PanelEntry() {
  const T = tr(detectLocale(await headers()));
  async function go(formData: FormData) {
    "use server";
    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    // Quem digitar "admin" aqui quer o admin da plataforma
    if (slug === "admin" || slug === "/admin") redirect("/admin/login");
    if (slug) redirect(`/painel/${slug}`);
  }
  return (
    <AuthShell eyebrow={T("Panel", "Painel")} title={T("Entrar a tu local", "Entrar no seu negócio")}>
      <form action={go} className="space-y-3">
        <label className="label" htmlFor="slug">{T("Dirección de tu menú", "Endereço do seu site")}</label>
        <div className="flex items-center rounded-xl border border-[#33333a] bg-[#18181b] pl-3.5 text-[15px]">
          <span className="text-[#B9B3A7]">goweboficial.com/</span>
          <input id="slug" name="slug" className="w-full bg-transparent py-2.5 pr-3 text-[#F4F1EA] outline-none" placeholder={T("mi-local", "meu-negocio")} autoFocus />
        </div>
        <button className="btn-primary w-full py-3">{T("Continuar", "Continuar")}</button>
      </form>
    </AuthShell>
  );
}
