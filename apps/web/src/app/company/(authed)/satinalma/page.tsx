"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSatinalmaDashboard } from "@/hooks/use-company-dashboard";
import { ActionStrip } from "@/components/dashboard/action-center";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { PortalDiscovery } from "@/components/dashboard/portal-discovery";
import { PanelHeroSearch, type PanelSuggestGroup } from "@/components/dashboard/panel-hero-search";
import { CategoryShowcasePanel } from "@/components/dashboard/category-showcase-panel";
import { FeaturedCompaniesBlock } from "@/components/dashboard/featured-companies-block";
import { TodayBand } from "@/components/dashboard/today-band";
import { CtaBand } from "@/components/dashboard/cta-band";
import { SellerHealthCards } from "@/components/dashboard/seller-health-cards";
import {
  useCategorySegments,
  useDiscoverProductFacets,
  useDiscoverProducts,
} from "@/hooks/use-portal-discovery";
import { buildShowcase } from "@/lib/public/category-showcase";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";

const PRODUCTS = "/company/satinalma/urunler";

/**
 * SATINALMA ANASAYFASI — Europages kalıbı, Rothern dili (2026-09-05,
 * kullanıcı kararı: "www.rothern.com'daki ilk açıldığı tarzda").
 *
 * Sıra: arama (öneriyle) → kategoriye göre keşfet (fotoğraflı 8 kart) →
 * size uygun ürünler (4) → doğrulanmış tedarikçiler (4) → BUGÜN (bekleyen
 * işler şeridi + 4 KPI) → talep aç şeridi → profil sağlığı → Raporlar.
 *
 * "Başlangıç" listesi KALDIRILDI (kullanıcı kararı). Sayfada TEK primary CTA
 * (sol menü "Satın Alma Talebi Aç"); şerit ikincil stil. Herkese açık uçlar
 * panelde KULLANILMAZ: arama/öneri/kategori sayıları panelin kendi uçları.
 */
export default function SatinalmaDashboardPage() {
  const { company } = useCompanyAuth();
  const ihale = useSatinalmaDashboard();

  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

  // Kategori vitrini + çipler: ürün dizini facet'i (L1 sayaçları) + 58 segment.
  const facets = useDiscoverProductFacets();
  const segments = useCategorySegments();
  const showcase = useMemo(
    () =>
      buildShowcase({
        segments: (segments.data ?? []).map((s) => ({ id: s.id, name: s.nameTr })),
        counts: (facets.data?.categories ?? []).map((c) => ({ id: c.id, count: c.count })),
        productCovers: [],
        limit: 8,
      }),
    [segments.data, facets.data],
  );
  const chips = (facets.data?.categories ?? [])
    .filter((c) => c.count > 0)
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, count: c.count, href: `${PRODUCTS}?kategori=${c.id}` }));

  // Yazarken öneri: ürünler panel keşif ucundan (5), kategoriler facet'ten (3).
  const [term, setTerm] = useState("");
  const q = term.trim();
  const sugProducts = useDiscoverProducts({ q, limit: 5 }, q.length >= 2);
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    if (q.length < 2) return [];
    const lower = q.toLocaleLowerCase("tr-TR");
    const cats = (facets.data?.categories ?? [])
      .filter((c) => c.name.toLocaleLowerCase("tr-TR").includes(lower))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: `${c.count} ürün`, href: `${PRODUCTS}?kategori=${c.id}` }));
    const prods = (sugProducts.data ?? []).slice(0, 5).map((p) => ({
      key: `${p.company.slug}/${p.slug}`,
      label: p.name,
      meta: p.company.name,
      href: `${PRODUCTS}/${p.company.slug}/${p.slug}`,
    }));
    return [
      { label: "Ürünler", rows: prods },
      { label: "Kategoriler", rows: cats },
    ];
  }, [q, facets.data, sugProducts.data]);

  return (
    <div className="space-y-10">
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
        <div className="flex flex-wrap items-center gap-3">
          <TcmbRatesChip />
        </div>
      </header>

      <PanelHeroSearch
        eyebrow="Tedarikçi ürün vitrini"
        title="Ne arıyorsunuz?"
        lead="Ürün, marka veya parça numarası — doğrulanmış tedarikçilerin vitrininden, fiyat ve minimum sipariş bilgisiyle."
        placeholder="Ürün, marka veya parça numarası arayın"
        action={PRODUCTS}
        chips={chips}
        chipsLabel="Popüler kategoriler"
        accent="blue"
        suggestions={suggestions}
        onQueryChange={setTerm}
      />

      <CategoryShowcasePanel
        title="Kategoriye göre keşfet"
        lead="En çok ürünü olan dallar önde; tıklayınca süzgeçli sonuçlar."
        items={showcase}
        hrefFor={(id) => `${PRODUCTS}?kategori=${id}`}
        countNoun="ürün"
        allHref={PRODUCTS}
        allLabel="Tüm ürünler"
      />

      <PortalDiscovery />

      <FeaturedCompaniesBlock />

      <TodayBand lead="Bekleyen işleriniz ve dönemsiz dört sayı.">
        <ActionStrip portal="satinalma" />
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
      </TodayBand>

      <CtaBand
        icon={<ClipboardList aria-hidden className="size-5" strokeWidth={1.75} />}
        title="Aradığınızı bulamadınız mı?"
        body="Satın alma talebi açın; kategorinizdeki tedarikçiler kapalı zarfta teklif versin, siz tek tabloda karşılaştırın."
        cta={{ label: "Talep aç", href: "/company/satinalma/taleplerim/yeni" }}
        tone="secondary"
      />

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
