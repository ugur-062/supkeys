"use client";

import { ActionStrip } from "@/components/dashboard/action-center";
import { PortalDiscovery } from "@/components/dashboard/portal-discovery";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";

import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSatisStats } from "@/hooks/use-company-dashboard";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
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
  // Dönem seçici GRAFİKLERLE BİRLİKTE Raporlar'a gitti; panodaki 4 sayı
  // dönemsizdir ("bugün ne durumdayım"). Analitikten yalnız delta/spark ve
  // yanıtsız davet sayısı okunur — varsayılan dönemle.
  const analytics = useSatisAnalytics({ period: "month" });
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
        {/* CTA keşif bloğunda ("İlan aç") — başlıkta ikinci bir çağrı
            tutmak aynı işi iki yerde tekrarlıyordu. Kur çipi kalır. */}
        <TcmbRatesChip />
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
              label: "Açık satın alma taleplerini keşfet",
              done: false,
              href: "/company/satis/acik-talepler",
            },
            {
              key: "bid",
              label: "İlk teklifini ver",
              done: false,
              href: "/company/satis/acik-talepler",
            },
          ]}
        />
      ) : null}

      {/* PAZAR YERİ ÖNCE (2026-09-03 kullanıcı kararı): anasayfanın ilk
          ekranı "piyasada ne var" olmalı. Bekleyen işler kaybolmuyor, hemen
          altta TEK SATIR şeride iniyor. */}
      <PortalDiscovery portal="satis" />

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
          value={val(s?.bids.active)}
          href="/company/satis/tekliflerim"
          accent="emerald"
          deltaPct={analytics.data?.deltas.bidsSubmitted}
          spark={analytics.data?.kpiSeries.bidsSubmitted}
        />
        <KpiCard
          label="Kazandığım İşler"
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

      {/* Tutar/30-gün kartları da Raporlar'a taşındı — dönemsel okuma orada,
          "bugün ne durumdayım" burada. */}
      <p className="text-sm text-zinc-500">
        Detaylı analiz ve grafikler{" "}
        <Link
          href="/company/satis/raporlar"
          className="font-semibold text-zinc-900 underline underline-offset-4 hover:text-zinc-600"
        >
          Raporlar
        </Link>{" "}
        bölümünde.
      </p>

      {/* "Son Aktiviteler" akışı anasayfadan KALDIRILDI (kullanıcı isteği,
          2026-08-03) — olay geçmişi bildirim zilinde zaten mevcut. */}
      </>
      )}
    </div>
  );
}
