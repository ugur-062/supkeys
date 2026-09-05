"use client";

import type { ViewDays } from "@/hooks/use-company-views";

/** 7 / 30 / 90 gün — Ziyaret Edenler ve İş Analizi aynı seçici. */
export function PeriodSelect({ value, onChange }: { value: ViewDays; onChange: (d: ViewDays) => void }) {
  const opts: { d: ViewDays; l: string }[] = [
    { d: 7, l: "7 gün" },
    { d: 30, l: "30 gün" },
    { d: 90, l: "90 gün" },
  ];
  return (
    <div role="group" aria-label="Dönem" className="inline-flex rounded-full bg-zinc-100 p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.d}
          type="button"
          aria-pressed={value === o.d}
          onClick={() => onChange(o.d)}
          className={`rounded-full px-3 py-1 font-semibold transition ${value === o.d ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950"}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
