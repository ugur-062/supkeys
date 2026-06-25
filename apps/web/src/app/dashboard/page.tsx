"use client";

import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import { useAuth, useMe } from "@/hooks/use-auth";
import {
  useTenantDashboardIhale,
  useTenantDashboardTasarruf,
  useTenantDashboardTedarikci,
} from "@/hooks/use-tenant-dashboard";
import { cn } from "@/lib/utils";
import {
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@headlessui/react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { IhaleTab } from "./_components/ihale-tab";

// Performans audit P-8 — recharts (~150KB gzip) içeren tab'lar lazy yüklenir.
// Kullanıcı "İhale" tab'ında geliyor; diğer 2 tab'a tıkladığında recharts
// chunk'ı fetch edilir. Dashboard initial JS ~150KB↓, TTI ~500ms↓ (3G).
const TasarrufTab = dynamic(
  () => import("./_components/tasarruf-tab").then((m) => m.TasarrufTab),
  { ssr: false, loading: () => <TabLoading /> },
);
const TedarikciTab = dynamic(
  () => import("./_components/tedarikci-tab").then((m) => m.TedarikciTab),
  { ssr: false, loading: () => <TabLoading /> },
);

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

const CONTENT_CLASSES = "outline-none";

export default function DashboardPage() {
  const { user } = useAuth();
  useMe();

  const [todayLabel, setTodayLabel] = useState<string>("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  const ihaleQuery = useTenantDashboardIhale();
  const tasarrufQuery = useTenantDashboardTasarruf();
  const tedarikciQuery = useTenantDashboardTedarikci();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-3xl">
            Hoş geldin, {user?.firstName ?? "Rothern kullanıcısı"}
          </h1>
          <p className="text-[15px] text-zinc-500">
            {user?.tenant.name
              ? `${user.tenant.name} hesabına genel bakış`
              : "Panele genel bakış"}
            {todayLabel && (
              <>
                <span className="mx-2 text-zinc-300">·</span>
                <span>{todayLabel}</span>
              </>
            )}
          </p>
        </div>
        {/* V2-3 — TCMB döviz kurları (USD + EUR), 5dk cache */}
        <div className="w-full md:w-auto md:max-w-md md:flex-shrink-0">
          <TcmbRatesWidget />
        </div>
      </header>

      <TabGroup className="space-y-6">
        <TabList
          className="flex gap-1 border-b border-zinc-950/10"
          aria-label="Dashboard bölümleri"
        >
          {TABS.map((t) => (
            <Tab key={t.value} className={TRIGGER_CLASSES}>
              {t.label}
            </Tab>
          ))}
        </TabList>

        <TabPanels>
          <TabPanel className={CONTENT_CLASSES}>
            {ihaleQuery.data ? (
              <IhaleTab data={ihaleQuery.data} />
            ) : (
              <TabLoading
                message={ihaleQuery.isError ? "Veri alınamadı" : undefined}
              />
            )}
          </TabPanel>

          <TabPanel className={CONTENT_CLASSES}>
            {tasarrufQuery.data ? (
              <TasarrufTab data={tasarrufQuery.data} />
            ) : (
              <TabLoading
                message={tasarrufQuery.isError ? "Veri alınamadı" : undefined}
              />
            )}
          </TabPanel>

          <TabPanel className={CONTENT_CLASSES}>
            {tedarikciQuery.data ? (
              <TedarikciTab data={tedarikciQuery.data} />
            ) : (
              <TabLoading
                message={tedarikciQuery.isError ? "Veri alınamadı" : undefined}
              />
            )}
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}

function TabLoading({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white py-20 text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-950/5">
      {message ? (
        message
      ) : (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
          Yükleniyor…
        </>
      )}
    </div>
  );
}
