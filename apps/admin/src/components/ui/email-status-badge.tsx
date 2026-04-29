import { EMAIL_STATUS_META } from "@/lib/email-logs/status";
import type { EmailLogStatus } from "@/lib/email-logs/types";
import { cn } from "@/lib/utils";

interface EmailStatusBadgeProps {
  status: EmailLogStatus;
  className?: string;
}

export function EmailStatusBadge({ status, className }: EmailStatusBadgeProps) {
  const meta = EMAIL_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
        meta.badgeClass,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
