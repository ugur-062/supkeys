"use client";

import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import { useAuth, useMe } from "@/hooks/use-auth";
import {
  useTenantDashboardIhale,
  useTenantDashboardTasarruf,
  useTenantDashboardTedarikci,
} from "@/hooks/use-tenant-dashboard";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
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
  "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/60",
  "data-[state=active]:border-brand-500 data-[state=active]:text-brand-700 data-[state=active]:bg-brand-50/30",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-t-md",
);

const CONTENT_CLASSES = cn(
  "outline-none",
  "data-[state=active]:animate-in data-[state=active]:fade-in-50 data-[state=active]:duration-200",
);

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
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">
              Hoş geldin, {user?.firstName ?? "Supkeys kullanıcısı"} 👋
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-success-500/20 bg-success-50 px-2 py-1 text-xs font-semibold text-success-700">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-success-500"
              />
              Aktif
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {user?.tenant.name
              ? `${user.tenant.name} hesabına genel bakış`
              : "Panele genel bakış"}
            {todayLabel && (
              <>
                <span className="mx-2 text-slate-300">·</span>
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

      <TabsPrimitive.Root defaultValue="ihale" className="space-y-6">
        <TabsPrimitive.List
          className="flex gap-1 overflow-x-auto border-b border-slate-200"
          aria-label="Dashboard bölümleri"
        >
          {TABS.map((t) => (
            <TabsPrimitive.Trigger
              key={t.value}
              value={t.value}
              className={TRIGGER_CLASSES}
            >
              {t.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="ihale" className={CONTENT_CLASSES}>
          {ihaleQuery.data ? (
            <IhaleTab data={ihaleQuery.data} />
          ) : (
            <TabLoading message={ihaleQuery.isError ? "Veri alınamadı" : undefined} />
          )}
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="tasarruf" className={CONTENT_CLASSES}>
          {tasarrufQuery.data ? (
            <TasarrufTab data={tasarrufQuery.data} />
          ) : (
            <TabLoading
              message={tasarrufQuery.isError ? "Veri alınamadı" : undefined}
            />
          )}
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="tedarikci" className={CONTENT_CLASSES}>
          {tedarikciQuery.data ? (
            <TedarikciTab data={tedarikciQuery.data} />
          ) : (
            <TabLoading
              message={tedarikciQuery.isError ? "Veri alınamadı" : undefined}
            />
          )}
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}

function TabLoading({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-20 text-sm text-slate-500 shadow-sm">
      {message ? (
        message
      ) : (
        <>
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          Yükleniyor…
        </>
      )}
    </div>
  );
}
