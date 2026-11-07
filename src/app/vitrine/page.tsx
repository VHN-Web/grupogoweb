import Link from "next/link";
import type { Metadata } from "next";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { directoryStores } from "@/services/directory";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vitrine GoWeb — lojas e restaurantes da sua cidade", description: "Encontre restaurantes, lanchonetes e comércios da sua cidade e peça online, direto com a loja." };

export default async function Vitrine() {
  const stores = await directoryStores();
  const cities = new Map<string, { name: string; n: number }>();
  for (const s of stores) cities.set(s.citySlug, { name: s.city, n: (cities.get(s.citySlug)?.n ?? 0) + 1 });
  return (
    <main className="min-h-dvh bg-[#F4F1EA] text-[#0E0E10]">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Link href="/"><GoWebLogo height={30} dark={false} /></Link>
        <h1 className="mt-8 text-3xl font-black tracking-tight">Vitrine da cidade</h1>
        <p className="mt-1 text-[#6B665C]">Peça direto com os comércios locais — sem taxa de aplicativo para a loja.</p>
        <div className="stagger mt-6 flex flex-wrap gap-2">
          {[...cities].sort((a, b) => b[1].n - a[1].n).map(([slug, c]) => (
            <Link key={slug} href={`/vitrine/${slug}`} className="lift rounded-full border border-black/10 bg-white px-4 py-2 font-semibold">{c.name} <span className="text-[#6B665C]">· {c.n}</span></Link>
          ))}
        </div>
        {cities.size === 0 && <p className="mt-6 rounded-2xl bg-white p-5 text-sm">As primeiras lojas estão chegando. Tem um comércio? <Link className="font-semibold underline" href="/">Conheça a GoWeb</Link>.</p>}
      </div>
    </main>
  );
}
