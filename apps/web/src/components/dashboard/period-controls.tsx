"use client";

import type { DashPeriod } from "@/hooks/use-dashboard-params";
import { cn } from "@/lib/utils";
import { useState } from "react";

/**
 * Pano başlığı dönem kontrolleri (Faz 3): Bu Ay / Bu Çeyrek / Bu Yıl / Özel
 * segmented'ı + Özel'de tarih aralığı girişi. ("Önceki dönemle karşılaştır"
 * toggle'ı kullanıcı isteğiyle kaldırıldı, 2026-08-03 — deltalar artık hep
 * çizilir.) Durum URL'dedir (useDashboardParams); bu bileşen görünüm + niyet.
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
  onChange,
}: {
  period: DashPeriod;
  from: string | null;
  to: string | null;
  onChange: (patch: {
    period?: DashPeriod;
    from?: string | null;
    to?: string | null;
  }) => void;
}) {
  // Taslak tarihler — yalnız "Uygula" URL'e yazar (yarım aralık gezinmez).
  const [draftFrom, setDraftFrom] = useState(from ?? "");
  const [draftTo, setDraftTo] = useState(to ?? "");
  const [customOpen, setCustomOpen] = useState(period === "custom");
  const draftValid =
    draftFrom.length > 0 && draftTo.length > 0 && draftFrom <= draftTo;

  return (
    // C45: özel-aralık paneli ARTIK akışta yer kaplamıyor (absolute popover).
    <div className="relative flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Dönem"
          className="inline-flex rounded-lg bg-zinc-200/70 p-0.5 text-xs font-semibold ring-1 ring-zinc-950/10"
        >
          {OPTIONS.map((opt) => {
            // C45: "Özel" formu açıkken sekme de aktif görünür (uygulanmadan
            // önce "Bu Ay" seçili kalıyordu).
            const active =
              opt.value === "custom"
                ? period === "custom" || customOpen
                : opt.value === period && !customOpen;
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
        <div className="absolute right-0 top-full z-20 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg">
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
            onClick={() => {
              onChange({ period: "custom", from: draftFrom, to: draftTo });
              setCustomOpen(false);
            }}
            className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            Uygula
          </button>
        </div>
      ) : null}
    </div>
  );
}
