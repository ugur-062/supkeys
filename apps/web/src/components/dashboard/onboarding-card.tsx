"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

interface OnboardingStep {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  /** "2dk", "5dk" gibi süre rozeti */
  duration: string;
  done?: boolean;
}

interface OnboardingCardProps {
  heading: string;
  subtitle: string;
  steps: OnboardingStep[];
}

export function OnboardingCard({
  heading,
  subtitle,
  steps,
}: OnboardingCardProps) {
  const completed = steps.filter((s) => s.done).length;

  return (
    <section
      className={cn(
        "rounded-2xl border border-brand-100 p-6 md:p-7 shadow-sm",
        "bg-gradient-to-br from-brand-50 via-white to-indigo-50/40",
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-900 flex items-center gap-2">
            <span aria-hidden>🎯</span>
            {heading}
          </h2>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
        </div>
        <div className="text-xs font-semibold text-brand-700 bg-white border border-brand-200 px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
          {completed} / {steps.length} tamamlandı
        </div>
      </div>

      <ul className="space-y-3">
        {steps.map((step) => (
          <li
            key={step.title}
            className={cn(
              "rounded-xl border p-4 flex items-center gap-3 transition-[box-shadow,background-color] duration-150",
              "bg-white/85 backdrop-blur border-brand-100/60",
              "hover:bg-white hover:shadow-md",
            )}
          >
            <div className="shrink-0">
              {step.done ? (
                <CheckCircle2 className="w-6 h-6 text-success-600" />
              ) : (
                <Circle className="w-6 h-6 text-slate-300" />
              )}
            </div>

            <div
              className="shrink-0 inline-flex items-center justify-center bg-brand-100 text-brand-700 text-[11px] font-bold rounded-md px-2 py-1 tabular-nums"
              aria-label={`Tahmini süre ${step.duration}`}
            >
              {step.duration}
            </div>

            <div className="flex-1 min-w-0">
              <h3
                className={cn(
                  "font-semibold text-sm",
                  step.done
                    ? "text-slate-400 line-through"
                    : "text-brand-900",
                )}
              >
                {step.title}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {step.description}
              </p>
            </div>

            {!step.done && (
              <Link
                href={step.ctaHref}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5",
                  "text-xs font-semibold text-brand-700",
                  "border border-brand-200 bg-white hover:bg-brand-50 hover:border-brand-300",
                  "px-3 py-1.5 rounded-lg transition-colors",
                )}
              >
                {step.ctaLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
