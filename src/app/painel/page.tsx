import { redirect } from "next/navigation";
import { AuthShell } from "@/components/brand/AuthShell";

export default function PanelEntry() {
  async function go(formData: FormData) {
    "use server";
    const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
    if (slug) redirect(`/painel/${slug}`);
  }
  return (
    <AuthShell eyebrow="Panel" title="Entrar a tu local">
      <form action={go} className="space-y-3">
        <label className="label" htmlFor="slug">Dirección de tu menú</label>
        <div className="flex items-center rounded-xl border border-[#33333a] bg-[#18181b] pl-3.5 text-[15px]">
          <span className="text-[#B9B3A7]">atlas.com.py/</span>
          <input id="slug" name="slug" className="w-full bg-transparent py-2.5 pr-3 text-[#F4F1EA] outline-none" placeholder="mi-local" autoFocus />
        </div>
        <button className="btn-primary w-full py-3">Continuar</button>
      </form>
    </AuthShell>
  );
}
