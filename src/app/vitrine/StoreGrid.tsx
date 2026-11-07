import { tenantPublicUrl } from "@/lib/urls";

type S = { id: string; slug: string; name: string; tagline: string | null; logoUrl: string | null; primaryColor: string; customDomain: string | null; city: string; category: string };

export function StoreGrid({ stores }: { stores: S[] }) {
  return (
    <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {stores.map((s) => (
        <a key={s.id} href={`${tenantPublicUrl(s)}${s.customDomain ? "/" : ""}?origem=vitrine`} className="lift flex items-center gap-4 rounded-2xl border border-black/10 bg-white p-4">
          {s.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="grid h-14 w-14 place-items-center rounded-full text-xl font-black text-white" style={{ background: s.primaryColor }}>{s.name[0]}</span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-bold">{s.name}</span>
            <span className="block truncate text-sm text-[#6B665C]">{[s.category, s.tagline].filter(Boolean).join(" · ") || s.city}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
