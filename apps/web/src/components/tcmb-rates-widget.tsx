"use client";

import { useCurrentExchangeRates } from "@/hooks/use-exchange-rates";
import { TrendingUp } from "lucide-react";

/**
 * Inline SVG bayraklar — emoji bayraklar (🇺🇸) bazı platformlarda (özellikle
 * Windows tarayıcılarında) render olmadığından, her yerde görünen SVG kullanılır.
 */
function FlagUS() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" aria-hidden>
      <rect width="20" height="14" fill="#fff" />
      <g fill="#b22234">
        <rect width="20" height="2" y="0" />
        <rect width="20" height="2" y="4" />
        <rect width="20" height="2" y="8" />
        <rect width="20" height="2" y="12" />
      </g>
      <rect width="9" height="8" fill="#3c3b6e" />
    </svg>
  );
}

function FlagEU() {
  // Mavi zemin + altın yıldız halkası (12 yıldız yaklaşık).
  const stars = Array.from({ length: 12 }).map((_, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: 10 + 4.2 * Math.cos(a), y: 7 + 4.2 * Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" aria-hidden>
      <rect width="20" height="14" fill="#003399" />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r="0.7" fill="#ffcc00" />
      ))}
    </svg>
  );
}

function FlagGB() {
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5 rounded-[2px] ring-1 ring-black/10" aria-hidden>
      <rect width="20" height="14" fill="#012169" />
      <path d="M0,0 L20,14 M20,0 L0,14" stroke="#fff" strokeWidth="2.6" />
      <path d="M0,0 L20,14 M20,0 L0,14" stroke="#C8102E" strokeWidth="1.2" />
      <rect x="8" width="4" height="14" fill="#fff" />
      <rect y="5" width="20" height="4" fill="#fff" />
      <rect x="9" width="2" height="14" fill="#C8102E" />
      <rect y="6" width="20" height="2" fill="#C8102E" />
    </svg>
  );
}

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

  const formatRate = (val: number) =>
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    }).format(val);

  const usd = data?.rates.USD ?? 0;
  const eur = data?.rates.EUR ?? 0;
  const gbp = data?.rates.GBP ?? 0;

  return (
    <div className="bg-gradient-to-r from-success-50 to-success-50/40 border border-success-200 rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-success-900 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            TCMB Döviz Kurları
          </h3>
          <p className="text-xs text-success-700 mt-0.5">
            Günlük gösterge kuru · TCMB
            {/* Kur GÜNLÜK — fetch saati değil kurun ait olduğu TARİH gösterilir
                (hafta sonu = son iş günü kuru). */}
            {data?.rateDate ? (
              <>
                {" · "}
                {new Date(`${data.rateDate}T00:00:00`).toLocaleDateString(
                  "tr-TR",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </>
            ) : dataUpdatedAt > 0 ? (
              <>
                {" · "}
                {new Date(dataUpdatedAt).toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </>
            ) : null}
          </p>
        </div>

        {/* P0: flex-shrink-0 dar kolonda karttan taşıp SAYFA-GENELİ yatay
            scrollbar üretiyordu (£ kuru dışarı taşar) — sarmalanabilir. */}
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
            <FlagUS />
            <p className="text-sm font-bold text-success-900 tabular-nums">
              ${formatRate(usd)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
            <FlagEU />
            <p className="text-sm font-bold text-success-900 tabular-nums">
              €{formatRate(eur)}
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5">
            <FlagGB />
            <p className="text-sm font-bold text-success-900 tabular-nums">
              £{formatRate(gbp)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
