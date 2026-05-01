"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface StepperProps {
  current: 1 | 2 | 3;
  className?: string;
}

const STEPS = [
  { id: 1, label: "Firma Bilgileri" },
  { id: 2, label: "Yetkili" },
  { id: 3, label: "Tamamlandı" },
] as const;

export function Stepper({ current, className }: StepperProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-4 px-4 py-4 bg-surface-subtle/85 backdrop-blur",
        className,
      )}
    >
      <ol className="flex items-center max-w-xl mx-auto">
        {STEPS.map((step, idx) => {
          const isDone = current > step.id;
          const isActive = current === step.id;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center",
                idx < STEPS.length - 1 && "flex-1",
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                    isDone && "bg-brand-600 text-white",
                    isActive && "bg-brand-600 text-white ring-4 ring-brand-100",
                    !isDone && !isActive && "bg-slate-200 text-slate-400",
                  )}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : step.id}
                </div>
                <span
                  className={cn(
                    "hidden sm:block text-xs font-medium whitespace-nowrap",
                    isActive && "text-brand-700 font-semibold",
                    isDone && "text-brand-600",
                    !isDone && !isActive && "text-slate-400",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "flex-1 h-px mx-3 mb-5 transition-colors",
                    isDone ? "bg-brand-600" : "bg-slate-200",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
