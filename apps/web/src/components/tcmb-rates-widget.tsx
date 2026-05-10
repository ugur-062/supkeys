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
      <div className="bg-white border border-slate-200 rounded-2xl p-4 animate-pulse">
        <div className="flex items-center justify-between gap-4">
          <div className="h-4 bg-slate-200 rounded w-32" />
          <div className="flex gap-3">
            <div className="h-10 bg-slate-200 rounded w-28" />
            <div className="h-10 bg-slate-200 rounded w-28" />
          </div>
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
    <div className="bg-gradient-to-r from-success-50 to-success-50/40 border border-success-200 rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-success-900 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            TCMB Döviz Kurları
          </h3>
          <p className="text-[10px] text-success-700 mt-0.5">
            Günlük gösterge kuru · TCMB
            {dataUpdatedAt > 0 ? (
              <>
                {" · "}
                {new Date(dataUpdatedAt).toLocaleTimeString("tr-TR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-white/70 rounded-lg px-2.5 py-1.5">
            <span className="text-base" aria-hidden>
              🇺🇸
            </span>
            <div className="leading-tight">
              <p className="text-[10px] text-success-700 font-medium">USD</p>
              <p className="text-sm font-bold text-success-900 font-mono tabular-nums">
                {formatTry(usd)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-white/70 rounded-lg px-2.5 py-1.5">
            <span className="text-base" aria-hidden>
              🇪🇺
            </span>
            <div className="leading-tight">
              <p className="text-[10px] text-success-700 font-medium">EUR</p>
              <p className="text-sm font-bold text-success-900 font-mono tabular-nums">
                {formatTry(eur)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
