"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export interface StepperItem {
  id: number;
  label: string;
}

interface StepperProps {
  current: number;
  steps?: readonly StepperItem[];
  className?: string;
}

const DEFAULT_STEPS: readonly StepperItem[] = [
  { id: 1, label: "Firma Bilgileri" },
  { id: 2, label: "Yetkili" },
  { id: 3, label: "Tamamlandı" },
];

export function Stepper({ current, steps = DEFAULT_STEPS, className }: StepperProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-4 px-4 py-4 bg-surface-subtle/85 backdrop-blur",
        className,
      )}
    >
      <ol className="flex items-center max-w-xl mx-auto">
        {steps.map((step, idx) => {
          const isDone = current > step.id;
          const isActive = current === step.id;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center",
                idx < steps.length - 1 && "flex-1",
              )}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                    isDone && "bg-zinc-600 text-white",
                    isActive && "bg-zinc-600 text-white ring-4 ring-zinc-100",
                    !isDone && !isActive && "bg-slate-200 text-slate-400",
                  )}
                >
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : step.id}
                </div>
                <span
                  className={cn(
                    "hidden sm:block text-xs font-medium whitespace-nowrap",
                    isActive && "text-zinc-700 font-semibold",
                    isDone && "text-zinc-600",
                    !isDone && !isActive && "text-slate-400",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 ? (
                <div
                  className={cn(
                    "flex-1 h-px mx-3 mb-5 transition-colors",
                    isDone ? "bg-zinc-600" : "bg-slate-200",
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
