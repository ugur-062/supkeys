"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { Fragment } from "react";

interface StepperProps {
  current: 1 | 2 | 3 | 4;
}

const STEPS = [
  { id: 1, label: "İhale Bilgileri" },
  { id: 2, label: "Kalemler" },
  { id: 3, label: "Tedarikçiler" },
  { id: 4, label: "Tamamla" },
] as const;

export function WizardStepper({ current }: StepperProps) {
  return (
    <ol className="flex items-center w-full max-w-3xl">
      {STEPS.map((step, idx) => {
        const isDone = current > step.id;
        const isActive = current === step.id;

        return (
          <Fragment key={step.id}>
            <li className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors",
                  isActive && "bg-brand-600 text-white ring-4 ring-brand-100",
                  isDone && !isActive && "bg-success-500 text-white",
                  !isActive && !isDone && "bg-slate-200 text-slate-500",
                )}
              >
                {isDone ? <Check className="w-5 h-5" /> : step.id}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap text-center hidden sm:block",
                  isActive && "text-brand-700",
                  isDone && !isActive && "text-success-700",
                  !isActive && !isDone && "text-slate-500",
                )}
              >
                {step.label}
              </span>
            </li>
            {idx < STEPS.length - 1 ? (
              <div
                className={cn(
                  "flex-1 h-1 rounded-full mx-2 mb-6 transition-colors",
                  isDone ? "bg-success-400" : "bg-slate-200",
                )}
              />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}
