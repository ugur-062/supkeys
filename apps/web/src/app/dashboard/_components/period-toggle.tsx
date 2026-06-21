"use client";

import { cn } from "@/lib/utils";

export type Period = "month" | "year";

const OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "Bu Ay" },
  { value: "year", label: "Bu Yıl" },
];

interface Props {
  value: Period;
  onChange: (next: Period) => void;
  className?: string;
}

/**
 * V2-6 — Bu Ay / Bu Yıl segmented control. Tasarruf + Tedarikçi
 * tab'larında metrik kartlarında üst-sağ köşede kullanılır.
 */
export function PeriodToggle({ value, onChange, className }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Dönem"
      className={cn(
        "inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs font-semibold ring-1 ring-zinc-950/5",
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
