import { CRM_STATUS_COLOR, CRM_STATUS_LABEL, SCORE_COLOR, SCORE_LABEL, type CrmStatus, type Score } from "@/core/crm";

export function ScoreBadge({ score }: { score: Score }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${SCORE_COLOR[score]}26`, color: score === "OURO" ? "#B8860B" : score === "DESQ" ? "#C2412D" : SCORE_COLOR[score] === "#AEB8C4" ? "#7b8794" : "#A0612A" }}>
      ● {SCORE_LABEL[score]}
    </span>
  );
}
export function StatusBadge({ status }: { status: CrmStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--s-soft)] px-2 py-0.5 text-[11px] font-bold">
      <span className="h-2 w-2 rounded-full" style={{ background: CRM_STATUS_COLOR[status] }} /> {CRM_STATUS_LABEL[status]}
    </span>
  );
}
