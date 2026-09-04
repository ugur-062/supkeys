"use client";

import { ActionStrip } from "@/components/dashboard/action-center";
import { MatchedRequestsWidget } from "@/components/dashboard/matched-requests-widget";
import { SellerHealthCards } from "@/components/dashboard/seller-health-cards";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { useCatalogCounts } from "@/hooks/use-company-items";
import { useMyBids } from "@/hooks/use-company-listings";
import { useOrders } from "@/hooks/use-company-orders";
import {
  selectActiveOffers,
  selectActiveOrders,
  selectWonOffers,
} from "@/lib/company/kpi-selectors";

import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSatisStats } from "@/hooks/use-company-dashboard";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useEffect, useState } from "react";

/**
 * Satış panosu — ÖZET sayfa (2026-09-03 revizyonu). Sıra yukarıdan aşağı:
 *   1. başlık (firma, tarih, kur çipi)
 *   2. bekleyen işler şeridi — tip başına çip, her biri kendi sayfasına
 *   3. 4 dönemsiz KPI — kart tıklanır, delta rozeti "geçen aya göre"
 *   4. size uygun açık talepler — en fazla 3, tek çıkış
 *   5. profil & katalog sağlığı — eşleşme kalitesinin girdileri
 * Panoda liste/arama/süzgeç YOK; her blok tek "tümünü gör" ile alt sayfaya
 * gider. ("Son Aktiviteler" akışı kullanıcı isteğiyle kaldırıldı,
 * 2026-08-03; satış raporları satış ilanı özelliğiyle birlikte kaldırıldı,
 * 2026-09-04.) Görsel dil: zinc/Catalyst.
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
  // Dönem seçici GRAFİKLERLE BİRLİKTE Raporlar'a gitti; panodaki 4 sayı
  // dönemsizdir ("bugün ne durumdayım"). Analitikten yalnız delta/spark ve
  // yanıtsız davet sayısı okunur — varsayılan dönemle.
  const analytics = useSatisAnalytics({ period: "month" });
  // Başlangıç listesi girdileri: profil bayrağı + ürün sayacı (sunucu).
  const catalog = useCatalogCounts();
  const onboarding = [
    {
      key: "profile",
      label: "Profili tamamla",
      done: !!company?.publicEnabled,
      href: "/company/satis/profilim",
    },
    {
      key: "product",
      label: "İlk ürünü ekle",
      done: (catalog.data ? catalog.data.published + catalog.data.draft : 0) > 0,
      href: "/company/satis/urunlerim",
    },
  ];
  const onboardingReady = !!catalog.data;
  // KPI'lar liste sayfalarıyla AYNI seçiciden (kpi-selectors): sunucu sayımı
  // ilan tipini süzmüyordu — satın alma tarafında verilen teklifler satış
  // panosuna sayılıyor, sipariş kutusu listenin "Aktif" kümesinden farklı bir
  // statü kümesi kullanıyordu (4 ↔ 2, 4 ↔ 3, 0 ↔ 1).
  const bids = useMyBids();
  const orders = useOrders();
  const activeOffers = bids.data ? selectActiveOffers(bids.data).length : undefined;
  const wonOffers = bids.data ? selectWonOffers(bids.data).length : undefined;
  const activeOrders = orders.data
    ? selectActiveOrders(orders.data, "seller").length
    : undefined;
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
        {/* Başlıkta CTA yok — sayfa başına tek primary (sol menü). Kur
            çipi kalır. */}
        <TcmbRatesChip />
      </header>

      {/* Başlangıç listesi (v2 3a — satınalmayla aynı bileşen): Profili
          tamamla · İlk ürünü ekle. Adımlar GERÇEK veriden işaretlenir; hepsi
          bitince kendiliğinden kaybolur. */}
      {onboardingReady && onboarding.some((st) => !st.done) ? (
        <OnboardingChecklist steps={onboarding} />
      ) : null}

      {/* Bekleyen işler ÖNCE: "bugün ne yapmalıyım" — tip başına çip (davet,
          süresi dolan teklif, bilgi talebi, onay bekleyen sipariş…), her çip
          kendi sayfasına. Hiç iş yoksa şerit çizilmez. */}
      <ActionStrip portal="satis" />

      {/* Hata → retry: aksi halde tüm KPI'lar sessizce 0 görünüp yanıltır. */}
      {stats.isError && !s ? (
        <ErrorState
          title="Veri alınamadı"
          onRetry={() => void stats.refetch()}
        />
      ) : null}

      {/* GRAFİKLER RAPORLAR'A TAŞINDI (2026-09-03): aynı veri hem panoda hem
          Raporlar hub'ında çiziliyordu (çift bakım) ve anasayfayı pazar yeri
          olmaktan çıkarıyordu. Panoda dönemsiz 4 sayı kalır; dönem seçici de
          grafiklerle birlikte gitti — burada seçilecek bir dönem kalmadı. */}
      {loading && !s ? (
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
          href="/company/satis/acik-talepler"
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
          value={val(activeOffers)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          hint="Karar bekleyen teklifleriniz"
          deltaPct={analytics.data?.deltas.bidsSubmitted}
          deltaPeriodLabel="Geçen aya göre"
          spark={analytics.data?.kpiSeries.bidsSubmitted}
        />
        <KpiCard
          label="Kazandığım İşler"
          value={val(wonOffers)}
          href="/company/satis/tekliflerim?status=WON"
          accent="emerald"
          hint="Kısmi kazanım dahil"
          spark={analytics.data?.kpiSeries.won}
        />
        {/* Satışlarım "Aktif" kutusuyla AYNI küme (PENDING…DELIVERED) —
            eski "Bekleyen Sipariş" yalnız onay öncesini sayıyor, liste 1
            derken pano 0 gösteriyordu. */}
        <KpiCard
          label="Aktif Sipariş"
          value={val(activeOrders)}
          href="/company/satis/siparisler"
          accent="emerald"
          deltaPct={analytics.data?.deltas.orders}
          deltaPeriodLabel="Geçen aya göre"
          spark={analytics.data?.kpiSeries.orders}
        />
      </div>

      {/* "Anasayfa özet, alt sayfa liste": arama kutusu ve süzgeç Açık
          Talepler'de; burada yalnız en uygun 3 talep + tek çıkış bağlantısı.
          Eski keşif kartı o sayfanın kopyasıydı (aynı arama, aynı boş durum). */}
      <MatchedRequestsWidget />

      {/* Eşleşme kalitesinin girdileri: profil tamlığı + ürün kategorileri.
          Yüzde Profilim'le AYNI fonksiyondan; sayaçlar sunucudan. */}
      <SellerHealthCards />

      {/* "Son Aktiviteler" akışı anasayfadan KALDIRILDI (kullanıcı isteği,
          2026-08-03) — olay geçmişi bildirim zilinde zaten mevcut. */}
      </>
      )}
    </div>
  );
}
