import {
  APPROVAL_REQUEST_STATUS_META,
  APPROVAL_TYPE_LABEL,
  APPROVAL_TYPE_PILL_CLASS,
} from "@/lib/approval-requests/labels";
import type {
  ApprovalFlowType,
  ApprovalRequestStatus,
} from "@/lib/approval-requests/types";
import { cn } from "@/lib/utils";

export function ApprovalStatusBadge({
  status,
  size = "md",
}: {
  status: ApprovalRequestStatus;
  size?: "sm" | "md";
}) {
  const meta = APPROVAL_REQUEST_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        meta.pillClass,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} />
      {meta.label}
    </span>
  );
}

export function ApprovalTypeBadge({ type }: { type: ApprovalFlowType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        APPROVAL_TYPE_PILL_CLASS[type],
      )}
    >
      {APPROVAL_TYPE_LABEL[type]}
    </span>
  );
}
