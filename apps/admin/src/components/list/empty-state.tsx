"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * "no-data" — hiç veri yok (renkli accent ile pozitif onboarding tonu)
   * "no-results" — filtre/arama eşleşmedi (nötr ton)
   */
  variant?: "no-data" | "no-results";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "no-data",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "h-16 w-16 rounded-2xl flex items-center justify-center mb-4",
          variant === "no-results" ? "bg-slate-100" : "bg-zinc-100",
        )}
      >
        <Icon
          className={cn(
            "h-8 w-8",
            variant === "no-results" ? "text-slate-400" : "text-brand-500",
          )}
        />
      </div>
      <h3 className="text-lg font-display font-semibold text-brand-900 mb-2">
        {title}
      </h3>
      {description ? (
        <p className="text-sm text-slate-500 max-w-md mb-4 leading-relaxed">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
