"use client";

import { useLocale, useTranslations } from "next-intl";
import { CompanyActionCenter } from "@/components/company/company-action-center";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ErrorState } from "@/components/ui/error-state";
import { formatCompactMoney } from "@/components/ui/money";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSatinalmaAnalytics,
  useSatinalmaDashboard,
  useSatinalmaTasarruf,
  useSatinalmaTedarikci,
  useSatisAnalytics,
} from "@/hooks/use-company-dashboard";
import { useMyBids } from "@/hooks/use-company-listings";
import { useOrders } from "@/hooks/use-company-orders";
import { useVisitors } from "@/hooks/use-company-views";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import { selectActiveOffers, selectActiveOrders, selectWonOffers } from "@/lib/company/kpi-selectors";
import { COMPANY_AREA_BASE, accessiblePortals, type PortalKey } from "@/lib/company/portals";
import { userHasPermission } from "@/lib/company/permissions";
import { cn } from "@/lib/utils";
import { tierAtLeast } from "@rothern/shared";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { ChartBarIcon, EyeIcon } from "@heroicons/react/20/solid";
import { INTL_LOCALE, formatNumber } from "@/i18n/format";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import dynamic from "next/dynamic";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";

/**
 * ŞİRKETİM › GENEL BAKIŞ = firmanın İŞ KOKPİTİ (2026-09-05, kullanıcı kararı:
 * "profil burada olmasın; bekleyen işler ve pazar yeri öncesi pano gibi").
 *
 * Sıra "ne yapmalıyım → nasıl gidiyorum → neden → ne kazandım":
 *   1. ince başlık (firma, tarih, kur çipi; sağda Ziyaret Edenler · N ve İş Analizi)
 *   2. BEKLEYEN İŞLER — iki portal birleşik, aciliyete göre gruplu tam liste
 *   3. SAYILAR — tek dönem seçici; Satınalma satırı (mavi) + Satış satırı (yeşil)
 *   4. GRAFİKLER — eski beş sekme (Satın Alma Talebi · Tasarruf · Tedarikçi ·
 *      Gelir · Müşteri), tembel recharts, aynı dönem seçicisine bağlı
 *   5. (Zaman tasarrufu şeridi kaldırıldı — 2026-09-10)
 * Profil, vitrin, ekip, doğrulama, paket burada YOK — hepsinin kendi sayfası
 * var. Portal anasayfaları pazar yeri; tam iş listesi ve grafikler yalnız
 * burada (Raporlar hub'ından özet grafikler kaldırıldı — tekrar yok).
 * Rol: yalnız erişilen portalın satırı/sekmeleri çizilir; o portalın uçları
 * hiç çağrılmaz (`enabled=false` — 403 tostu yok).
 */
const TabLoading = () => (
  <div className="space-y-4" aria-hidden>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />)}
    </div>
    <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
  </div>
);
const SatinalmaIhaleTab = dynamic(() => import("@/components/dashboard/satinalma-ihale-tab").then((m) => m.SatinalmaIhaleTab), { ssr: false, loading: () => <TabLoading /> });
const TasarrufTab = dynamic(() => import("@/components/dashboard/tasarruf-tab").then((m) => m.TasarrufTab), { ssr: false, loading: () => <TabLoading /> });
const TedarikciTab = dynamic(() => import("@/components/dashboard/tedarikci-tab").then((m) => m.TedarikciTab), { ssr: false, loading: () => <TabLoading /> });
const SatisGelirTab = dynamic(() => import("@/components/dashboard/satis-chart-tabs").then((m) => m.SatisGelirTab), { ssr: false, loading: () => <TabLoading /> });
const SatisMusteriTab = dynamic(() => import("@/components/dashboard/satis-chart-tabs").then((m) => m.SatisMusteriTab), { ssr: false, loading: () => <TabLoading /> });

/** Sekme etiketi katalog ANAHTARI (`web.panel.company.companyOverview.*`); `value` adres parametresi (`?tab=`), çevrilmez. */
type TabLabelKey = "satinAlmaTalebi" | "tasarruf" | "tedarikci" | "gelir" | "musteri";
const TABS: readonly { value: string; label: TabLabelKey; portal: PortalKey }[] = [
  { value: "satın alma talebi", label: "satinAlmaTalebi", portal: "satinalma" },
  { value: "tasarruf", label: "tasarruf", portal: "satinalma" },
  { value: "tedarikci", label: "tedarikci", portal: "satinalma" },
  { value: "gelir", label: "gelir", portal: "satis" },
  { value: "musteri", label: "musteri", portal: "satis" },
];

const TRIGGER = cn(
  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all",
  "text-zinc-500 hover:text-zinc-900",
  "data-selected:bg-white data-selected:text-zinc-950 data-selected:shadow-sm data-selected:ring-1 data-selected:ring-zinc-950/5",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/30",
);

export function CompanyOverview() {
  const t = useTranslations("web.panel.company.companyOverview");
  const locale = useLocale();
  const { company, user } = useCompanyAuth();
  const tier = company?.tier ?? "STANDART";
  const portals = accessiblePortals(user, tier);
  const hasSa = portals.includes("satinalma");
  const hasSt = portals.includes("satis");
  const tabs = TABS.filter((item) => portals.includes(item.portal));
  const { period, from, to, tab, setParams } = useDashboardParams(
    tabs[0]?.value ?? "satın alma talebi",
    tabs.map((item) => item.value),
  );
  const periodQuery = { period, from, to };

  const ihale = useSatinalmaDashboard(hasSa);
  const tasarruf = useSatinalmaTasarruf(hasSa);
  const tedarikci = useSatinalmaTedarikci(hasSa);
  const saAnalytics = useSatinalmaAnalytics(periodQuery, hasSa);
  const stAnalytics = useSatisAnalytics(periodQuery, hasSt);
  const bids = useMyBids(hasSt);
  const orders = useOrders(hasSt);
  // Ziyaret Edenler / İş Analizi = "insights:view" (API `company/views/*` aynası).
  // İzni olmayana bağlantı ÇİZİLMEZ ve sorgu atılmaz (2026-09-17: satınalma
  // kullanıcısı satış tarafının analiz sayfasına giriş görmemeli).
  const canInsights = userHasPermission(user, "insights:view");
  const visitors = useVisitors(30, 1, canInsights);

  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    // Okuyucunun dilinde, ürün saat dilimiyle (Intl — date-fns yereli gerekmez).
    setTodayLabel(
      new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        day: "numeric",
        month: "long",
        year: "numeric",
        weekday: "long",
        timeZone: APP_TIME_ZONE,
      }).format(new Date()),
    );
  }, [locale]);

  const periodWord = period === "month" ? t("buAy") : period === "quarter" ? t("buCeyrek") : period === "year" ? t("buYil") : t("seciliAralik");
  const savingsMetrics = tasarruf.data ? (period === "month" ? tasarruf.data.month : tasarruf.data.year) : null;
  const revenue = stAnalytics.data ? stAnalytics.data.revenueTrend.reduce((n, p) => n + (p.value ?? 0), 0) : null;
  const selectedIndex = Math.max(0, tabs.findIndex((item) => item.value === tab));

  return (
    <div className="space-y-8">
      {/* 1 · İnce başlık */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="mb-1 truncate text-2xl font-semibold tracking-tight text-zinc-950">{company?.name ?? "—"}</h1>
          <p className="text-[15px] text-zinc-500">
            {t("genelBakis")}
            {todayLabel ? (
              <>
                <span className="mx-2 text-zinc-300">·</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TcmbRatesChip />
          {canInsights ? (
          <Link
            href={`${COMPANY_AREA_BASE}/ziyaretciler`}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            <EyeIcon aria-hidden className="size-4 text-blue-600" />
            {t("ziyaretEdenler")}
            {visitors.data ? <span className="rounded-full bg-zinc-100 px-1.5 tabular-nums text-zinc-700">{visitors.data.total}</span> : null}
          </Link>
          ) : null}
          {canInsights && tierAtLeast(tier, "SILVER") ? (
            <Link
              href={`${COMPANY_AREA_BASE}/raporlar/is-analizi`}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50"
            >
              <ChartBarIcon aria-hidden className="size-4 text-emerald-600" />
              {t("isAnalizi")}
            </Link>
          ) : null}
        </div>
      </header>

      {/* 2 · Bekleyen işler */}
      {portals.length > 0 ? <CompanyActionCenter portals={portals} /> : null}

      {/* 3 · Sayılar */}
      {portals.length > 0 ? (
        <section aria-labelledby="sayilar" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="sayilar" className="text-lg font-semibold tracking-tight text-zinc-950">{t("sayilar")}</h2>
              <p className="mt-1 text-sm text-zinc-500">{t("adetlerAnlikTutarlarVeGrafikler")}</p>
            </div>
            <PeriodControls period={period} from={from} to={to} onChange={setParams} />
          </div>

          {hasSa ? (
            <KpiRow label={t("satinalma")} tone="blue">
              {ihale.data ? (
                <>
                  <KpiCard label={t("acikTaleplerim")} value={ihale.data.openCount} href="/company/satinalma/taleplerim?status=OPEN" accent="blue" />
                  <KpiCard label={t("gelenTeklifler")} value={ihale.data.bidsReceived} href="/company/satinalma/taleplerim?status=IN_AWARD" accent="blue" />
                  <KpiCard label={t("kazandirilan")} value={ihale.data.awarded} href="/company/satinalma/taleplerim?status=AWARDED" accent="blue" />
                  <KpiCard label={t("devamEdenSiparis")} value={ihale.data.ongoingOrders} href="/company/satinalma/siparisler" accent="blue" />
                  <KpiCard
                    label={t("tasarruf")}
                    value={savingsMetrics ? formatCompactMoney(savingsMetrics.totalSavings, "TRY") : "—"}
                    valueTitle={savingsMetrics ? `${formatNumber(savingsMetrics.totalSavings, locale)} ₺` : undefined}
                    href={`${COMPANY_AREA_BASE}/raporlar/tasarruf`}
                    accent="blue"
                    hint={savingsMetrics ? t("tasarrufIpucu", { periodWord: period === "month" ? t("buAy") : t("buYil"), rate: Math.round(savingsMetrics.averageSavingsRate) }) : t("hesaplaniyor")}
                  />
                </>
              ) : ihale.isError ? (
                <ErrorState title={t("satinalmaSayilariAlinamadi")} onRetry={() => void ihale.refetch()} />
              ) : (
                <RowSkeleton />
              )}
            </KpiRow>
          ) : null}

          {hasSt ? (
            <KpiRow label={t("satis")} tone="emerald">
              {bids.data && orders.data ? (
                <>
                  <KpiCard
                    label={t("yanitBekleyenDavet")}
                    value={stAnalytics.data?.actions.unansweredInvites ?? 0}
                    href="/company/satis#acik-talepler"
                    accent="emerald"
                    attention={(stAnalytics.data?.actions.unansweredInvites ?? 0) > 0}
                    hint={(stAnalytics.data?.actions.unansweredInvites ?? 0) > 0 ? t("teklifiniziBekliyor") : undefined}
                  />
                  <KpiCard label={t("aktifTekliflerim")} value={selectActiveOffers(bids.data).length} href="/company/satis/tekliflerim" accent="emerald" deltaPct={stAnalytics.data?.deltas.bidsSubmitted} deltaPeriodLabel={t("oncekiDonemeGore", { periodWord: periodWord })} spark={stAnalytics.data?.kpiSeries.bidsSubmitted} />
                  <KpiCard label={t("kazandigimIsler")} value={selectWonOffers(bids.data).length} href="/company/satis/tekliflerim?status=WON" accent="emerald" hint={t("kismiKazanimDahil")} spark={stAnalytics.data?.kpiSeries.won} />
                  <KpiCard label={t("aktifSiparis")} value={selectActiveOrders(orders.data, "seller").length} href="/company/satis/siparisler" accent="emerald" deltaPct={stAnalytics.data?.deltas.orders} deltaPeriodLabel={t("oncekiDonemeGore", { periodWord: periodWord })} spark={stAnalytics.data?.kpiSeries.orders} />
                  <KpiCard
                    label={t("gelir")}
                    value={revenue != null ? formatCompactMoney(revenue, "TRY") : "—"}
                    valueTitle={revenue != null ? `${formatNumber(revenue, locale)} ₺` : undefined}
                    href="/company/satis/siparisler"
                    accent="emerald"
                    deltaPct={stAnalytics.data?.deltas.revenue}
                    deltaPeriodLabel={t("oncekiDonemeGore", { periodWord: periodWord })}
                    spark={stAnalytics.data?.kpiSeries.revenue}
                    sparkLabels={{ valueSuffix: " ₺" }}
                    hint={t("tamamlananSiparisTry", { periodWord: periodWord })}
                  />
                </>
              ) : bids.isError || orders.isError ? (
                <ErrorState title={t("satisSayilariAlinamadi")} onRetry={() => { void bids.refetch(); void orders.refetch(); }} />
              ) : (
                <RowSkeleton />
              )}
            </KpiRow>
          ) : null}
        </section>
      ) : null}

      {/* 4 · Grafikler */}
      {tabs.length > 0 ? (
        <section aria-labelledby="grafikler" className="space-y-4">
          <div>
            <h2 id="grafikler" className="text-lg font-semibold tracking-tight text-zinc-950">{t("grafikler")}</h2>
            <p className="mt-1 text-sm text-zinc-500">{t("seciliDonemIcinSekmeAdresle")}</p>
          </div>
          <TabGroup selectedIndex={selectedIndex} onChange={(i) => setParams({ tab: tabs[i]?.value ?? tabs[0]!.value })}>
            <TabList className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-950/5" aria-label={t("grafikSekmeleri")}>
              {tabs.map((item) => (
                <Tab key={item.value} className={TRIGGER}>
                  <span aria-hidden className={cn("size-1.5 rounded-full", item.portal === "satinalma" ? "bg-blue-500" : "bg-emerald-500")} />
                  {t(item.label)}
                </Tab>
              ))}
            </TabList>
            <TabPanels className="mt-4">
              {tabs.map((item) => (
                <TabPanel key={item.value} className="outline-none">
                  {/* `value` VERİ (adres parametresi) — çevrilmez, katalog anahtarıyla karşılaştırılmaz. */}
                  {item.value === "satın alma talebi" ? (
                    ihale.data ? <SatinalmaIhaleTab data={ihale.data} analytics={saAnalytics.data} showKpis={false} /> : ihale.isError ? <ErrorState title={t("veriAlinamadi")} onRetry={() => void ihale.refetch()} /> : <TabLoading />
                  ) : item.value === "tasarruf" ? (
                    tasarruf.data ? <TasarrufTab data={tasarruf.data} period={period === "custom" ? "year" : period} analytics={saAnalytics.data} /> : tasarruf.isError ? <ErrorState title={t("veriAlinamadi")} onRetry={() => void tasarruf.refetch()} /> : <TabLoading />
                  ) : item.value === "tedarikci" ? (
                    tedarikci.data ? <TedarikciTab data={tedarikci.data} /> : tedarikci.isError ? <ErrorState title={t("veriAlinamadi")} onRetry={() => void tedarikci.refetch()} /> : <TabLoading />
                  ) : item.value === "gelir" ? (
                    <SatisGelirTab analytics={stAnalytics.data} loading={stAnalytics.isLoading} />
                  ) : (
                    <SatisMusteriTab analytics={stAnalytics.data} loading={stAnalytics.isLoading} />
                  )}
                </TabPanel>
              ))}
            </TabPanels>
          </TabGroup>
        </section>
      ) : null}

      {/* 5 · Zaman tasarrufu şeridi KALDIRILDI (2026-09-10, kullanıcı kararı). */}
    </div>
  );
}

function KpiRow({ label, tone, children }: { label: string; tone: "blue" | "emerald"; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        <span aria-hidden className={cn("size-2 rounded-full", tone === "blue" ? "bg-blue-500" : "bg-emerald-500")} />
        {label}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">{children}</div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-100" aria-hidden />
      ))}
    </>
  );
}
