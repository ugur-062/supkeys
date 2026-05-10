"use client";

import { useCurrentExchangeRates } from "@/hooks/use-exchange-rates";
import { TrendingUp } from "lucide-react";

/**
 * V2-3 — TCMB günlük gösterge kuru widget'ı.
 * Tenant + supplier dashboard'larında render edilir. Endpoint public
 * (`/api/exchange-rates/current`), cache 5 dk + refetchInterval 5 dk.
 */
export function TcmbRatesWidget() {
  const { data, isLoading, dataUpdatedAt } = useCurrentExchangeRates();

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
        <div className="space-y-2">
          <div className="h-10 bg-slate-200 rounded" />
          <div className="h-10 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  const formatTry = (val: number) =>
    new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(val);

  const usd = data?.rates.USD ?? 0;
  const eur = data?.rates.EUR ?? 0;

  return (
    <div className="bg-gradient-to-br from-success-50 to-success-50/40 border border-success-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-success-900 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            TCMB Döviz Kurları
          </h3>
          <p className="text-xs text-success-700 mt-0.5">
            Günlük gösterge kuru
          </p>
        </div>
        {dataUpdatedAt > 0 ? (
          <span className="text-[10px] text-success-600 font-medium">
            {new Date(dataUpdatedAt).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : null}
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between bg-white/60 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              🇺🇸
            </span>
            <span className="text-sm font-semibold text-success-900">
              1 USD
            </span>
          </div>
          <span className="text-base font-bold text-success-900 font-mono tabular-nums">
            {formatTry(usd)}
          </span>
        </div>

        <div className="flex items-center justify-between bg-white/60 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden>
              🇪🇺
            </span>
            <span className="text-sm font-semibold text-success-900">
              1 EUR
            </span>
          </div>
          <span className="text-base font-bold text-success-900 font-mono tabular-nums">
            {formatTry(eur)}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-success-700 mt-3 pt-3 border-t border-success-200">
        Kaynak: TCMB · Her gün 16:00&apos;da güncellenir
      </p>
    </div>
  );
}
