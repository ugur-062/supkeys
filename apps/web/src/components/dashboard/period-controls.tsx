"use client";

import type { DashPeriod } from "@/hooks/use-dashboard-params";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * Pano başlığı dönem kontrolleri (Faz 3): Bu Ay / Bu Çeyrek / Bu Yıl / Özel
 * segmented'ı + Özel'de tarih aralığı girişi + "Karşılaştır" toggle'ı.
 * Durum URL'dedir (useDashboardParams); bu bileşen yalnız görünüm + niyet.
 */

const OPTIONS: { value: DashPeriod; label: string }[] = [
  { value: "month", label: "Bu Ay" },
  { value: "quarter", label: "Bu Çeyrek" },
  { value: "year", label: "Bu Yıl" },
  { value: "custom", label: "Özel" },
];

export function PeriodControls({
  period,
  from,
  to,
  compare,
  onChange,
}: {
  period: DashPeriod;
  from: string | null;
  to: string | null;
  compare: boolean;
  onChange: (patch: {
    period?: DashPeriod;
    from?: string | null;
    to?: string | null;
    compare?: boolean;
  }) => void;
}) {
  // Taslak tarihler — yalnız "Uygula" URL'e yazar (yarım aralık gezinmez).
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const [customOpen, setCustomOpen] = useState(period === "custom");
  const draftValid =
    draftFrom.length > 0 && draftTo.length > 0 && draftFrom <= draftTo;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-zinc-600">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => onChange({ compare: e.target.checked })}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
          Önceki dönemle karşılaştır
        </label>
        <div
          role="tablist"
          aria-label="Dönem"
          className="inline-flex rounded-lg bg-zinc-200/70 p-0.5 text-xs font-semibold ring-1 ring-zinc-950/10"
        >
          {OPTIONS.map((opt) => {
            const active = opt.value === period;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  if (opt.value === "custom") {
                    setCustomOpen(true);
                    // Aralık zaten geçerliyse anında geç; değilse form bekler.
                    if (from && to) onChange({ period: "custom", from, to });
                  } else {
                    setCustomOpen(false);
                    onChange({ period: opt.value });
                  }
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  active
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {customOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span>Başlangıç</span>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            <span>Bitiş</span>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(e) => setDraftTo(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
            />
          </label>
          <button
            type="button"
            disabled={!draftValid}
            onClick={() =>
              onChange({ period: "custom", from: draftFrom, to: draftTo })
            }
            className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            Uygula
          </button>
        </div>
      ) : null}
    </div>
  );
}
