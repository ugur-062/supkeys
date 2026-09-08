import { AudienceOnly, AudienceProvider } from "@/components/marketplace/audience-switch";
import { PublicLayout } from "@/components/marketplace/public-layout";
import { HomeHero } from "@/components/marketplace/home-hero";
import { HomeBuyer } from "@/components/marketplace/home-buyer";
import { HomeSupplier } from "@/components/marketplace/home-supplier";
import { serializeJsonLd } from "@/lib/json-ld";
import { buildShowcase } from "@/lib/public/category-showcase";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import {
  fetchFeaturedProducts,
  fetchListings,
  fetchProductFacets,
  fetchProducts,
  fetchSegments,
} from "@/lib/public/marketplace-api";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/marketplace/coming-soon";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";

/**
 * ANASAYFA — PANEL ANASAYFALARININ HERKESE AÇIK HÂLİ (2026-09-08, kullanıcı
 * kararı: "satınalma ve satış anasayfalarını www.rothern.com anasayfasına
 * taşı, seçime göre o ekranlar gelsin, renkleriyle birlikte").
 *
 * Ziyaretçi üstteki anahtarla tarafını seçer; sayfa o portalın panel
 * anasayfasını, o portalın rengiyle gösterir:
 *
 *   ALICI (mavi)      hero → öne çıkan ürünler → kategori vitrini → yeni eklenenler
 *   TEDARİKÇİ (yeşil) hero → açık alım talepleri → "ürününüz vitrinde mi?"
 *
 * PANEL SAYFALARINA DOKUNULMADI (kullanıcı sınırı): `PanelHeroSearch` ve
 * `CategoryShowcaseRows` değiştirilmeden kullanılıyor — ikisi de tümüyle
 * prop'la sürülüyor. Panelin tavsiye şeridi ve satış talep listesi
 * anonimde hesaplanamayan girdilere dayandığı için herkese açık
 * karşılıkları yazıldı (gerekçeler `home-buyer` / `home-supplier`de).
 *
 * MONOKROM KURALININ İSTİSNASI: `CLAUDE.md` "herkese açık pazar yeri
 * monokrom kalır, portal renkleri yalnız panelde yaşar" der. Kullanıcı bu
 * sayfa için renklerin de taşınmasını istedi. İstisna YALNIZ `/` içindir —
 * `/urunler`, `/firmalar`, `/alim-talepleri`, ürün ve firma sayfaları siyah
 * kalır.
 *
 * KALKAN BLOKLAR: sayı şeridi, nasıl çalışır, sekmeli ürün kaydırıcısı, iki
 * kart, firma ızgarası, güven bandı, popüler çipler, yüzen CTA. Bileşenler
 * SİLİNMEDİ (`/nasil-calisir` ve liste sayfaları kullanıyor). JSON-LD ve
 * alttaki SEO paragrafı KALDI: ikisi de arama görünürlüğünü taşıyor.
 *
 * `force-dynamic` YOK — public liste, nonce'suz CSP, ISR.
 */
export const revalidate = 60;

const SITE = resolveSiteUrl();

const LIVE_METADATA: Metadata = {
  title: "Rothern — B2B pazar yeri: ürünler, tedarikçiler ve alım talepleri",
  description:
    "Doğrulanmış tedarikçilerin ürünlerini fiyat ve MOQ ile inceleyin, firmalarla konuşun, alım taleplerine kapalı zarf teklif verin. Alıcı ve satıcı tek hesapta. Kaydolmak ücretsiz.",
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    title: "Rothern — B2B pazar yeri",
    description: "Ürünler, doğrulanmış firmalar ve açık alım talepleri tek yerde.",
    url: `${SITE}/`,
    type: "website",
  },
};

export const metadata: Metadata = MARKETPLACE_LIVE
  ? LIVE_METADATA
  : {
      title: "Çok Yakında",
      description: "Rothern şu anda geliştirme aşamasında. En yakın zamanda sizlerleyiz.",
      robots: { index: false, follow: false },
    };

export default async function HomePage() {
  if (!MARKETPLACE_LIVE) return <ComingSoon />;

  // Paralel; biri düşerse diğerleri sayfayı taşır (veri katmanı hata yutar).
  const [featured, newest, productFacets, segments, demands] = await Promise.all([
    fetchFeaturedProducts(),
    fetchProducts({ sort: "newest", page: 1 }),
    fetchProductFacets(),
    fetchSegments(),
    fetchListings({ type: "ALIM", page: 1 }),
  ]);

  const showcase = buildShowcase({
    segments: segments.map((s) => ({ id: s.id, name: s.nameTr })),
    counts: productFacets.categories.map((c) => ({ id: c.id, count: c.count })),
    productCovers: [...featured, ...newest.items].map((p) => ({
      categoryId: p.categoryId,
      image: p.images[0],
    })),
    // TÜM ana kategoriler (58 segment) — panel vitriniyle aynı kural.
    limit: 100,
  });

  // "Yeni eklenen" şeridi öne çıkanları tekrar etmesin: skorlar eşitken iki
  // liste birebir çakışıyordu.
  const featuredKeys = new Set(featured.map((p) => `${p.company.slug}/${p.slug}`));
  const newestOnly = newest.items.filter((p) => !featuredKeys.has(`${p.company.slug}/${p.slug}`));

  // Yakında kapanacaklar önce — aciliyet cezbeder.
  const demandCards = [...demands.items]
    .sort(
      (a, b) =>
        (a.closesAt ? new Date(a.closesAt).getTime() : Infinity) -
        (b.closesAt ? new Date(b.closesAt).getTime() : Infinity),
    )
    .slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Rothern",
    url: `${SITE}/`,
    inLanguage: "tr-TR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE}${MARKETPLACE_ROUTES.products}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <PublicLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />

      <AudienceProvider>
        <HomeHero />

        {/* İki yüzün GÖVDESİ de HTML'de durur (arama motoru ikisini de görür);
            görünmeyen taraf `hidden` ile ölçüm ve etkileşim dışı kalır. Yalnız
            hero tek basılır — iki arka plan fotoğrafı birden inmesin diye. */}
        <AudienceOnly side="buyer">
          <HomeBuyer featured={featured} newest={newestOnly} showcase={showcase} />
        </AudienceOnly>

        <AudienceOnly side="supplier">
          <HomeSupplier demands={demandCards} total={demands.total} />
        </AudienceOnly>

        {/* SEO paragrafı — iki cümle, sayfanın ne olduğunu düz metinle söyler. */}
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <p className="max-w-3xl text-sm/6 text-zinc-500">
            Rothern, Türkiye&apos;deki üretici, distribütör ve hizmet sağlayıcı firmaların ürünlerini fiyat
            ve minimum sipariş bilgisiyle listeleyen, alım taleplerini kapalı zarf teklifle buluşturan
            B2B pazar yeridir. Ürün ve firma profilleri herkese açıktır; teklif vermek, bilgi istemek ve
            alıcı bilgilerini görmek için ücretsiz hesap gerekir.
          </p>
        </section>
      </AudienceProvider>
    </PublicLayout>
  );
}
