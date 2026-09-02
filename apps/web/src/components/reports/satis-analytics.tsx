"use client";

import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { formatCompactMoney, formatMoney } from "@/components/ui/money";
import {
  useSatisAnalytics,
  useSatisStats,
} from "@/hooks/use-company-dashboard";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

/**
 * ANALİZ (satış) — panodan RAPORLAR'a taşınan grafikler + dönemsel tutar
 * kartları (2026-09-03). Gerekçe `satinalma-analytics.tsx` ile aynı.
 */
const SatisGelirTab = dynamic(
  () => import("@/components/dashboard/satis-chart-tabs").then((m) => m.SatisGelirTab),
  { ssr: false, loading: () => <TabLoading /> },
);
const SatisMusteriTab = dynamic(
  () =>
    import("@/components/dashboard/satis-chart-tabs").then((m) => m.SatisMusteriTab),
  { ssr: false, loading: () => <TabLoading /> },
);

const TABS = [
  ["ozet", "Özet"],
  ["gelir", "Gelir"],
  ["musteri", "Müşteri"],
] as const;

export function SatisAnalytics() {
  const { period, from, to, tab, setParams } = useDashboardParams(
    "ozet",
    TABS.map(([v]) => v),
  );
  const stats = useSatisStats();
  const analytics = useSatisAnalytics({ period, from, to });
  const s = stats.data;

  return (
    <section className="space-y-6" aria-label="Analiz">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
        Analiz
      </h2>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Analiz bölümleri"
          className="inline-flex w-fit gap-1 rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-950/5"
        >
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setParams({ tab: key })}
              className={cn(
                "rounded-lg px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40",
                tab === key
                  ? "bg-white text-emerald-700 shadow-sm ring-1 ring-zinc-950/5"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <PeriodControls period={period} from={from} to={to} onChange={setParams} />
      </div>

      {tab === "gelir" ? (
        <SatisGelirTab analytics={analytics.data} loading={analytics.isLoading} />
      ) : tab === "musteri" ? (
        <SatisMusteriTab analytics={analytics.data} loading={analytics.isLoading} />
      ) : (
        /* Özet: dönemsel tutar kartları — panodaki dönemsiz 4 sayının aksine
           bunlar aralık bildirir, o yüzden dönem seçicinin yanında dururlar. */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Son 30 Gün Teklif"
            value={s?.last30Days.bidsSubmitted ?? 0}
            href="/company/satis/tekliflerim"
            accent="emerald"
            deltaPct={
              s && s.last30Days.prevBidsSubmitted > 0
                ? Math.round(
                    ((s.last30Days.bidsSubmitted - s.last30Days.prevBidsSubmitted) /
                      s.last30Days.prevBidsSubmitted) *
                      100,
                  )
                : undefined
            }
            hint="son 30 gün · önceki 30 güne göre"
          />
          <KpiCard
            label="Toplam Gelir"
            value={formatCompactMoney(s?.revenue.total ?? 0)}
            valueTitle={formatMoney(s?.revenue.total ?? 0)}
            href="/company/satis/siparisler"
            accent="emerald"
            deltaPct={
              s && s.revenue.prev30 > 0
                ? Math.round(
                    ((s.revenue.last30 - s.revenue.prev30) / s.revenue.prev30) * 100,
                  )
                : undefined
            }
            hint="tüm zamanlar · yalnız TRY"
          />
          <KpiCard
            label="Bağlı Müşteri"
            value={s?.buyers.active ?? 0}
            href="/company/satis/musterilerim"
            accent="emerald"
            hint="aktif bağlantı"
          />
        </div>
      )}
    </section>
  );
}

function TabLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-200/60" />
      ))}
    </div>
  );
}
