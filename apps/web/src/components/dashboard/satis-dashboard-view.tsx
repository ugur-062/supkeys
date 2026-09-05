"use client";

import { ActionStrip } from "@/components/dashboard/action-center";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CategoryShowcasePanel } from "@/components/dashboard/category-showcase-panel";
import { BuyersBlock } from "@/components/dashboard/buyers-block";
import { CtaBand } from "@/components/dashboard/cta-band";
import { TodayBand } from "@/components/dashboard/today-band";
import { useCategorySegments, useDiscoverFacets } from "@/hooks/use-portal-discovery";
import { useSellerTenders } from "@/hooks/use-seller-tenders";
import { buildShowcase } from "@/lib/public/category-showcase";
import { MatchedRequestsWidget } from "@/components/dashboard/matched-requests-widget";
import { SellerHealthCards } from "@/components/dashboard/seller-health-cards";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { useSatisAnalytics } from "@/hooks/use-company-dashboard";
import { PackagePlus } from "lucide-react";
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
import { useEffect, useMemo, useState } from "react";

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
  // Sektör vitrini + çipler: açık taleplerin segment sayaçları (discover-facets,
  // `seller-tenders` ile AYNI görünürlük) + 58 segment doldurma listesi.
  const facets = useDiscoverFacets();
  const segments = useCategorySegments();
  const showcase = useMemo(
    () =>
      buildShowcase({
        segments: (segments.data ?? []).map((sg) => ({ id: sg.id, name: sg.nameTr })),
        counts: (facets.data?.segments ?? []).map((c) => ({ id: c.id, count: c.count })),
        productCovers: [],
        limit: 8,
      }),
    [segments.data, facets.data],
  );
  const chips = (facets.data?.segments ?? [])
    .filter((c) => c.count > 0)
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, count: c.count, href: `/company/satis/acik-talepler?kategori=${c.id}` }));

  // Yazarken öneri: açık talepler (başlık/no/alıcı) + sektörler — liste zaten
  // çekili (`seller-tenders`), ayrı uç yok.
  const tenders = useSellerTenders();
  const [term, setTerm] = useState("");
  const q = term.trim();
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    if (q.length < 2) return [];
    const lower = q.toLocaleLowerCase("tr-TR");
    const hit = (t: string) => t.toLocaleLowerCase("tr-TR").includes(lower);
    const rows = (tenders.data ?? [])
      .filter((t) => t.status === "OPEN" && (hit(t.title) || hit(t.number ?? "") || hit(t.owner?.name ?? "")))
      .slice(0, 5)
      .map((t) => ({ key: t.id, label: t.title, meta: t.owner?.name ?? undefined, href: `/company/ilan/${t.id}` }));
    const secs = (facets.data?.segments ?? [])
      .filter((c) => c.count > 0 && hit(c.name))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: `${c.count} açık talep`, href: `/company/satis/acik-talepler?kategori=${c.id}` }));
    return [
      { label: "Açık talepler", rows },
      { label: "Sektörler", rows: secs },
    ];
  }, [q, tenders.data, facets.data]);

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
    <div className="space-y-10">
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

      {/* PAZAR YERİ ÖNDE (2026-09-05, kullanıcı kararı — satınalmayla aynı
          düzen): arama (öneriyle) → talep olan sektörler (fotoğraflı 8 kart) →
          size uygun açık talepler → talep açan alıcılar → BUGÜN → ürün ekle
          şeridi → katalog/profil sağlığı. "Başlangıç" listesi KALDIRILDI. */}
      <PanelHeroSearch
        eyebrow="Açık satın alma talepleri"
        title="Hangi talebe teklif vereceksiniz?"
        lead="Kategorinize uygun açık talepler — kapalı zarf, birbirini görmeyen teklifler; kazandırma tek tabloda."
        placeholder="Ürün, kalem, talep numarası veya alıcı arayın"
        action="/company/satis/acik-talepler"
        chips={chips}
        chipsLabel="Talep olan sektörler"
        accent="emerald"
        suggestions={suggestions}
        onQueryChange={setTerm}
      />

      <CategoryShowcasePanel
        title="Talep olan sektörler"
        lead="Açık talebi olan dallar önde; tıklayınca o sektörün talepleri."
        items={showcase}
        hrefFor={(id) => `/company/satis/acik-talepler?kategori=${id}`}
        countNoun="açık talep"
        allHref="/company/satis/acik-talepler"
        allLabel="Tüm açık talepler"
      />

      <MatchedRequestsWidget />

      <BuyersBlock />

      <TodayBand lead="Bekleyen işleriniz ve dönemsiz dört sayı.">
        <ActionStrip portal="satis" />

        {/* Hata → retry: aksi halde tüm KPI'lar sessizce 0 görünüp yanıltır. */}
        {stats.isError && !s ? (
          <ErrorState title="Veri alınamadı" onRetry={() => void stats.refetch()} />
        ) : null}

        {/* GRAFİKLER RAPORLAR'DA (2026-09-03); panoda dönemsiz 4 sayı. */}
        {loading && !s ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200/60" />
            ))}
          </div>
        ) : (
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
        )}
      </TodayBand>

      <CtaBand
        icon={<PackagePlus aria-hidden className="size-5" strokeWidth={1.75} />}
        title="Ürününüz vitrinde mi?"
        body="Ürünlerinizi fiyat ve minimum sipariş bilgisiyle yayımlayın; alıcılar bulsun, bilgi talebi göndersin."
        cta={{ label: "Ürün ekle", href: "/company/satis/urunlerim?yeni=1" }}
        tone="primary"
      />

      {/* Eşleşme kalitesinin girdileri: profil tamlığı + ürün kategorileri.
          Yüzde Profilim'le AYNI fonksiyondan; sayaçlar sunucudan. */}
      <SellerHealthCards />
    </div>
  );
}
