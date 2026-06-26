"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { Fragment } from "react";

interface Props {
  steps: string[];
  /** 0-tabanlı aktif adım. */
  current: number;
  /** Tamamlanmış adıma tıklayınca geri dönme (opsiyonel). */
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Eski ihale wizard'ının profesyonel adım göstergesi — numaralı daireler,
 * tamamlanınca ✓, aktifte ring, aralarda bağlantı çubuğu. Catalyst monokrom
 * (brand = siyah) + success yeşili tamamlanan adımlarda.
 */
export function WizardStepper({
  steps,
  current,
  onStepClick,
  className,
}: Props) {
  return (
    <ol className={cn("flex w-full items-center", className)}>
      {steps.map((label, idx) => {
        const isDone = current > idx;
        const isActive = current === idx;
        const clickable = isDone && !!onStepClick;

        return (
          <Fragment key={label}>
            <li className="flex flex-col items-center gap-2">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(idx)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  isActive &&
                    "bg-brand-600 text-white ring-4 ring-brand-100",
                  isDone && "bg-success-500 text-white",
                  !isActive && !isDone && "bg-slate-200 text-slate-500",
                  clickable && "cursor-pointer hover:opacity-90",
                )}
              >
                {isDone ? <Check className="h-5 w-5" /> : idx + 1}
              </button>
              <span
                className={cn(
                  "hidden whitespace-nowrap text-center text-xs font-medium sm:block",
                  isActive && "text-zinc-900",
                  isDone && "text-success-700",
                  !isActive && !isDone && "text-slate-400",
                )}
              >
                {label}
              </span>
            </li>
            {idx < steps.length - 1 ? (
              <div
                className={cn(
                  "mx-2 mb-6 h-1 flex-1 rounded-full transition-colors",
                  isDone ? "bg-success-500" : "bg-slate-200",
                )}
              />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
