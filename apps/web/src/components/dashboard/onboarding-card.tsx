"use client";

import { cn } from "@/lib/utils";
import { ArrowRight, Circle, type LucideIcon } from "lucide-react";
import Link from "next/link";

interface OnboardingStep {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  done?: boolean;
  icon?: LucideIcon;
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
        "rounded-2xl border border-brand-100 p-6 md:p-7",
        "bg-gradient-to-br from-brand-50 to-brand-100/40",
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="font-display font-bold text-xl text-brand-900">
            {heading}
          </h2>
          <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
        </div>
        <div className="text-xs font-medium text-brand-700 bg-white border border-brand-200 px-2.5 py-1 rounded-full whitespace-nowrap">
          {completed} / {steps.length} tamamlandı
        </div>
      </div>

      <ul className="space-y-3">
        {steps.map((step) => {
          const Icon = step.icon ?? Circle;
          return (
            <li
              key={step.title}
              className="bg-white/80 backdrop-blur rounded-xl border border-brand-100/60 p-4 flex items-start gap-3"
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  step.done
                    ? "bg-success-50 text-success-600"
                    : "bg-slate-100 text-slate-400",
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className={cn(
                    "font-medium text-sm",
                    step.done ? "text-slate-400 line-through" : "text-brand-900",
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
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline shrink-0 self-center"
                >
                  {step.ctaLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
