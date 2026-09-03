import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketplaceFooter } from "@/components/marketplace/marketplace-footer";
import { MarketplaceHero } from "@/components/marketplace/hero";
import { TrustBand } from "@/components/marketplace/trust-band";
import { ListingCard } from "@/components/marketplace/listing-card";
import { ProductCard } from "@/components/marketplace/product-card";
import { SectionGrid } from "@/components/marketplace/section-grid";
import { SectorGrid } from "@/components/marketplace/sector-grid";
import { serializeJsonLd } from "@/lib/json-ld";
import {
  MARKETPLACE_LABELS,
  MARKETPLACE_ROUTES,
} from "@/lib/public/marketplace";
import {
  fetchFacets,
  fetchListings,
  fetchProducts,
} from "@/lib/public/marketplace-api";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/marketplace/coming-soon";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";

/**
 * PAZAR YERİ ANASAYFASI — sunucu bileşeni, ISR.
 *
 * Eski pazarlama anasayfası `/nasil-calisir`e taşındı (içerik aynen duruyor).
 * Gerekçe: pazar yeri anasayfası ÜRÜNÜ değil ENVANTERİ göstermeli — ziyaretçi
 * "burada ne var" sorusuna ilk ekranda yanıt almalı, ürün anlatısı bir tık
 * ötede durabilir. Arama motoru tarafında da fark var: envanter sayfası her
 * revalidate'te tazelenen içerik üretir, pazarlama sayfası statik kalır.
 *
 * `force-dynamic` YOK — bu rota public listede (bkz. lib/public-routes.ts) ve
 * nonce'suz CSP alıyor; statik/ISR üretilebilmesi SEO'nun ön koşulu.
 */
export const revalidate = 60;

const SITE = resolveSiteUrl();

const LIVE_METADATA: Metadata = {
  title: "Rothern — B2B pazar yeri: açık alım talepleri ve satılık ilanlar",
  description:
    "Firmaların açık alım taleplerini ve satılık ilanlarını inceleyin. Kapalı zarf teklif toplama, sipariş takibi ve firma keşfi tek panelde. Kaydolmak ücretsiz.",
  alternates: { canonical: `${SITE}/` },
  openGraph: {
    title: "Rothern — B2B pazar yeri",
    description:
      "Açık alım talepleri, satılık ilanlar ve doğrulanmış firmalar tek yerde.",
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

  // Dört çağrı paralel: biri düşerse diğerleri sayfayı taşımaya devam eder
  // (veri katmanı hata YUTAR ve boş döner — bkz. marketplace-api.ts).
  const [demands, offers, facets, products] = await Promise.all([
    fetchListings({ type: "ALIM", page: 1 }),
    fetchListings({ type: "SATIS", page: 1 }),
    fetchFacets(),
    fetchProducts({ page: 1 }),
  ]);

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
        urlTemplate: `${SITE}${MARKETPLACE_ROUTES.demands}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <div className="min-h-dvh bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <MarketingHeader />

      <main>
        <MarketplaceHero />

        <SectionGrid
          heading={MARKETPLACE_LABELS.demands}
          lead="Firmaların herkese açık yayımladığı, teklif bekleyen satın alma talepleri."
          href={MARKETPLACE_ROUTES.demands}
          hrefLabel="Tüm talepler"
          cards={demands.items.slice(0, 6).map((l) => (
            <ListingCard key={l.number} listing={l} />
          ))}
          emptyTitle="Şu an teklife açık bir alım talebi yok."
          emptyHint="Yeni talepler yayımlandıkça burada görünür. Kendi talebinizi açmak için ücretsiz hesap yeterli."
          emptyAction={{ label: "Talep aç", href: "/company/kayit" }}
        />

        <SectorGrid facets={facets} />

        <SectionGrid
          heading={MARKETPLACE_LABELS.offers}
          lead="Firmaların satışa açtığı ürün, malzeme ve hizmetler."
          href={MARKETPLACE_ROUTES.offers}
          hrefLabel="Tüm ilanlar"
          cards={offers.items.slice(0, 6).map((l) => (
            <ListingCard key={l.number} listing={l} />
          ))}
          emptyTitle="Şu an satılık ilan yok."
          emptyHint="Ürün ve hizmetlerinizi yayımlamak için ücretsiz hesap yeterli."
          emptyAction={{ label: "İlan aç", href: "/company/kayit" }}
        />

        <SectionGrid
          heading={MARKETPLACE_LABELS.products}
          lead="Firmaların vitrinlerindeki ürünler — süreli bir ilan değil, kalıcı katalog."
          href={MARKETPLACE_ROUTES.products}
          hrefLabel="Tüm ürünler"
          cards={products.items.slice(0, 6).map((p) => (
            <ProductCard
              key={`${p.company.slug}/${p.slug}`}
              companySlug={p.company.slug}
              companyName={p.company.name}
              companyCity={p.company.city}
              product={p}
              priceGated
            />
          ))}
          emptyTitle="Şu an yayımlanmış ürün yok."
          emptyHint="Firmalar vitrinlerini doldurdukça ürünler burada görünür."
          emptyAction={{ label: "Vitrin aç", href: "/company/kayit" }}
        />

        <TrustBand />
      </main>

      <MarketplaceFooter />
    </div>
  );
}
