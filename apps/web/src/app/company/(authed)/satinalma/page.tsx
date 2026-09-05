"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useSatinalmaDashboard } from "@/hooks/use-company-dashboard";
import { ActionStrip } from "@/components/dashboard/action-center";
import { KpiCard } from "@/components/dashboard/analytics-primitives";
import { ProductDiscoverySection } from "@/components/company/product-discovery-section";
import { AiIntentBand } from "@/components/dashboard/ai-intent-band";
import { intentToProductQuery } from "@/lib/company/ai-search";
import { tierAtLeast, type AiSearchIntentResult } from "@rothern/shared";
import { useRouter } from "next/navigation";
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
import { useCompanySearch } from "@/hooks/use-company-directory";
import { buildShowcase } from "@/lib/public/category-showcase";
import { TcmbRatesChip } from "@/components/tcmb-rates-widget";
import { ArrowRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";

const HOME = "/company/satinalma";
const PRODUCT_DETAIL = "/company/satinalma/urunler";

/**
 * SATINALMA ANASAYFASI — Europages kalıbı, Rothern dili (2026-09-05,
 * kullanıcı kararı: "www.rothern.com'daki ilk açıldığı tarzda"; ikinci
 * revizyon aynı gün: "filtreleme her şeyiyle tam, arama şirket/ürün/her
 * türlü").
 *
 * Sıra: arama (öneri: ürün · firma · kategori) → kategoriye göre keşfet
 * (fotoğraflı 8 kart — aynı sayfayı süzer) → ÜRÜNLER (kenar süzgeçli tam
 * dizin, alım kategorisine uygun olanlar önde) → doğrulanmış tedarikçiler
 * (4) → BUGÜN (bekleyen işler şeridi + 4 KPI) → talep aç şeridi → profil
 * sağlığı → Raporlar.
 *
 * "Ürün Ara" ayrı sayfa olmaktan çıktı (308 → buraya); hero'nun altındaki
 * kategori çipleri kalktı (kartlar aynı bilgiyi taşıyor); "Size uygun
 * ürünler" bloğu kalktı (uygunluk listenin varsayılan sırası). Sayfada TEK
 * primary CTA (sol menü). Herkese açık uçlar panelde KULLANILMAZ.
 */
export default function SatinalmaDashboardPage() {
  const { company, user } = useCompanyAuth();
  const ihale = useSatinalmaDashboard();
  const router = useRouter();

  // AI ile ara: yorum → ürün süzgeci (URL) + bant. Silver+ ∧ koltuk rolü
  // (asistanla aynı kapı; API `assertAiAccess` aynasıdır).
  const [intent, setIntent] = useState<AiSearchIntentResult | null>(null);
  const aiEnabled =
    !!company && tierAtLeast(company.tier, "SILVER") &&
    !!user?.roles.some((r) => r === "SATIN_ALMACI" || r === "SATISCI");
  const onAiResult = (r: AiSearchIntentResult) => {
    setIntent(r);
    router.push(`${HOME}${intentToProductQuery(r)}#urunler`);
  };

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
  // Yazarken öneri: ürünler panel keşif ucundan (5), FİRMALAR dizinden (3),
  // kategoriler facet'ten (3) — tek kutu "ürün ya da firma" (Europages).
  const [term, setTerm] = useState("");
  const q = term.trim();
  const sugProducts = useDiscoverProducts({ q, limit: 5 }, q.length >= 2);
  const sugCompanies = useCompanySearch({ q }, q.length >= 2);
  const suggestions: PanelSuggestGroup[] = useMemo(() => {
    if (q.length < 2) return [];
    const lower = q.toLocaleLowerCase("tr-TR");
    const cats = (facets.data?.categories ?? [])
      .filter((c) => c.name.toLocaleLowerCase("tr-TR").includes(lower))
      .slice(0, 3)
      .map((c) => ({ key: c.id, label: c.name, meta: `${c.count} ürün`, href: `${HOME}?kategori=${c.id}#urunler` }));
    const prods = (sugProducts.data ?? []).slice(0, 5).map((p) => ({
      key: `${p.company.slug}/${p.slug}`,
      label: p.name,
      meta: p.company.name,
      href: `${PRODUCT_DETAIL}/${p.company.slug}/${p.slug}`,
    }));
    const firms = (sugCompanies.data?.items ?? [])
      .filter((c) => c.connectionStatus !== "self" && c.rothernId)
      .slice(0, 3)
      .map((c) => ({
        key: c.slug,
        label: c.name,
        meta: [c.city, c.verified ? "Doğrulanmış" : null].filter(Boolean).join(" · ") || undefined,
        href: `/company/firma/${c.rothernId}`,
      }));
    return [
      { label: "Ürünler", rows: prods },
      { label: "Firmalar", rows: firms },
      { label: "Kategoriler", rows: cats },
    ];
  }, [q, facets.data, sugProducts.data, sugCompanies.data]);

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
        lead="Ürün, marka, parça numarası veya firma — doğrulanmış tedarikçilerin vitrininden, fiyat ve minimum sipariş bilgisiyle."
        placeholder="Ürün, marka, parça numarası veya firma arayın"
        action={HOME}
        accent="blue"
        suggestions={suggestions}
        onQueryChange={setTerm}
        ai={{ portal: "satinalma", enabled: aiEnabled, onResult: onAiResult }}
      />

      <CategoryShowcasePanel
        title="Kategoriye göre keşfet"
        lead="En çok ürünü olan dallar önde; tıklayınca aşağıdaki liste o kategoriye süzülür."
        items={showcase}
        hrefFor={(id) => `${HOME}?kategori=${id}#urunler`}
        countNoun="ürün"
        allHref={`${HOME}#urunler`}
        allLabel="Tüm ürünler"
      />

      <ProductDiscoverySection
        banner={intent ? <AiIntentBand intent={intent} onDismiss={() => setIntent(null)} /> : null}
      />

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
      <SellerHealthCards mode="profile" profileHref="/company/sirketim/profil" />

      <Link
        href="/company/sirketim/raporlar"
        className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
      >
        Detaylı analiz ve grafikler Raporlar&apos;da
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
