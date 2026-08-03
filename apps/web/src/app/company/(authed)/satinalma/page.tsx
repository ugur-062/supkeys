"use client";

import { SatinalmaIhaleTab } from "@/components/dashboard/satinalma-ihale-tab";
import { ErrorState } from "@/components/ui/error-state";
import { TasarrufTab } from "@/components/dashboard/tasarruf-tab";
import { TedarikciTab } from "@/components/dashboard/tedarikci-tab";
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
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { useSearchParams } from "next/navigation";
import { PeriodToggle, type Period } from "@/components/dashboard/period-toggle";
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

const TABS = [
  { value: "ihale", label: "İhale" },
  { value: "tasarruf", label: "Tasarruf" },
  { value: "tedarikci", label: "Tedarikçi" },
] as const;

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-zinc-500 hover:text-zinc-700",
  "data-selected:border-zinc-900 data-selected:text-zinc-900",
  "focus:outline-none rounded-t-md",
);

export default function SatinalmaDashboardPage() {
  const { company } = useCompanyAuth();
  // Panelin TAMAMI için tek global dönem — URL'de (?period=) taşınır.
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get("period");
  const [period, setPeriodState] = useState<Period>(
    urlPeriod === "month" || urlPeriod === "quarter" ? urlPeriod : "year",
  );
  const setPeriod = (p: Period) => {
    setPeriodState(p);
    const u = new URL(window.location.href);
    if (p === "year") u.searchParams.delete("period");
    else u.searchParams.set("period", p);
    window.history.replaceState(null, "", u.toString());
  };
  const ihale = useSatinalmaDashboard();
  const tasarruf = useSatinalmaTasarruf();
  const tedarikci = useSatinalmaTedarikci();
  const savings = useTimeSavings(period);
  const analytics = useSatinalmaAnalytics(period);

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
                <span className="mx-2 text-zinc-300">·</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        {/* Kur çipi başlıkta — büyük TCMB kartı ve zaman-tasarrufu şeridi
            anasayfadan kalktı (şerit → raporlar hub'ı). */}
        <div className="flex flex-wrap items-center gap-3">
          <TcmbRatesChip />
          <PeriodToggle value={period} onChange={setPeriod} />
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
              label: "İlk ihaleni oluştur",
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

      <TabGroup className="space-y-6">
        <TabList
          className="flex gap-1 border-b border-zinc-950/10"
          aria-label="Pano bölümleri"
        >
          {TABS.map((t) => (
            <Tab key={t.value} className={TRIGGER_CLASSES}>
              {t.label}
            </Tab>
          ))}
        </TabList>

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
                period={period}
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
              <TedarikciTab
                data={tedarikci.data}
                analytics={analytics.data}
              />
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
