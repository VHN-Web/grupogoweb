import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GoWebLogo } from "@/components/brand/GoWebLogo";
import { directoryStores } from "@/services/directory";
import { StoreGrid } from "../StoreGrid";
import { getRegion, tr } from "@/core/region";

export const dynamic = "force-dynamic";

async function load(cidade: string) {
  return (await directoryStores()).filter((s) => s.citySlug === cidade);
}

export async function generateMetadata({ params }: { params: Promise<{ cidade: string }> }): Promise<Metadata> {
  const list = await load((await params).cidade);
  const city = list[0]?.city;
  if (!city) return { title: "Vitrine GoWeb" };
  return { title: `Onde pedir em ${city} — Vitrine GoWeb`, description: `${list.length} restaurantes e comércios de ${city} para pedir online: delivery, retirada e mesa.` };
}

export default async function VitrineCidade({ params }: { params: Promise<{ cidade: string }> }) {
  const { cidade } = await params;
  const list = await load(cidade);
  if (!list.length) notFound();
  const T = tr(getRegion(list[0].country).locale);
  const cats = [...new Set(list.map((s) => s.category).filter(Boolean))];
  return (
    <main className="min-h-dvh bg-[#F4F1EA] text-[#0E0E10]">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <Link href="/vitrine"><GoWebLogo height={30} dark={false} /></Link>
        <h1 className="mt-8 text-3xl font-black tracking-tight">{T("Dónde pedir en", "Onde pedir em")} {list[0].city}</h1>
        <p className="mt-1 text-[#6B665C]">{list.length} {list.length === 1 ? T("negocio", "loja") : T("negocios", "lojas")}{cats.length ? ` · ${cats.slice(0, 6).join(", ")}` : ""}</p>
        <div className="mt-6"><StoreGrid stores={list} /></div>
      </div>
    </main>
  );
}
