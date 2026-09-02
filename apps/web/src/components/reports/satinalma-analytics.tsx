"use client";

import { ErrorState } from "@/components/ui/error-state";
import { PeriodControls } from "@/components/dashboard/period-controls";
import {
  useSatinalmaAnalytics,
  useSatinalmaDashboard,
  useSatinalmaTasarruf,
  useSatinalmaTedarikci,
  useTimeSavings,
} from "@/hooks/use-company-dashboard";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { cn } from "@/lib/utils";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import dynamic from "next/dynamic";

/**
 * ANALİZ — panodan RAPORLAR'a taşınan grafik sekmeleri (2026-09-03).
 *
 * Neden taşındı: aynı veri hem panoda hem bu hub'ın özet grafiklerinde
 * çiziliyordu (çift bakım) ve pano "pazar yeri" olmaktan çıkıyordu. Grafik
 * bir KARAR ekranıdır — oraya bilerek gidilir; anasayfada bir bakışta okunan
 * sayı yeter.
 *
 * Dönem seçici de buraya geldi: panoda seçilecek dönem kalmadı.
 *
 * Perf: recharts tembel + yalnız istemci (P10 Dalga B kararı korunuyor).
 */
const SatinalmaIhaleTab = dynamic(
  () =>
    import("@/components/dashboard/satinalma-ihale-tab").then(
      (m) => m.SatinalmaIhaleTab,
    ),
  { ssr: false, loading: () => <TabLoading /> },
);
const TasarrufTab = dynamic(
  () => import("@/components/dashboard/tasarruf-tab").then((m) => m.TasarrufTab),
  { ssr: false, loading: () => <TabLoading /> },
);
const TedarikciTab = dynamic(
  () =>
    import("@/components/dashboard/tedarikci-tab").then((m) => m.TedarikciTab),
  { ssr: false, loading: () => <TabLoading /> },
);

const TABS = [
  { value: "talep", label: "Talepler" },
  { value: "tasarruf", label: "Tasarruf" },
  { value: "tedarikci", label: "Tedarikçi" },
] as const;

const TRIGGER_CLASSES = cn(
  "rounded-lg px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all",
  "text-zinc-500 hover:text-zinc-900",
  "data-selected:bg-white data-selected:text-blue-700 data-selected:shadow-sm data-selected:ring-1 data-selected:ring-zinc-950/5",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
);

export function SatinalmaAnalytics() {
  const { period, from, to, tab, setParams } = useDashboardParams(
    "talep",
    TABS.map((t) => t.value),
  );
  const periodQuery = { period, from, to };
  const ihale = useSatinalmaDashboard();
  const tasarruf = useSatinalmaTasarruf();
  const tedarikci = useSatinalmaTedarikci();
  const savings = useTimeSavings(periodQuery);
  const analytics = useSatinalmaAnalytics(periodQuery);

  return (
    <section className="space-y-6" aria-label="Analiz">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
        Analiz
      </h2>
      <TabGroup
        className="space-y-6"
        selectedIndex={Math.max(0, TABS.findIndex((t) => t.value === tab))}
        onChange={(i) => setParams({ tab: TABS[i]?.value ?? "talep" })}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabList
            className="inline-flex w-fit gap-1 rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-950/5"
            aria-label="Analiz bölümleri"
          >
            {TABS.map((t) => (
              <Tab key={t.value} className={TRIGGER_CLASSES}>
                {t.label}
              </Tab>
            ))}
          </TabList>
          <PeriodControls period={period} from={from} to={to} onChange={setParams} />
        </div>

        <TabPanels>
          <TabPanel className="outline-none">
            {ihale.data ? (
              <SatinalmaIhaleTab data={ihale.data} analytics={analytics.data} />
            ) : ihale.isError ? (
              <ErrorState
                title="Veri alınamadı"
                onRetry={() => void ihale.refetch()}
              />
            ) : (
              <TabLoading />
            )}
          </TabPanel>
          <TabPanel className="outline-none">
            {tasarruf.data ? (
              <TasarrufTab
                data={tasarruf.data}
                period={period === "custom" ? "year" : period}
                savings={savings.data}
                analytics={analytics.data}
              />
            ) : tasarruf.isError ? (
              <ErrorState
                title="Veri alınamadı"
                onRetry={() => void tasarruf.refetch()}
              />
            ) : (
              <TabLoading />
            )}
          </TabPanel>
          <TabPanel className="outline-none">
            {tedarikci.data ? (
              <TedarikciTab data={tedarikci.data} />
            ) : tedarikci.isError ? (
              <ErrorState
                title="Veri alınamadı"
                onRetry={() => void tedarikci.refetch()}
              />
            ) : (
              <TabLoading />
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </section>
  );
}

function TabLoading() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-200/60" />
    </div>
  );
}
