"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyPanelProps {
  heading: string;
  subtitle?: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
}

export function EmptyPanel({
  heading,
  subtitle,
  icon: Icon,
  emptyTitle,
  emptyDescription,
  ctaLabel,
  ctaHref,
  className,
}: EmptyPanelProps) {
  return (
    <section className={cn("card p-6 flex flex-col", className)}>
      <header className="mb-5">
        <h2 className="font-display font-bold text-lg text-brand-900">
          {heading}
        </h2>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
        )}
      </header>

      <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 border border-dashed border-surface-border rounded-xl bg-surface-subtle/50">
        <div className="w-12 h-12 rounded-full bg-white border border-surface-border flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-slate-400" />
        </div>
        <p className="font-medium text-brand-900 text-sm">{emptyTitle}</p>
        {emptyDescription && (
          <p className="text-xs text-slate-500 mt-1 max-w-xs">
            {emptyDescription}
          </p>
        )}
        {ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline"
          >
            {ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}
