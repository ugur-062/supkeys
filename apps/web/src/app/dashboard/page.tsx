"use client";

import { useAuth, useMe } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useEffect, useState } from "react";
import { IhaleTab } from "./_components/ihale-tab";
import {
  MOCK_IHALE,
  MOCK_TASARRUF,
  MOCK_TEDARIKCI,
} from "./_components/mock-data";
import { TasarrufTab } from "./_components/tasarruf-tab";
import { TedarikciTab } from "./_components/tedarikci-tab";

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
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
          <IhaleTab data={MOCK_IHALE} />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="tasarruf" className={CONTENT_CLASSES}>
          <TasarrufTab data={MOCK_TASARRUF} />
        </TabsPrimitive.Content>

        <TabsPrimitive.Content value="tedarikci" className={CONTENT_CLASSES}>
          <TedarikciTab data={MOCK_TEDARIKCI} />
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}
