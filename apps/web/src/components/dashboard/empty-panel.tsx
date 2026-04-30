"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

type Accent = "brand" | "success" | "warning" | "indigo" | "neutral";

interface EmptyPanelProps {
  heading: string;
  subtitle?: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
  ctaLabel?: string;
  ctaHref?: string;
  iconAccent?: Accent;
  className?: string;
}

const ICON_ACCENT_CLASSES: Record<Accent, string> = {
  brand: "bg-brand-50 text-brand-500",
  success: "bg-success-50 text-success-500",
  warning: "bg-warning-50 text-warning-500",
  indigo: "bg-indigo-50 text-indigo-500",
  neutral: "bg-slate-100 text-slate-400",
};

export function EmptyPanel({
  heading,
  subtitle,
  icon: Icon,
  emptyTitle,
  emptyDescription,
  ctaLabel,
  ctaHref,
  iconAccent = "neutral",
  className,
}: EmptyPanelProps) {
  return (
    <section
      className={cn(
        "bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 flex flex-col min-h-[280px]",
        className,
      )}
    >
      <header className="mb-5">
        <h2 className="font-display font-bold text-base text-brand-900">
          {heading}
        </h2>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </header>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-6">
        <div
          className={cn(
            "w-16 h-16 rounded-full flex items-center justify-center mb-4",
            ICON_ACCENT_CLASSES[iconAccent],
          )}
        >
          <Icon className="w-7 h-7" strokeWidth={1.75} />
        </div>
        <p className="font-semibold text-brand-900 text-base">{emptyTitle}</p>
        {emptyDescription && (
          <p className="text-sm text-slate-500 mt-1.5 max-w-xs leading-relaxed">
            {emptyDescription}
          </p>
        )}
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className={cn(
              "mt-5 inline-flex items-center gap-1.5",
              "text-sm font-semibold text-brand-700",
              "border border-brand-200 bg-brand-50 hover:bg-brand-100 hover:border-brand-300",
              "px-3.5 py-2 rounded-lg transition-colors",
            )}
          >
            {ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
