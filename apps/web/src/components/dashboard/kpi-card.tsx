"use client";

import { cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  /** "0" gibi düşürülen değer — null/undefined verilirse "—" placeholder gösterilir */
  value: string | number | null | undefined;
  /** Pozitif → yukarı yeşil, negatif → aşağı kırmızı, 0/undefined → gizli */
  trend?: number;
  trendLabel?: string;
  /** Veri olmadığında veya context için alt satır metni */
  hint?: string;
  icon: LucideIcon;
  /** İkon arka plan/renk eşleşmesi */
  accent?: "brand" | "success" | "warning" | "danger" | "indigo";
}

const ACCENT_CLASSES: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  brand: "bg-brand-50 text-brand-600",
  success: "bg-success-50 text-success-600",
  warning: "bg-warning-50 text-warning-600",
  danger: "bg-danger-50 text-danger-600",
  indigo: "bg-indigo-50 text-indigo-600",
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

  // Üst sağ pill: trend varsa onu, yoksa "Henüz veri yok"
  let topRightNode: React.ReactNode;
  if (typeof trend === "number" && trend !== 0) {
    const up = trend > 0;
    const TrendIcon = up ? ArrowUpRight : ArrowDownRight;
    topRightNode = (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full",
          up
            ? "bg-success-50 text-success-700"
            : "bg-danger-50 text-danger-700",
        )}
      >
        <TrendIcon className="w-3 h-3" />
        {Math.abs(trend)}%
        {trendLabel && (
          <span className="font-medium opacity-80 ml-0.5">{trendLabel}</span>
        )}
      </span>
    );
  } else if (isEmpty) {
    topRightNode = (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
        Henüz veri yok
      </span>
    );
  }

  return (
    <div
      className={cn(
        "group bg-white rounded-2xl border border-slate-200/60 p-5 flex flex-col gap-4",
        "shadow-sm transition-[transform,box-shadow] duration-150",
        "hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            ACCENT_CLASSES[accent],
          )}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={2.25} />
        </div>
        {topRightNode}
      </div>

      <div className="space-y-1">
        <div className="text-sm text-slate-500">{label}</div>
        <div
          className={cn(
            "font-display font-bold text-4xl leading-none tabular-nums",
            isEmpty ? "text-slate-400" : "text-brand-900",
          )}
          style={{ fontFeatureSettings: '"tnum"' }}
        >
          {display}
        </div>
      </div>

      {hint && (
        <div className="pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-400">{hint}</div>
        </div>
      )}
    </div>
  );
}
