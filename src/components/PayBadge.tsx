import { getLabels } from "@/core/types";

export function PayBadge({ status, locale = "es" }: { status: string; locale?: "es" | "pt" }) {
  const cls =
    status === "PAID" ? "bg-emerald-100 text-emerald-800" : status === "FAILED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-900";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{getLabels(locale).paymentStatus[status as "PAID"]}</span>;
}
