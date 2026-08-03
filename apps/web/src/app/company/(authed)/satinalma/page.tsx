"use client";

import { ActionStrip } from "@/components/dashboard/action-strip";
import { InvitedPendingBanner } from "@/components/dashboard/invited-pending-banner";
import { SatinalmaIhaleTab } from "@/components/dashboard/satinalma-ihale-tab";
import { ErrorState } from "@/components/ui/error-state";
import { TasarrufTab } from "@/components/dashboard/tasarruf-tab";
import { TedarikciTab } from "@/components/dashboard/tedarikci-tab";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSatinalmaDashboard,
  useSatinalmaTasarruf,
  useSatinalmaTedarikci,
  useTimeSavings,
} from "@/hooks/use-company-dashboard";
import { HeroStat } from "@/components/dashboard/hero-stat";
import { PeriodToggle, type Period } from "@/components/dashboard/period-toggle";
import { SavingsCriteriaDialog } from "@/components/dashboard/savings-criteria-dialog";
import { formatMoney } from "@/components/ui/money";
import { DASH } from "@/lib/dashboard/strings";
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
  // Panelin TAMAMI için tek global dönem (kart içi seçiciler kalktı).
  const [period, setPeriod] = useState<Period>("year");
  const ihale = useSatinalmaDashboard();
  const tasarruf = useSatinalmaTasarruf();
  const tedarikci = useSatinalmaTedarikci();
  const savings = useTimeSavings(period);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

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
        <PeriodToggle value={period} onChange={setPeriod} />
      </header>

      {/* ZAMAN TASARRUFU şeridi — başlığın hemen altında, sekmelerin ÜSTÜNDE. */}
      {savings.isLoading ? (
        <div className="h-28 animate-pulse rounded-xl bg-zinc-100" aria-hidden />
      ) : savings.data ? (
        <SavingsHero
          data={savings.data}
          period={period}
          onHowClick={() => setCriteriaOpen(true)}
        />
      ) : null}
      <SavingsCriteriaDialog
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        params={savings.data?.params}
      />

      {/* Uyarı: davet edilip teklif verilmemiş açık SATIŞ ihaleleri (yoksa görünmez) */}
      <InvitedPendingBanner
        count={ihale.data?.invitedPending ?? 0}
        href="/company/satinalma/satin-al"
      />

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
          {/* Hata → ErrorState + Tekrar dene (refetch); retry'sız statik mesaj
              kullanıcıyı tam sayfa yenilemeye mecbur bırakıyordu. */}
          <TabPanel className="outline-none">
            {ihale.data ? (
              <SatinalmaIhaleTab data={ihale.data} />
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
            className="h-24 animate-pulse rounded-2xl bg-zinc-100"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-zinc-100" />
    </div>
  );
}

/** Zaman Tasarrufu şeridi — 1 ana sayı + en fazla 3 destek (kural). */
function SavingsHero({
  data,
  period,
  onHowClick,
}: {
  data: NonNullable<ReturnType<typeof useTimeSavings>["data"]>;
  period: Period;
  onHowClick: () => void;
}) {
  const hasActivity =
    data.savedMinutes > 0 ||
    data.counters.listings > 0 ||
    data.counters.bids > 0;
  if (!hasActivity) {
    return (
      <HeroStat
        headline=""
        ariaLabel={DASH.heroEmptyTitle}
        supports={[]}
        spark={[]}
        empty={{
          title: DASH.heroEmptyTitle,
          body: DASH.heroEmptyBody,
          ctaLabel: DASH.heroEmptyCta,
          ctaHref: "/company/satinalma/ihalelerim/yeni",
        }}
      />
    );
  }
  const hours = data.savedMinutes / 60;
  const hoursLabel =
    hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1);
  const workDays = (hours / 8).toFixed(hours / 8 >= 10 ? 0 : 1);
  const supports = [
    DASH.heroWorkDays(workDays),
    DASH.heroPeriod[period],
    ...(data.laborValueTry != null
      ? [DASH.heroValue(formatMoney(data.laborValueTry, "TRY"))]
      : []),
  ];
  return (
    <HeroStat
      headline={DASH.heroSavedTitle(hoursLabel)}
      ariaLabel={`Yaklaşık ${hoursLabel} saat kazandın — ${supports.join(", ")}`}
      supports={supports}
      note={DASH.heroEstimatedNote}
      spark={data.months.map((m) => ({ key: m.key, value: m.minutes }))}
      onHowClick={onHowClick}
      howLabel={DASH.heroHow}
    />
  );
}
