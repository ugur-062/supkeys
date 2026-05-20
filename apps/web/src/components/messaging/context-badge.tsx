import type { MessageContext } from "@/lib/messages/types";
import { cn } from "@/lib/utils";
import { Building2, ClipboardList, Package } from "lucide-react";

interface Props {
  context: MessageContext;
  number: string;
  className?: string;
}

/**
 * V2-4 — Mesaj thread'inin hangi bağlamdan geldiğini gösteren rozet.
 * 📦 Sipariş yeşil / 📋 İhale mavi / 🏢 Doğrudan (şirket) gri.
 */
export function ContextBadge({ context, number, className }: Props) {
  const config = (() => {
    switch (context) {
      case "ORDER":
        return {
          icon: <Package className="h-3 w-3" />,
          label: "Sipariş",
          cls: "bg-success-50 text-success-700",
        };
      case "TENDER":
        return {
          icon: <ClipboardList className="h-3 w-3" />,
          label: "İhale",
          cls: "bg-blue-50 text-blue-700",
        };
      case "DIRECT":
        return {
          icon: <Building2 className="h-3 w-3" />,
          label: "",
          cls: "bg-slate-100 text-slate-600",
        };
    }
  })();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold",
        config.cls,
        className,
      )}
    >
      {config.icon}
      {config.label} {number}
    </span>
  );
}
