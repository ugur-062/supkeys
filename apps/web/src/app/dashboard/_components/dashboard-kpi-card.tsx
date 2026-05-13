"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type KpiAccent = "brand" | "warning" | "success" | "indigo" | "danger";

const ACCENT_BAR: Record<KpiAccent, string> = {
  brand: "bg-brand-500",
  warning: "bg-warning-500",
  success: "bg-success-500",
  indigo: "bg-indigo-500",
  danger: "bg-danger-500",
};

const ARROW_HOVER: Record<KpiAccent, string> = {
  brand: "group-hover:bg-brand-50 group-hover:text-brand-700",
  warning: "group-hover:bg-warning-50 group-hover:text-warning-700",
  success: "group-hover:bg-success-50 group-hover:text-success-700",
  indigo: "group-hover:bg-indigo-50 group-hover:text-indigo-700",
  danger: "group-hover:bg-danger-50 group-hover:text-danger-700",
};

interface DashboardKpiCardProps {
  label: string;
  value: string | number;
  hint?: string;
  /** Hint yanında ⚠️ uyarı ikonu */
  warning?: boolean;
  /** Tıklanabilir kart için href */
  href?: string;
  accent?: KpiAccent;
  /** Başlık yanında küçük (i) tooltip (opsiyonel) */
  titleAfter?: ReactNode;
}

/**
 * V2-6 Dashboard — sol kenarda renkli accent çizgi, sağ üstte → ok ikonu,
 * büyük rakam, opsiyonel uyarı ikonlu hint. Hover translateY(-2px).
 * href varsa Link, yoksa div.
 */
export function DashboardKpiCard({
  label,
  value,
  hint,
  warning,
  href,
  accent = "brand",
  titleAfter,
}: DashboardKpiCardProps) {
  const inner = (
    <>
      {/* Sol accent şeridi */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-3 left-0 w-1 rounded-r",
          ACCENT_BAR[accent],
        )}
      />
      <div className="flex items-start justify-between gap-3 pl-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            <span className="truncate">{label}</span>
            {titleAfter}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-brand-900">
            {value}
          </p>
        </div>
        {href ? (
          <span
            aria-hidden
            className={cn(
              "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors",
              ARROW_HOVER[accent],
            )}
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-3 flex items-start gap-1.5 pl-3 text-xs text-slate-500">
          <span className="flex-1 leading-snug">{hint}</span>
          {warning ? (
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning-500" />
          ) : null}
        </p>
      ) : null}
    </>
  );

  const baseClass = cn(
    "group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 pl-4 shadow-sm",
    "transition-[transform,box-shadow,border-color] duration-150",
    href ? "hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300" : "",
  );

  return href ? (
    <Link href={href} className={baseClass}>
      {inner}
    </Link>
  ) : (
    <div className={baseClass}>{inner}</div>
  );
}
