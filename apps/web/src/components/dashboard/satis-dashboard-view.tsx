"use client";

import { cn } from "@/lib/utils";
import { ActionCenter } from "@/components/dashboard/action-center";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import {
  ChartCard,
  DashboardEmptyState,
  FunnelChart,
  KpiCard,
} from "@/components/dashboard/analytics-primitives";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { useDashboardParams } from "@/hooks/use-dashboard-params";
import dynamic from "next/dynamic";

/**
 * Perf turu (P10 Dalga B): grafik sekmeleri `satis-chart-tabs.tsx`'e taşındı
 * ve tembel yükleniyor — recharts artık pano açılışında değil, ilgili sekme
 * açıldığında iniyor. `ssr: false`: recharts tarayıcı ölçümüne dayanır.
 */
const SatisGelirTab = dynamic(
  () => import("./satis-chart-tabs").then((m) => m.SatisGelirTab),
  { ssr: false, loading: () => <ChartTabsLoading /> },
);
const SatisMusteriTab = dynamic(
  () => import("./satis-chart-tabs").then((m) => m.SatisMusteriTab),
  { ssr: false, loading: () => <ChartTabsLoading /> },
);

function ChartTabsLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-zinc-200/60" />
      ))}
    </div>
  );
}
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSatisStats } from "@/hooks/use-company-dashboard";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import { formatCompactMoney, formatMoney } from "@/components/ui/money";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Satış panosu — karşılama + CTA, aksiyon merkezi, adet KPI satırı + tutar
 * KPI satırı (eski "Performans" kartı — aralığı kart üstünde açıkça yazar);
 * tek kolon. ("Son Aktiviteler" akışı kullanıcı isteğiyle kaldırıldı,
 * 2026-08-03.) Blok sırası satınalma paneliyle hizalı (Faz 7.6);
 * satınalmanın İhale/Tasarruf/Tedarikçi sekmeleri veri örgütü gereği
 * korunur — bilinçli sapma. Görsel dil: zinc/Catalyst.
 */
export function SatisDashboardView() {
  const { company } = useCompanyAuth();
  const stats = useSatisStats();

  // Hydration-safe tarih (sunucu/istemci farkı olmasın).
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  const s = stats.data;
  const loading = stats.isLoading;
  // Faz 3 — dönem + sekme + karşılaştır + özel aralık URL'de (satınalma ile
  // ortak useDashboardParams; geri tuşu çalışır, sayfa paylaşılabilir).
  const { period, from, to, tab, setParams } = useDashboardParams(
    "teklif",
    ["teklif", "gelir", "musteri"],
  );
  const analytics = useSatisAnalytics({ period, from, to });
  // Faz 7.3: yükleme artık iskeletle çözülür (aşağıda) — kartlara gelindiyse
  // veri var; "—" yalnız "değer gerçekten yok" anlamında kalır.
  const val = (n: number | undefined) => n ?? 0;

  return (
    <div className="space-y-8">
      {/* Karşılama başlığı — satınalma paneliyle aynı biçim */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-zinc-950">
            Satış paneli
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
        {/* Kur çipi + dönem seçici üst satırda; "İhaleleri Görüntüle" CTA'sı
            alt satırda (yan yana üçlü kalabalık duruyordu — kullanıcı isteği). */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <TcmbRatesChip />
          </div>
          <Link
            href="/company/satis/acik-ihaleler"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            İhaleleri Görüntüle
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      {/* Faz 8.3 — yeni satıcı: boş kart yığını yerine ilk-çalıştırma listesi
          (satınalma ile aynı bileşen; tamamlanınca kendiliğinden kaybolur). */}
      {s &&
      s.invitations.active === 0 &&
      s.bids.active === 0 &&
      s.wonTenders === 0 &&
      s.orders.pending === 0 &&
      s.revenue.total === 0 ? (
        <OnboardingChecklist
          steps={[
            {
              key: "profile",
              label: "Firma profilini tamamla",
              done: !!company?.publicEnabled,
              href: "/company/satis/profilim",
            },
            {
              key: "discover",
              label: "Açık ihaleleri keşfet",
              done: false,
              href: "/company/satis/acik-ihaleler",
            },
            {
              key: "bid",
              label: "İlk teklifini ver",
              done: false,
              href: "/company/satis/acik-ihaleler",
            },
          ]}
        />
      ) : null}

      {/* Aksiyon merkezi — "bugün ne yapmalıyım" (Faz 2: veri + sıralama
          backend'de, metin haritası ACTION_ROWS'ta). */}
      <ActionCenter portal="satis" />


      {/* Hata → retry: aksi halde tüm KPI'lar sessizce 0 görünüp yanıltır. */}
      {stats.isError && !s ? (
        <ErrorState
          title="Veri alınamadı"
          onRetry={() => void stats.refetch()}
        />
      ) : null}

      {/* Sekmeler: Teklif / Gelir / Müşteri — segmentli kontrol (düz zemin
          üzerindeki alt-çizgi sekmeler kaybolyordu; aktif = beyaz pill +
          panel rengi, satınalma ile aynı dil). */}
      {/* C46: dönem seçici YALNIZ bu sekmelerin (trend/analitik) verisini
          etkiler — üst KPI kartları dönemsizdir; seçici ilgili bölümün başına
          taşındı (globalmiş gibi görünüp kartları değiştirmiyordu). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="tablist"
        aria-label="Satış panosu bölümleri"
        className="inline-flex w-fit gap-1 rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-950/5"
      >
        {(
          [
            ["teklif", "Teklif"],
            ["gelir", "Gelir"],
            ["musteri", "Müşteri"],
          ] as const
        ).map(([key, label]) => (
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
      ) : loading && !s ? (
        /* Faz 7.3: '—'/'…' karışımı yerine gerçek boyutlu iskelet. */
        <div className="space-y-4" aria-hidden>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200/60" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200/60" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl bg-zinc-200/60" />
        </div>
      ) : (
      <>
      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Vurgu kuralı (Faz 4.4): davet VARLIĞI değil, yanıt BEKLEYEN davet
            vurgular — nedeni alt metinde. */}
        {/* C9: değer ve hint AYNI kaynaktan (analytics.unansweredInvites) —
            önceden değer satisStats'tan geliyordu ve iki tanım çelişebiliyordu
            ("Aktif Davetler: 0" + "1 davet bekliyor"). */}
        <KpiCard
          label="Yanıt Bekleyen Davet"
          value={val(analytics.data?.actions.unansweredInvites)}
          href="/company/satis/acik-ihaleler"
          accent="emerald"
          attention={(analytics.data?.actions.unansweredInvites ?? 0) > 0}
          hint={
            (analytics.data?.actions.unansweredInvites ?? 0) > 0
              ? `${analytics.data!.actions.unansweredInvites} davet teklifinizi bekliyor`
              : undefined
          }
        />
        <KpiCard
          label="Aktif Tekliflerim"
          value={val(s?.bids.active)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          deltaPct={analytics.data?.deltas.bidsSubmitted}
          spark={analytics.data?.kpiSeries.bidsSubmitted}
        />
        <KpiCard
          label="Kazanılan İhale"
          value={val(s?.wonTenders)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          spark={analytics.data?.kpiSeries.won}
        />
        {/* C9: sayım onay/gönderim öncesi siparişleri kapsıyor (PENDING/
            ACCEPTED/CREATED) — "Aktif" adı Siparişler sayfasının daha geniş
            Aktif kümesiyle çelişiyordu. */}
        <KpiCard
          label="Bekleyen Sipariş"
          value={val(s?.orders.pending)}
          href="/company/satis/siparisler"
          accent="emerald"
          deltaPct={analytics.data?.deltas.orders}
          spark={analytics.data?.kpiSeries.orders}
        />
      </div>

      {/* Faz 7.4: "Performans" kartı kaldırıldı — global dönem seçicisiyle
          çelişen "son 30 gün ve toplam" özeti, aralığını AÇIKÇA söyleyen
          KPI kartlarına taşındı (tutar satırı — satınalma ile hizalı). */}
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

      {/* "Son Aktiviteler" akışı anasayfadan KALDIRILDI (kullanıcı isteği,
          2026-08-03) — olay geçmişi bildirim zilinde zaten mevcut. */}
      </>
      )}
    </div>
  );
}
