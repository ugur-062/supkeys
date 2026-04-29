import { DEMO_REQUEST_STATUS_META } from "@/lib/demo-requests/status";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: DemoRequestStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = DEMO_REQUEST_STATUS_META[status];

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
