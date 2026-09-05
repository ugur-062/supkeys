"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSatinalmaAnalytics,
  useSatinalmaDashboard,
} from "@/hooks/use-company-dashboard";
import { ActionStrip } from "@/components/dashboard/action-center";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import Link from "next/link";
import { PortalDiscovery } from "@/components/dashboard/portal-discovery";
import { PanelHeroSearch } from "@/components/dashboard/panel-hero-search";
import { useDiscoverProductFacets } from "@/hooks/use-portal-discovery";
import { SellerHealthCards } from "@/components/dashboard/seller-health-cards";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { ArrowRight } from "lucide-react";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useEffect, useState } from "react";

export default function SatinalmaDashboardPage() {
  const { company } = useCompanyAuth();
  // Dönem seçici GRAFİKLERLE BİRLİKTE Raporlar'a gitti; panodaki 4 sayı
  // dönemsizdir. Analitik yalnız "her şey boş mu" kontrolü için okunur.
  const ihale = useSatinalmaDashboard();
  const analytics = useSatinalmaAnalytics({ period: "month" });
  // Arama kutusunun altındaki çipler: en çok ürünü olan üst kategoriler
  // (ürün dizininin facet'i — aynı sayaç süzgeçte de görünür).
  const facets = useDiscoverProductFacets();
  const chips = (facets.data?.categories ?? [])
    .filter((c) => c.count > 0)
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, count: c.count, href: `/company/satinalma/urunler?kategori=${c.id}` }));

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
                <span className="mx-2 text-zinc-300">{" · "}</span>
                <span>{todayLabel}</span>
              </>
            ) : null}
          </p>
        </div>
        {/* Kur çipi başlıkta — büyük TCMB kartı ve zaman-tasarrufu şeridi
            anasayfadan kalktı (şerit → raporlar hub'ı). */}
        <div className="flex flex-wrap items-center gap-3">
          <TcmbRatesChip />
        </div>
      </header>

      {/* PAZAR YERİ ÖNDE (2026-09-05, kullanıcı kararı): herkese açık
          anasayfadaki gibi büyük arama kutusu ilk ekranda. "Ürün Ara" sol
          menüden kalktı — giriş noktası bu kutu; sonuç sayfası
          /satinalma/urunler (süzgeçli) aynen duruyor. */}
      <PanelHeroSearch
        title="Ne arıyorsunuz?"
        lead="Ürün, marka veya parça numarası — doğrulanmış tedarikçilerin vitrininden."
        placeholder="Ürün, marka veya parça numarası arayın"
        action="/company/satinalma/urunler"
        chips={chips}
        chipsLabel="Popüler kategoriler"
        accent="blue"
      />

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
              label: "İlk satın alma talebinizi oluşturun",
              done: false,
              href: "/company/satinalma/taleplerim/yeni",
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

      {/* Sıra (2026-09-05): arama → "size uygun" seçkisi → bekleyen işler
          şeridi → 4 KPI → profil sağlığı → Raporlar. Pazar yeri hissi ilk
          ekranda; "bugün ne yapmalıyım" hemen altında. */}
      <PortalDiscovery />

      <ActionStrip portal="satinalma" />

      {/* DÖNEMSİZ 4 SAYI — "bugün ne durumdayım". Grafikler ve dönem
          seçici RAPORLAR'a taşındı (2026-09-03): aynı veri hem panoda hem
          Raporlar hub'ında çiziliyordu ve anasayfayı pazar yeri olmaktan
          çıkarıyordu. */}
      {ihale.data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Açık Taleplerim"
            value={ihale.data.openCount}
            href="/company/satinalma/taleplerim?status=OPEN"
            accent="blue"
          />
          <KpiCard
            label="Gelen Teklifler"
            value={ihale.data.bidsReceived}
            href="/company/satinalma/taleplerim?status=IN_AWARD"
            accent="blue"
          />
          <KpiCard
            label="Kazandırılan Talepler"
            value={ihale.data.awarded}
            href="/company/satinalma/taleplerim?status=AWARDED"
            accent="blue"
          />
          <KpiCard
            label="Devam Eden Siparişler"
            value={ihale.data.ongoingOrders}
            href="/company/satinalma/siparisler"
            accent="blue"
          />
        </div>
      ) : ihale.isError ? (
        <ErrorState title="Veri alınamadı" onRetry={() => void ihale.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200/60" />
          ))}
        </div>
      )}

      {/* Eşleşme kalitesinin girdisi: profil tamlığı (yüzde Profilim'le aynı
          fonksiyondan). Katalog kartı alıcıda yok. */}
      <SellerHealthCards mode="profile" profileHref="/company/satinalma/profilim" />

      <Link
        href="/company/satinalma/raporlar"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
      >
        Detaylı analiz ve grafikler Raporlar&apos;da
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
