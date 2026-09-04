import { PublicLayout } from "@/components/marketplace/public-layout";
import { MarketplaceHero } from "@/components/marketplace/hero";
import { TrustStrip } from "@/components/marketplace/trust-strip";
import { CategoryGrid } from "@/components/marketplace/category-grid";
import { TrustBand } from "@/components/marketplace/trust-band";
import { ClosingCta } from "@/components/marketplace/closing-cta";
import { ListingCard } from "@/components/marketplace/listing-card";
import { ProductCard } from "@/components/marketplace/product-card";
import { SectionGrid } from "@/components/marketplace/section-grid";
import { serializeJsonLd } from "@/lib/json-ld";
import { buildShowcase } from "@/lib/public/category-showcase";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
} from "@/lib/public/marketplace";
import {
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
 * PAZAR YERİ ANASAYFASI — sunucu bileşeni, ISR.
 *
 * Bölüm sırası (2026-09-04 revizyonu, ekran görüntülü denetim):
 *   1. header · 2. hero (iki tarafa + sekmeli arama) · 3. güven bandı ·
 *   4. kategoriye göre keşfet · 5. öne çıkan ürünler (≥ 8) ·
 *   6. açık alım talepleri (≥ 3) · 7. satılık ilanlar (≥ 3) ·
 *   8. nasıl çalışır · 9. kapanış CTA · 10. footer.
 *
 * Eşik altındaki envanter bölümü HİÇ çizilmez — boş kutu yok. Her zaman
 * dolu olan bölümler (3, 4, 8, 9) sayfayı sıfır envanterde de ayakta tutar.
 * Kayıt CTA'sı üç: header, hero altı, kapanış.
 *
 * `force-dynamic` YOK — bu rota public listede (bkz. lib/public-routes.ts) ve
 * nonce'suz CSP alıyor; statik/ISR üretilebilmesi SEO'nun ön koşulu.
 */
export const revalidate = 60;

const SITE = resolveSiteUrl();

/** Eşikler — tek kart öksüz kalır, boş bölüm "boş market" der. */
const MIN_PRODUCTS = 8;
const MIN_LISTINGS = 3;

const LIVE_METADATA: Metadata = {
  title: "Rothern — B2B pazar yeri: ürünler, alım talepleri ve satılık ilanlar",
  description:
    "Doğrulanmış firmaların ürünlerini, açık alım taleplerini ve satılık ilanlarını inceleyin. Kapalı zarf teklif, sipariş takibi ve firma keşfi tek hesapta. Kaydolmak ücretsiz.",
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    title: "Rothern — B2B pazar yeri",
    description:
      "Ürünler, açık alım talepleri, satılık ilanlar ve doğrulanmış firmalar tek yerde.",
    url: `${SITE}/`,
    type: "website",
  },
};

export const metadata: Metadata = MARKETPLACE_LIVE
  ? LIVE_METADATA
  : {
      title: "Çok Yakında",
      description:
        "Rothern şu anda geliştirme aşamasında. En yakın zamanda sizlerleyiz.",
      robots: { index: false, follow: false },
    };

export default async function HomePage() {
  // Anahtar kapalıyken API'ye HİÇ gitmiyoruz: "yakında" sayfası veri
  // istemiyor ve boşuna istek atmak build'i API'ye bağımlı yapardı.
  if (!MARKETPLACE_LIVE) return <ComingSoon />;

  // Beş çağrı paralel: biri düşerse diğerleri sayfayı taşımaya devam eder
  // (veri katmanı hata YUTAR ve boş döner — bkz. marketplace-api.ts).
  // `categories/segments` anahtara tabi DEĞİL: kategori ızgarası API'de
  // MARKETPLACE_LIVE kapalıyken bile dolu çıkar.
  const [demands, offers, products, productFacets, segments] = await Promise.all([
    fetchListings({ type: "ALIM", page: 1 }),
    fetchListings({ type: "SATIS", page: 1 }),
    fetchProducts({ page: 1 }),
    fetchProductFacets(),
    fetchSegments(),
  ]);

  const showcase = buildShowcase({
    segments: segments.map((s) => ({ id: s.id, name: s.nameTr })),
    counts: productFacets.categories.map((c) => ({ id: c.id, count: c.count })),
    productCovers: products.items.map((p) => ({
      categoryId: p.categoryId,
      image: p.images[0],
    })),
  });

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
        // Varsayılan arama sekmesi ÜRÜNLER — SearchAction da oraya gider.
        urlTemplate: `${SITE}${MARKETPLACE_ROUTES.products}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <MarketplaceHero />
      <TrustStrip />
      <CategoryGrid categories={showcase} />

      <SectionGrid
        heading="Öne çıkan ürünler"
        lead="Firmaların vitrinlerindeki ürünler — süreli bir ilan değil, kalıcı katalog."
        href={MARKETPLACE_ROUTES.products}
        hrefLabel="Tüm ürünler"
        min={MIN_PRODUCTS}
        cards={products.items.slice(0, 8).map((p) => (
          <ProductCard
            key={`${p.company.slug}/${p.slug}`}
            companySlug={p.company.slug}
            companyName={p.company.name}
            companyCity={p.company.city}
            product={p}
          />
        ))}
      />

      <SectionGrid
        heading={`Açık ${MARKETPLACE_LABELS.demands.toLocaleLowerCase("tr-TR")}`}
        lead="Firmaların herkese açık yayımladığı, teklif bekleyen satın alma talepleri."
        href={MARKETPLACE_ROUTES.demands}
        hrefLabel="Tüm talepler"
        min={MIN_LISTINGS}
        cards={demands.items.slice(0, 8).map((l) => (
          <ListingCard key={l.number} listing={l} />
        ))}
      />

      <SectionGrid
        heading={MARKETPLACE_LABELS.offers}
        lead="Firmaların satışa açtığı ürün, malzeme ve hizmetler."
        href={MARKETPLACE_ROUTES.offers}
        hrefLabel="Tüm ilanlar"
        min={MIN_LISTINGS}
        cards={offers.items.slice(0, 8).map((l) => (
          <ListingCard key={l.number} listing={l} />
        ))}
      />

      <TrustBand />
      <ClosingCta />
    </PublicLayout>
  );
}
