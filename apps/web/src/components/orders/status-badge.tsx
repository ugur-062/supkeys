import { ORDER_STATUS_META } from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const meta = ORDER_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap",
        meta.pillClass,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
