import { cn } from "@/lib/utils";
import { ClipboardList, Package } from "lucide-react";

interface Props {
  context: "ORDER" | "TENDER";
  number: string;
  className?: string;
}

/**
 * V2-4 — Mesaj thread'inin hangi bağlamdan geldiğini gösteren rozet.
 * 📦 Sipariş yeşil / 📋 İhale mavi.
 */
export function ContextBadge({ context, number, className }: Props) {
  const isOrder = context === "ORDER";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
        isOrder
          ? "bg-success-50 text-success-700"
          : "bg-blue-50 text-blue-700",
        className,
      )}
    >
      {isOrder ? (
        <Package className="h-3 w-3" />
      ) : (
        <ClipboardList className="h-3 w-3" />
      )}
      {isOrder ? "Sipariş" : "İhale"} {number}
    </span>
  );
}
