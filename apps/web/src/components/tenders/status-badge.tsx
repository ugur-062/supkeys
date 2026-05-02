import {
  BID_STATUS_META,
  INVITATION_STATUS_META,
  TENDER_STATUS_META,
  TENDER_TYPE_META,
} from "@/lib/tenders/labels";
import type {
  BidStatus,
  TenderInvitationStatus,
  TenderStatus,
  TenderType,
} from "@/lib/tenders/types";
import { cn } from "@/lib/utils";

interface BadgeProps {
  className?: string;
}

export function TenderStatusBadge({
  status,
  className,
}: BadgeProps & { status: TenderStatus }) {
  const meta = TENDER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function TenderTypeBadge({
  type,
  className,
}: BadgeProps & { type: TenderType }) {
  const meta = TENDER_TYPE_META[type];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function InvitationStatusBadge({
  status,
  className,
}: BadgeProps & { status: TenderInvitationStatus }) {
  const meta = INVITATION_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function BidStatusBadge({
  status,
  className,
}: BadgeProps & { status: BidStatus | null }) {
  if (!status) {
    return (
      <span className="text-slate-400 text-xs">—</span>
    );
  }
  const meta = BID_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
