"use client";

import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  /** "0" gibi düşürülen değer — null/undefined verilirse "—" placeholder gösterilir */
  value: string | number | null | undefined;
  /** Eğer pozitif sayı, yukarı yeşil ok; negatif, aşağı kırmızı ok. 0 ya da undefined → trend yok */
  trend?: number;
  trendLabel?: string;
  hint?: string;
  icon: LucideIcon;
  /** İkon arka plan/renk eşleşmesi — Tailwind sınıf çiftleri */
  accent?: "brand" | "success" | "warning" | "danger";
}

const ACCENT_CLASSES: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  brand: "bg-brand-50 text-brand-600",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
};

export function KpiCard({
  label,
  value,
  trend,
  trendLabel,
  hint,
  icon: Icon,
  accent = "brand",
}: KpiCardProps) {
  const isEmpty = value === null || value === undefined || value === "";
  const display = isEmpty ? "—" : String(value);

  let trendNode: React.ReactNode = null;
  if (typeof trend === "number" && trend !== 0) {
    const up = trend > 0;
    const TrendIcon = up ? ArrowUpRight : ArrowDownRight;
    trendNode = (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-medium",
          up ? "text-success-600" : "text-danger-600",
        )}
      >
        <TrendIcon className="w-3.5 h-3.5" />
        {Math.abs(trend)}%
        {trendLabel && (
          <span className="text-slate-500 font-normal ml-1">{trendLabel}</span>
        )}
      </span>
    );
  }

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            ACCENT_CLASSES[accent],
          )}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>
        {trendNode}
      </div>
      <div>
        <div className="text-sm text-slate-500">{label}</div>
        <div
          className={cn(
            "mt-1 font-display font-bold text-3xl tabular-nums",
            isEmpty ? "text-slate-300 italic" : "text-brand-900",
          )}
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {display}
        </div>
        {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
      </div>
    </div>
  );
}
