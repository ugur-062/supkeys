"use client";

import { ActionStrip } from "@/components/dashboard/action-strip";
import { SatinalmaIhaleTab } from "@/components/dashboard/satinalma-ihale-tab";
import { TasarrufTab } from "@/components/dashboard/tasarruf-tab";
import { TedarikciTab } from "@/components/dashboard/tedarikci-tab";
import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSatinalmaDashboard,
  useSatinalmaTasarruf,
  useSatinalmaTedarikci,
} from "@/hooks/use-company-dashboard";
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
  const ihale = useSatinalmaDashboard();
  const tasarruf = useSatinalmaTasarruf();
  const tedarikci = useSatinalmaTedarikci();

  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-3xl">
            Satınalma paneli
          </h1>
          <p className="text-[15px] text-zinc-500">
            {company?.name ?? "Supkeys"}
            {todayLabel ? (
              <>
                <span className="mx-2 text-zinc-300">·</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        {/* TCMB döviz kurları */}
        <div className="w-full md:w-auto md:max-w-md md:flex-shrink-0">
          <TcmbRatesWidget />
        </div>
      </header>

      {/* Bugün ne yapmalıyım? — bekleyen işler (yoksa görünmez) */}
      <ActionStrip portal="satinalma" />

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
          <TabPanel className="outline-none">
            {ihale.data ? (
              <SatinalmaIhaleTab data={ihale.data} />
            ) : (
              <TabLoading message={ihale.isError ? "Veri alınamadı" : undefined} />
            )}
          </TabPanel>
          <TabPanel className="outline-none">
            {tasarruf.data ? (
              <TasarrufTab data={tasarruf.data} />
            ) : (
              <TabLoading
                message={tasarruf.isError ? "Veri alınamadı" : undefined}
              />
            )}
          </TabPanel>
          <TabPanel className="outline-none">
            {tedarikci.data ? (
              <TedarikciTab data={tedarikci.data} />
            ) : (
              <TabLoading
                message={tedarikci.isError ? "Veri alınamadı" : undefined}
              />
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}

function TabLoading({ message }: { message?: string }) {
  if (message) {
    return (
      <div className="flex items-center justify-center rounded-2xl bg-white py-20 text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-950/5">
        {message}
      </div>
    );
  }
  // Skeleton — KPI şeridi + tablo yer tutucusu (spinner yerine tek dil).
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-zinc-100"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-100" />
    </div>
  );
}

