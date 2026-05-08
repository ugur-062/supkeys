import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StepProps {
  num: number;
  label: string;
  active: boolean;
  done: boolean;
}

export function StepIndicator({ num, label, active, done }: StepProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors",
          done
            ? "bg-success-500 text-white"
            : active
              ? "bg-brand-600 text-white"
              : "bg-slate-200 text-slate-500",
        )}
      >
        {done ? <Check className="h-4 w-4" /> : num}
      </div>
      <span
        className={cn(
          "text-sm whitespace-nowrap",
          active || done ? "text-brand-900 font-semibold" : "text-slate-500",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function StepDivider({ done }: { done: boolean }) {
  return (
    <div
      className={cn(
        "h-px flex-1 mx-3 min-w-[40px] max-w-[80px]",
        done ? "bg-success-300" : "bg-slate-300",
      )}
    />
  );
}
