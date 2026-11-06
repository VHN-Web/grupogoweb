import { PLATFORM_LABELS, type CustomerStatus } from "@/core/types";

const CLS: Record<CustomerStatus, string> = {
  AWAITING_SETUP_PAYMENT: "bg-amber-100 text-amber-900",
  IMPLEMENTING: "bg-sky-100 text-sky-900",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAST_DUE: "bg-orange-100 text-orange-900",
  SUSPENDED: "bg-red-100 text-red-700",
  CANCELLED: "bg-zinc-200 text-zinc-600",
};

export function StatusPill({ status }: { status: CustomerStatus }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLS[status]}`}>{PLATFORM_LABELS.customerStatus[status]}</span>;
}
