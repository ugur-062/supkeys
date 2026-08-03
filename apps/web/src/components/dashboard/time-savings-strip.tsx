"use client";

import { SavingsCriteriaDialog } from "@/components/dashboard/savings-criteria-dialog";
import { formatMoney } from "@/components/ui/money";
import { useTimeSavings } from "@/hooks/use-company-dashboard";
import { DASH } from "@/lib/dashboard/strings";
import { Clock3 } from "lucide-react";
import { useState } from "react";

/**
 * Zaman tasarrufu şeridi — anasayfadaki "vanity" konumundan raporlar hub'ına
 * taşındı (pano refactor Faz 1). Kendi verisini çeker (son 12 ay sabit),
 * "Nasıl hesaplanıyor?" kriter dökümü dialog'da.
 */
export function TimeSavingsStrip() {
  const savings = useTimeSavings("year");
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  if (savings.isLoading) {
    return (
      <div className="h-10 animate-pulse rounded-lg bg-zinc-200/60" aria-hidden />
    );
  }
  const data = savings.data;
  if (!data) return null;

  const hasActivity =
    data.savedMinutes > 0 ||
    data.counters.listings > 0 ||
    data.counters.bids > 0;
  const hours = data.savedMinutes / 60;
  const hoursLabel = hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"
        aria-label={
          hasActivity
            ? `Yaklaşık ${hoursLabel} saat kazandın (${DASH.heroPeriod.year}, tahmini)`
            : DASH.heroEmptyTitle
        }
      >
        <Clock3 className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
        {hasActivity ? (
          <>
            <span className="font-semibold tabular-nums text-slate-950">
              {DASH.heroSavedTitle(hoursLabel)}
            </span>
            <span className="text-slate-500">
              {DASH.heroPeriod.year}
              {data.laborValueTry != null
                ? ` · ${DASH.heroValue(formatMoney(data.laborValueTry, "TRY"))}`
                : ""}
            </span>
            <span className="text-xs text-slate-400">(tahmini)</span>
          </>
        ) : (
          <span className="text-slate-500">{DASH.heroEmptyBody}</span>
        )}
        <button
          type="button"
          onClick={() => setCriteriaOpen(true)}
          className="ml-auto shrink-0 text-xs font-semibold text-slate-500 underline hover:text-slate-900"
        >
          {DASH.heroHow}
        </button>
      </div>
      <SavingsCriteriaDialog
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        params={data.params}
      />
    </>
  );
}
