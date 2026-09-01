"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSatinalmaAnalytics,
  useSatinalmaDashboard,
  useSatinalmaTasarruf,
  useSatinalmaTedarikci,
  useTimeSavings,
} from "@/hooks/use-company-dashboard";
import { ActionCenter } from "@/components/dashboard/action-center";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { cn } from "@/lib/utils";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

/**
 * Perf turu (denetim P10 Dalga B): pano sekmeleri recharts'ı STATİK import
 * ediyordu → grafik kütüphanesi (~100 kB gz) hiçbir grafik açılmasa bile
 * rotanın ilk yükünde geliyordu. Headless UI zaten yalnız seçili paneli
 * mount ediyor; eksik olan kod bölmesiydi. `ssr: false` — recharts tarayıcı
 * ölçümüne dayanır, sunucuda çizmenin faydası yok.
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
  { value: "satın alma talebi", label: "Satın Alma Talebi" },
  { value: "tasarruf", label: "Tasarruf" },
  { value: "tedarikci", label: "Tedarikçi" },
] as const;

// Segmentli sekme — düz zemin üzerindeki alt-çizgi sekmeler kayboluyordu;
// aktif = beyaz pill + panel rengi (satış paneliyle aynı dil).
const TRIGGER_CLASSES = cn(
  "rounded-lg px-5 py-2 text-sm font-semibold whitespace-nowrap transition-all",
  "text-zinc-500 hover:text-zinc-900",
  "data-selected:bg-white data-selected:text-blue-700 data-selected:shadow-sm data-selected:ring-1 data-selected:ring-zinc-950/5",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
);

export default function SatinalmaDashboardPage() {
  const { company } = useCompanyAuth();
  // Faz 3 — dönem + sekme + karşılaştır + özel aralık URL'de (tek doğruluk
  // kaynağı, paylaşılabilir/yer imlenebilir; geri tuşu çalışır).
  const { period, from, to, tab, setParams } = useDashboardParams(
    "satın alma talebi",
    TABS.map((t) => t.value),
  );
  const periodQuery = { period, from, to };
  const ihale = useSatinalmaDashboard();
  const tasarruf = useSatinalmaTasarruf();
  const tedarikci = useSatinalmaTedarikci();
  const savings = useTimeSavings(periodQuery);
  const analytics = useSatinalmaAnalytics(periodQuery);

  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-950">
            Satınalma paneli
          </h1>
          <p className="text-[15px] text-zinc-500">
            {company?.name ?? "Rothern"}
            {todayLabel ? (
              <>
                <span className="mx-2 text-zinc-300">{" · "}</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        {/* Kur çipi başlıkta — büyük TCMB kartı ve zaman-tasarrufu şeridi
            anasayfadan kalktı (şerit → raporlar hub'ı). */}
        <div className="flex flex-wrap items-center gap-3">
          <TcmbRatesChip />
        </div>
      </header>

      {/* Firma verisi tamamen boşsa: aksiyon/grafik yerine başlangıç listesi. */}
      {analytics.data &&
      analytics.data.funnel.every((f) => f.count === 0) &&
      ihale.data &&
      ihale.data.openCount === 0 ? (
        <OnboardingChecklist
          steps={[
            {
              key: "profile",
              label: "Firma profilini tamamla",
              done: !!company?.publicEnabled,
              href: "/company/satinalma/profilim",
            },
            {
              key: "tender",
              label: "İlk satın alma talebinizi oluşturun",
              done: false,
              href: "/company/satinalma/ihalelerim/yeni",
            },
            {
              key: "invite",
              label: "Tedarikçi davet et",
              done: false,
              href: "/company/satinalma/tedarikcilerim",
            },
          ]}
        />
      ) : null}

      {/* Aksiyon merkezi — "bugün ne yapmalıyım" (Faz 2: veri + sıralama
          backend'de, metin haritası ACTION_ROWS'ta). */}
      <ActionCenter portal="satinalma" />

      <TabGroup
        className="space-y-6"
        // Faz 3: sekme URL'de (?tab=) — paylaşılabilir + geri tuşu çalışır.
        selectedIndex={Math.max(0, TABS.findIndex((t) => t.value === tab))}
        onChange={(i) => setParams({ tab: TABS[i]?.value ?? "satın alma talebi" })}
      >
        {/* C46 (satış ile aynı): dönem seçici yalnız bu sekmelerin verisini
            etkiler — ilgili bölümün başında durur. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
        <TabList
          className="inline-flex w-fit gap-1 rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-950/5"
          aria-label="Pano bölümleri"
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
          {/* Hata → ErrorState + Tekrar dene (refetch); retry'sız statik mesaj
              kullanıcıyı tam sayfa yenilemeye mecbur bırakıyordu. */}
          <TabPanel className="outline-none">
            {ihale.data ? (
              <SatinalmaIhaleTab
                data={ihale.data}
                analytics={analytics.data}
              />
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
                // Tasarruf verisi ay/yıl sabit görünümlü — custom aralıkta yıl
                // görünümüne düşer (kart kendi aralığını başlığında söyler).
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
    </div>
  );
}

function TabLoading() {
  // Skeleton — KPI şeridi + tablo yer tutucusu (spinner yerine tek dil).
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-zinc-200/60"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-200/60" />
    </div>
  );
}
